-- Transactional change history. Apply after the existing workflow migrations.
-- Records future committed changes only; does not backfill or delete business data.
BEGIN;
CREATE TABLE IF NOT EXISTS public.audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 actor_id uuid, actor_role text NOT NULL,
 table_name text NOT NULL, action text NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),
 record_id text, project_id uuid,
 changed_fields text[] NOT NULL DEFAULT '{}',
 before_data jsonb, after_data jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_time_idx ON public.audit_events(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_project_idx ON public.audit_events(project_id,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events(actor_id,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_table_idx ON public.audit_events(table_name,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON public.audit_events(action,id DESC);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.audit_events TO authenticated;
DROP POLICY IF EXISTS audit_events_admin_read ON public.audit_events;
CREATE POLICY audit_events_admin_read ON public.audit_events FOR SELECT TO authenticated
 USING (public.cf_current_role()='super_admin');

CREATE OR REPLACE FUNCTION public.cf_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE='42501'; END $$;
DROP TRIGGER IF EXISTS audit_events_immutable ON public.audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON public.audit_events
 FOR EACH ROW EXECUTE FUNCTION public.cf_audit_immutable();
DROP TRIGGER IF EXISTS audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON public.audit_events
 FOR EACH STATEMENT EXECUTE FUNCTION public.cf_audit_immutable();

CREATE OR REPLACE FUNCTION public.cf_audit_snapshot(payload jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(coalesce(payload,'{}'::jsonb))
 WHERE key=ANY(ARRAY['id','project_id','site_id','worker_id','user_id','pm_id','client_id','supplier_id',
 'material_id','boq_item_id','order_id','request_id','milestone_id','document_id','approved_by',
 'assigned_at','role','is_approved','is_test','status','completion_percentage',
 'total_budget','spent_cost','start_date','end_date','period_start','period_end','date',
 'check_in_time','check_out_time','hours_worked','overtime_hours','total_days','daily_rate',
 'basic_pay','overtime_pay','deductions','total_amount','total_pay','amount','quantity',
 'quantity_ordered','quantity_received','quantity_used','unit','unit_price','total_price',
 'current_stock','minimum_threshold','boq_revision','revision','rate_source','allocated_budget',
 'due_date','expected_date','received_at','received_by','paid_at','paid_by','verified_at',
 'verified_by','reviewed_at','reviewed_by','created_at','updated_at','logged_at','logged_by',
 'action','active','kind']);
$$;

CREATE OR REPLACE FUNCTION public.cf_capture_audit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; following jsonb; row_data jsonb; fields text[]; project uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN previous:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN following:=to_jsonb(NEW); END IF;
 IF previous IS NOT DISTINCT FROM following THEN RETURN NEW; END IF;
 SELECT coalesce(array_agg(key ORDER BY key),'{}'::text[]) INTO fields FROM (
  SELECT key FROM jsonb_object_keys(coalesce(previous,'{}')||coalesce(following,'{}')) AS keys(key)
  WHERE previous->key IS DISTINCT FROM following->key
 ) changed;
 row_data:=coalesce(following,previous);
 IF TG_TABLE_NAME='projects' THEN project:=nullif(row_data->>'id','')::uuid;
 ELSE project:=nullif(row_data->>'project_id','')::uuid;
 END IF;
 IF project IS NULL AND nullif(row_data->>'site_id','') IS NOT NULL AND to_regclass('public.sites') IS NOT NULL THEN
  SELECT project_id INTO project FROM public.sites WHERE id=(row_data->>'site_id')::uuid;
 END IF;
 INSERT INTO public.audit_events(actor_id,actor_role,table_name,action,record_id,project_id,changed_fields,before_data,after_data)
 VALUES(auth.uid(),coalesce(public.cf_current_role(),auth.role(),'database'),TG_TABLE_NAME,TG_OP,
  coalesce(row_data->>'id',row_data->>'user_id',row_data->>'worker_id'),project,fields,
  CASE WHEN previous IS NOT NULL THEN public.cf_audit_snapshot(previous) END,
  CASE WHEN following IS NOT NULL THEN public.cf_audit_snapshot(following) END);
 -- No exception swallowing: failed audit storage rolls back the business write.
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['projects','profiles','workers','worker_details','sites',
 'project_role_assignments','pm_projects','site_workers','site_manager_sites',
 'milestones','materials','material_catalog','material_requests','purchase_orders',
 'project_expenses','salary_slips','attendance','attendance_reviews','delivery_receipts','client_payment_schedule',
 'variation_orders','project_boq_revisions','project_boq_worker_rates','estimations',
 'issues','site_reports','shared_documents','inventory_logs','milestone_media','milestone_notes',
 'project_locations','site_materials','cost_estimates'] LOOP
 IF to_regclass('public.'||target) IS NOT NULL THEN
  EXECUTE format('DROP TRIGGER IF EXISTS cf_change_audit ON public.%I',target);
  EXECUTE format('CREATE TRIGGER cf_change_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cf_capture_audit_event()',target);
 END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.cf_audit_immutable(),public.cf_audit_snapshot(jsonb),public.cf_capture_audit_event()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
