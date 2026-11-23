-- Future in-app activity only. No email sending, history backfill or business deletion.
BEGIN;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_txid bigint DEFAULT txid_current();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_record text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_once ON public.notifications(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_recipient_time ON public.notifications(target_user_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.cf_notification_role(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE lower(replace(replace(trim(value),'-','_'),' ','_'))
 WHEN 'admin' THEN 'super_admin' WHEN 'superadmin' THEN 'super_admin'
 WHEN 'project_manager' THEN 'pm' WHEN 'manager' THEN 'pm'
 WHEN 'sitemanager' THEN 'site_manager' ELSE lower(replace(replace(trim(value),'-','_'),' ','_')) END;
$$;

CREATE OR REPLACE FUNCTION public.cf_role_activity_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; oldr jsonb; project uuid; project_name text; record text; person uuid; receiver uuid;
 roles text[]:=ARRAY['super_admin','pm','site_manager']; direct uuid[]:='{}'; recipient record;
 category text; heading text; body text; verb text; path text; base text; key text; project_for_notice uuid;
 order_id uuid; worker_person uuid; fields text[]; global_roles boolean:=false; deleted_project text:=current_setting('cf.deleting_project',true);
BEGIN
 IF TG_OP='DELETE' THEN r:=to_jsonb(OLD); ELSE r:=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' THEN oldr:=to_jsonb(OLD); ELSE oldr:='{}'; END IF;
 IF TG_OP='UPDATE' THEN
  SELECT array_agg(k) INTO fields FROM jsonb_object_keys(r||oldr) keys(k)
  WHERE r->k IS DISTINCT FROM oldr->k AND k NOT IN ('updated_at','created_at','last_seen','last_login','read_at','is_read','spent_cost','expo_push_token','push_token','fcm_token');
  IF fields IS NULL THEN RETURN NEW; END IF;
 END IF;
 project:=nullif(r->>'project_id','')::uuid;
 IF TG_TABLE_NAME='projects' THEN project:=nullif(r->>'id','')::uuid; END IF;
 IF project IS NULL AND nullif(r->>'site_id','') IS NOT NULL THEN
  SELECT project_id INTO project FROM public.sites WHERE id=(r->>'site_id')::uuid;
 END IF;
 IF project IS NULL AND nullif(r->>'milestone_id','') IS NOT NULL THEN
  SELECT project_id INTO project FROM public.milestones WHERE id=(r->>'milestone_id')::uuid;
 END IF;
 order_id:=coalesce(nullif(r->>'order_id',''),nullif(r->>'purchase_order_id',''))::uuid;
 IF project IS NULL AND order_id IS NOT NULL THEN SELECT project_id INTO project FROM public.purchase_orders WHERE id=order_id; END IF;
 IF project IS NULL AND nullif(r->>'material_id','') IS NOT NULL THEN
  SELECT project_id INTO project FROM public.materials WHERE id=(r->>'material_id')::uuid;
 END IF;
 IF project IS NOT NULL AND deleted_project=project::text AND TG_TABLE_NAME<>'projects' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 SELECT name INTO project_name FROM public.projects WHERE id=project;
 project_name:=coalesce(project_name,r->>'name','your project');
 record:=coalesce(r->>'id',concat_ws(':',r->>'user_id',r->>'worker_id',r->>'project_id',r->>'role'));
 verb:=CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'removed' ELSE 'updated' END;
 CASE
 WHEN TG_TABLE_NAME IN ('profiles','username_accounts') THEN
  IF TG_TABLE_NAME='username_accounts' AND TG_OP<>'UPDATE' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  category:='account';roles:=ARRAY['super_admin'];
  person:=coalesce(nullif(r->>'user_id',''),nullif(r->>'id',''))::uuid;direct:=array_append(direct,person);
  heading:=CASE WHEN TG_TABLE_NAME='username_accounts' THEN 'Account recovery updated'
    WHEN TG_OP='INSERT' AND coalesce((r->>'is_approved')::boolean,false)=false THEN 'New account awaits approval'
    WHEN TG_OP='UPDATE' AND oldr->>'is_approved' IS DISTINCT FROM r->>'is_approved' AND r->>'is_approved'='true' THEN 'Account approved'
    ELSE 'Account '||verb END;
  IF TG_TABLE_NAME='profiles' AND public.cf_notification_role(r->>'role')='worker' AND TG_OP='UPDATE'
   AND fields&&ARRAY['daily_rate','worker_type'] THEN
   SELECT w.project_id INTO project FROM public.site_workers w WHERE w.worker_id=person
    OR w.worker_id IN(SELECT id FROM public.workers WHERE user_id=person) LIMIT 1;
   roles:=ARRAY['super_admin','pm','site_manager'];category:='workforce';heading:='Worker pay terms updated';
  END IF;
 WHEN TG_TABLE_NAME='staff_compensation' THEN
  category:='staff_salary';roles:=ARRAY['super_admin'];direct:=array_append(direct,(r->>'user_id')::uuid);heading:='Monthly salary rate '||verb;
 WHEN TG_TABLE_NAME='salary_slips' THEN
  category:='payroll';roles:=ARRAY['super_admin','pm'];
  worker_person:=nullif(r->>'worker_id','')::uuid;
  SELECT user_id INTO person FROM public.workers WHERE id=worker_person;
  direct:=array_append(direct,coalesce(person,worker_person));
  IF r->>'pay_basis'='monthly' THEN category:='staff_salary';roles:=ARRAY['super_admin']; END IF;
  heading:=CASE WHEN r->>'status'='Paid' THEN 'Salary payment recorded' WHEN TG_OP='INSERT' THEN 'New payslip available' ELSE 'Payslip '||verb END;
 WHEN TG_TABLE_NAME IN ('client_messages','messages') THEN
  category:='message';heading:='New message';
  IF TG_OP<>'INSERT' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  receiver:=nullif(r->>'receiver_id','')::uuid;
  IF receiver IS NOT NULL THEN roles:='{}';direct:=ARRAY[receiver];
  ELSE roles:=ARRAY[public.cf_notification_role(r->>'receiver_role')]; END IF;
 WHEN TG_TABLE_NAME='projects' THEN
  category:='project';roles:=ARRAY['super_admin','pm','site_manager','client'];heading:='Project '||verb;
  direct:=ARRAY[nullif(r->>'pm_id','')::uuid,nullif(r->>'client_id','')::uuid];
  IF TG_OP='DELETE' AND deleted_project=project::text THEN
   direct:=direct||ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(nullif(current_setting('cf.deleting_project_recipients',true),''),'[]')::jsonb));
  END IF;
 WHEN TG_TABLE_NAME IN ('project_role_assignments','site_workers','site_manager_sites','pm_projects','project_suppliers','project_admins') THEN
  category:='assignment';heading:='Project assignment '||verb;
  person:=coalesce(nullif(r->>'user_id',''),nullif(r->>'worker_id',''),nullif(r->>'site_manager_id',''),nullif(r->>'pm_id',''),nullif(r->>'supplier_id',''),nullif(r->>'admin_id',''))::uuid;
  SELECT user_id INTO worker_person FROM public.workers WHERE id=person;
  person:=coalesce(worker_person,person);direct:=array_append(direct,person);
 WHEN TG_TABLE_NAME IN ('attendance','attendance_reviews') THEN
  category:='attendance';heading:='Attendance '||verb;
  IF TG_TABLE_NAME='attendance' THEN
   person:=nullif(r->>'worker_id','')::uuid;SELECT user_id INTO worker_person FROM public.workers WHERE id=person;
   direct:=array_append(direct,coalesce(worker_person,person));
   IF nullif(r->>'reviewed_at','') IS NOT NULL AND oldr->>'reviewed_at' IS DISTINCT FROM r->>'reviewed_at' THEN heading:='Attendance approved';
   ELSIF nullif(r->>'checkout_corrected_at','') IS NOT NULL AND oldr->>'checkout_corrected_at' IS DISTINCT FROM r->>'checkout_corrected_at' THEN heading:='Attendance corrected';
   ELSIF nullif(r->>'check_out_time','') IS NOT NULL THEN heading:='Attendance check-out recorded';
   ELSIF nullif(r->>'check_in_time','') IS NOT NULL THEN heading:='Attendance check-in recorded'; END IF;
  END IF;
 WHEN TG_TABLE_NAME IN ('purchase_orders','delivery_receipts') THEN
  category:='order';heading:=CASE WHEN TG_TABLE_NAME='delivery_receipts' THEN 'Goods receipt recorded' ELSE 'Purchase order '||verb END;
  IF TG_TABLE_NAME='purchase_orders' THEN order_id:=nullif(r->>'id','')::uuid;person:=nullif(r->>'supplier_id','')::uuid;
  ELSE SELECT supplier_id INTO person FROM public.purchase_orders WHERE id=order_id; END IF;
  SELECT id INTO person FROM public.profiles WHERE id=person AND public.cf_notification_role(role)='supplier';
  direct:=array_append(direct,person);
 WHEN TG_TABLE_NAME='material_requests' THEN
  category:='materials';heading:='Material request '||verb;
  direct:=ARRAY[nullif(r->>'requested_by','')::uuid,nullif(r->>'created_by','')::uuid];
 WHEN TG_TABLE_NAME='project_expenses' THEN category:='expense';heading:='Project expense '||verb;
 WHEN TG_TABLE_NAME IN ('milestones','milestone_media','milestone_notes') THEN
  category:='milestone';roles:=ARRAY['super_admin','pm','site_manager','client'];heading:='Project milestone '||verb;
 WHEN TG_TABLE_NAME IN ('client_payment_schedule','variation_orders','invoices') THEN
  category:='finance';roles:=ARRAY['super_admin','pm','client'];heading:=CASE TG_TABLE_NAME WHEN 'variation_orders' THEN 'Project variation ' WHEN 'invoices' THEN 'Invoice ' ELSE 'Project payment ' END||verb;
 WHEN TG_TABLE_NAME='shared_documents' THEN
  category:='document';roles:=ARRAY['super_admin','pm','site_manager','client'];heading:='Project document '||verb;
 WHEN TG_TABLE_NAME IN ('estimations','cost_estimates') THEN
  category:='estimate';roles:=ARRAY['super_admin','pm','client'];heading:='Project estimate '||verb;
 WHEN TG_TABLE_NAME IN ('project_boq_revisions','project_boq_worker_rates','project_boq_lines') THEN
  category:='boq';roles:=ARRAY['super_admin','pm','site_manager','client'];heading:='Project BOQ '||verb;
  IF TG_TABLE_NAME='project_boq_worker_rates' THEN roles:=ARRAY['super_admin','pm'];direct:=ARRAY[nullif(r->>'worker_id','')::uuid]; END IF;
 WHEN TG_TABLE_NAME='issues' THEN category:='issue';heading:='Project issue '||verb;direct:=ARRAY[nullif(r->>'assigned_to','')::uuid,nullif(r->>'reported_by','')::uuid,nullif(r->>'created_by','')::uuid];
 WHEN TG_TABLE_NAME IN ('site_reports','photos','project_photos') THEN category:='report';roles:=ARRAY['super_admin','pm','site_manager','client'];heading:='Site progress '||verb;
 WHEN TG_TABLE_NAME IN ('materials','inventory_logs','site_materials') THEN category:='inventory';heading:='Project inventory '||verb;
 WHEN TG_TABLE_NAME IN ('sites','project_locations') THEN
  category:='project';roles:=ARRAY['super_admin','pm','site_manager','client','worker'];heading:='Project site '||verb;
 WHEN TG_TABLE_NAME IN ('workers','worker_details') THEN
  category:='workforce';heading:='Worker details '||verb;direct:=ARRAY[nullif(r->>'user_id','')::uuid];
 WHEN TG_TABLE_NAME='clients' THEN category:='project';roles:=ARRAY['super_admin','pm','client'];heading:='Client details '||verb;
 WHEN TG_TABLE_NAME='suppliers' THEN category:='account';roles:=ARRAY['super_admin'];heading:='Supplier details '||verb;
  person:=coalesce(nullif(r->>'user_id',''),nullif(r->>'profile_id',''),nullif(r->>'id',''))::uuid;direct:=ARRAY[person];
 WHEN TG_TABLE_NAME='material_catalog' THEN category:='inventory';roles:=ARRAY['super_admin','pm'];global_roles:=true;heading:='Material catalogue '||verb;
 ELSE IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END CASE;
 body:=CASE WHEN category='message' THEN 'You have a new message. Open your inbox to view it.'
 WHEN category IN ('staff_salary','payroll') THEN 'Your payroll records have an update. Open the salary page for the details.'
 WHEN category='account' THEN 'Account details or approval status changed. Open the account page for the details.'
 ELSE heading||' for '||project_name||'. Open the related page to review it.' END;
 FOR recipient IN SELECT DISTINCT p.id,public.cf_notification_role(p.role) role FROM public.profiles p
 WHERE p.is_approved IS TRUE AND coalesce(to_jsonb(p)->>'is_active','true')<>'false'
 AND (p.id=ANY(direct) OR (public.cf_notification_role(p.role)=ANY(roles) AND (
 global_roles OR public.cf_notification_role(p.role)='super_admin' OR (project IS NOT NULL AND (
 EXISTS(SELECT 1 FROM public.projects q WHERE q.id=project AND (q.pm_id=p.id OR q.client_id=p.id))
 OR EXISTS(SELECT 1 FROM public.project_role_assignments a WHERE a.project_id=project AND a.user_id=p.id)
 OR EXISTS(SELECT 1 FROM public.site_manager_sites s WHERE s.project_id=project AND s.site_manager_id=p.id)
 OR EXISTS(SELECT 1 FROM public.site_workers w WHERE w.project_id=project AND (w.worker_id=p.id OR w.worker_id IN(SELECT id FROM public.workers WHERE user_id=p.id)))
 ))))) LOOP
  IF recipient.role NOT IN ('super_admin','pm','site_manager','client','supplier','worker') THEN CONTINUE; END IF;
  IF category='message' AND recipient.id=nullif(r->>'sender_id','')::uuid THEN CONTINUE; END IF;
  IF category='assignment' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.notifications n
   WHERE n.event_txid=txid_current() AND n.source_table='projects' AND n.source_record=project::text AND n.target_user_id=recipient.id) THEN CONTINUE; END IF;
  base:='/'||CASE recipient.role WHEN 'super_admin' THEN 'admin' WHEN 'site_manager' THEN 'site-manager' ELSE recipient.role END;
  path:=base||'/dashboard';
  IF recipient.role IN ('super_admin','pm') THEN
   path:=CASE category
    WHEN 'account' THEN CASE WHEN recipient.role='super_admin' THEN '/admin/users/'||coalesce(person::text,recipient.id::text) ELSE base||'/profile' END
    WHEN 'staff_salary' THEN CASE WHEN recipient.role='super_admin' THEN '/admin/staff-payroll' ELSE '/pm/my-salary' END
    WHEN 'payroll' THEN base||'/payroll' WHEN 'attendance' THEN CASE WHEN recipient.role='super_admin' THEN '/admin/attendance' ELSE '/pm/labour' END
    WHEN 'workforce' THEN base||'/labour' WHEN 'message' THEN base||'/messages'
    WHEN 'order' THEN base||'/materials/orders/'||coalesce(order_id::text,'')
    WHEN 'materials' THEN base||'/materials' WHEN 'inventory' THEN base||'/materials'
    WHEN 'estimate' THEN CASE WHEN recipient.role='super_admin' THEN '/admin/estimator' ELSE '/pm/ai-estimator' END
    ELSE CASE WHEN project IS NULL OR (TG_TABLE_NAME='projects' AND TG_OP='DELETE') THEN base||'/projects'
     ELSE base||'/projects/'||project::text||CASE category WHEN 'expense' THEN '/expenses' WHEN 'milestone' THEN '/milestones' WHEN 'finance' THEN '/commercial' WHEN 'document' THEN '/documents' WHEN 'issue' THEN '/issues' WHEN 'report' THEN '/reports' WHEN 'boq' THEN '/boq' ELSE '' END END END;
  ELSIF recipient.role='site_manager' THEN
   path:=base||CASE category WHEN 'staff_salary' THEN '/my-salary' WHEN 'message' THEN '/messages' WHEN 'attendance' THEN '/attendance' WHEN 'payroll' THEN '/team' WHEN 'workforce' THEN '/team' WHEN 'order' THEN '/materials' WHEN 'materials' THEN '/materials' WHEN 'inventory' THEN '/materials' WHEN 'boq' THEN '/materials' WHEN 'milestone' THEN '/milestones' WHEN 'issue' THEN '/issues' WHEN 'report' THEN '/reports' WHEN 'account' THEN '/profile' WHEN 'expense' THEN '/projects/'||project::text||'/expenses' ELSE '/dashboard' END;
  ELSIF recipient.role='worker' THEN path:=base||CASE category WHEN 'payroll' THEN '/payroll' WHEN 'attendance' THEN '/attendance' WHEN 'message' THEN '/messages' WHEN 'account' THEN '/profile' WHEN 'workforce' THEN '/profile' WHEN 'boq' THEN '/payroll' ELSE '/site' END;
  ELSIF recipient.role='supplier' THEN path:=base||CASE category WHEN 'order' THEN '/orders/'||coalesce(order_id::text,'') WHEN 'message' THEN '/messages' WHEN 'account' THEN '/profile' ELSE '/dashboard' END;
  ELSIF recipient.role='client' THEN path:=base||CASE category WHEN 'finance' THEN '/invoices' WHEN 'message' THEN '/messages' WHEN 'document' THEN '/documents' WHEN 'estimate' THEN '/project/estimates' WHEN 'issue' THEN '/issues' WHEN 'account' THEN '/profile' ELSE '/project' END;
  END IF;
  IF TG_OP='DELETE' AND category='order' THEN
   path:=base||CASE WHEN recipient.role IN ('super_admin','pm') THEN '/materials/orders' WHEN recipient.role='supplier' THEN '/orders' ELSE '/materials' END;
  ELSIF TG_OP='DELETE' AND category='account' AND recipient.role='super_admin' THEN path:='/admin/users';
  ELSIF TG_OP='DELETE' AND category='assignment' AND recipient.id=ANY(direct) AND recipient.role IN ('super_admin','pm') THEN path:=base||'/projects';
  END IF;
  project_for_notice:=project;
  -- Personal salary/assignment messages remain visible after transfers/removals.
  IF category IN ('account','staff_salary','payroll','assignment','message') OR (TG_TABLE_NAME='projects' AND TG_OP='DELETE') THEN project_for_notice:=NULL; END IF;
  key:=txid_current()::text||':'||CASE WHEN category='assignment' THEN 'assignment:'||project::text||':'||coalesce(person::text,'') ELSE TG_TABLE_NAME||':'||CASE WHEN TG_TABLE_NAME IN ('project_boq_lines','inventory_logs','site_materials') AND project IS NOT NULL THEN project::text ELSE record END END||':'||TG_OP||':'||recipient.id::text;
  INSERT INTO public.notifications(user_id,target_user_id,target_role,project_id,title,message,type,is_read,link,event_key,event_txid,source_table,source_record)
  VALUES(auth.uid(),recipient.id,recipient.role,project_for_notice,heading,body,'general',false,path,key,txid_current(),TG_TABLE_NAME,record)
  ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO UPDATE SET title=excluded.title,message=excluded.message,link=excluded.link;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Suppress legacy SQL copies when the transactional engine already notified that recipient.
CREATE OR REPLACE FUNCTION public.cf_deduplicate_legacy_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.event_key IS NULL AND NEW.project_id IS NOT NULL AND coalesce(NEW.type,'general')='general'
 AND EXISTS(SELECT 1 FROM public.notifications n WHERE n.event_key IS NOT NULL AND n.event_txid=txid_current()
  AND (n.project_id=NEW.project_id OR n.source_record=NEW.project_id::text)
  AND ((NEW.target_user_id IS NOT NULL AND n.target_user_id=NEW.target_user_id)
    OR (NEW.target_user_id IS NULL AND n.target_role=public.cf_notification_role(NEW.target_role)))) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cf_deduplicate_legacy_notification ON public.notifications;
CREATE TRIGGER cf_deduplicate_legacy_notification BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.cf_deduplicate_legacy_notification();

CREATE OR REPLACE FUNCTION public.cf_notification_engine_ready() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.get_own_notification_feed(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(item ORDER BY stamp DESC,seq DESC) FROM (
   SELECT to_jsonb(n)||jsonb_build_object('is_read',r.user_id IS NOT NULL) item,n.created_at stamp,n.id seq
   FROM public.notifications n LEFT JOIN public.notification_receipts r ON r.notification_id=n.id AND r.user_id=auth.uid()
   WHERE auth.uid() IS NOT NULL AND public.cf_notification_visible(n.target_user_id,n.target_role,n.project_id)
   ORDER BY n.created_at DESC,n.id DESC LIMIT 50 OFFSET greatest(coalesce(p_offset,0),0)
  ) latest),'[]'::jsonb),
  'unread_count',(SELECT count(*) FROM public.notifications n WHERE auth.uid() IS NOT NULL
   AND public.cf_notification_visible(n.target_user_id,n.target_role,n.project_id)
   AND NOT EXISTS(SELECT 1 FROM public.notification_receipts r WHERE r.notification_id=n.id AND r.user_id=auth.uid())),
  'total_count',(SELECT count(*) FROM public.notifications n WHERE auth.uid() IS NOT NULL
   AND public.cf_notification_visible(n.target_user_id,n.target_role,n.project_id)));
$$;
REVOKE ALL ON FUNCTION public.get_own_notification_feed(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_own_notification_feed(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.cf_notification_engine_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_notification_engine_ready() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.cf_notification_role(text),public.cf_role_activity_notification(),public.cf_deduplicate_legacy_notification() FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['projects','profiles','workers','worker_details','sites','project_locations',
 'username_accounts','staff_compensation','project_role_assignments','pm_projects','site_workers','site_manager_sites','project_suppliers','project_admins',
 'attendance','attendance_reviews','salary_slips','purchase_orders','delivery_receipts','material_requests','project_expenses',
 'milestones','milestone_media','milestone_notes','shared_documents','client_payment_schedule','variation_orders','invoices',
 'estimations','cost_estimates','project_boq_revisions','project_boq_lines','project_boq_worker_rates','issues','site_reports','photos','project_photos',
 'materials','material_catalog','inventory_logs','site_materials','client_messages','messages','clients','suppliers'] LOOP
  IF to_regclass('public.'||target) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS cf_role_activity_notification ON public.%I',target);
   EXECUTE format('CREATE TRIGGER cf_role_activity_notification AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cf_role_activity_notification()',target);
  END IF;
 END LOOP;
END $$;
-- Ensure inserts reach subscribed role dashboards when Realtime is available.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(
 SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(
 SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notification_receipts') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_receipts;
 END IF;
END $$;
-- Deletion emits one project event, not notifications for every removed child.
CREATE OR REPLACE FUNCTION public.permanently_delete_project(p_project_id uuid,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; t record; fk record; childcols text; parentcols text;
 keycols text[]; inserted integer; additions integer; removed integer; progress integer; total integer:=0; attempts integer:=0;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'')<>'super_admin' THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_confirmation IS DISTINCT FROM project.name THEN RAISE EXCEPTION 'Type the exact project name to confirm permanent deletion' USING ERRCODE='23514'; END IF;
 PERFORM set_config('cf.deleting_project',p_project_id::text,true);
 PERFORM set_config('cf.deleting_project_recipients',(
  SELECT coalesce(jsonb_agg(DISTINCT person),'[]'::jsonb)::text FROM (
   SELECT pm_id person FROM public.projects WHERE id=p_project_id
   UNION SELECT client_id FROM public.projects WHERE id=p_project_id
   UNION SELECT user_id FROM public.project_role_assignments WHERE project_id=p_project_id
   UNION SELECT coalesce(w.user_id,s.worker_id) FROM public.site_workers s LEFT JOIN public.workers w ON w.id=s.worker_id WHERE s.project_id=p_project_id
   UNION SELECT site_manager_id FROM public.site_manager_sites WHERE project_id=p_project_id
   UNION SELECT pm_id FROM public.pm_projects WHERE project_id=p_project_id
  ) participants WHERE person IS NOT NULL),true);
 DROP TABLE IF EXISTS pg_temp.cf_delete_rows;
 CREATE TEMP TABLE cf_delete_rows(rel oid, row_key jsonb, PRIMARY KEY(rel,row_key)) ON COMMIT DROP;
 INSERT INTO pg_temp.cf_delete_rows VALUES('public.projects'::regclass,jsonb_build_object('id',p_project_id));
 -- Include legacy project links even if their schema has no foreign key.
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='project_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN('profiles','workers','audit_events','username_accounts','staff_compensation') LOOP
 EXECUTE format('INSERT INTO pg_temp.cf_delete_rows SELECT %s,to_jsonb(r) FROM public.%I r WHERE project_id=$1 ON CONFLICT DO NOTHING',t.oid,t.relname) USING p_project_id;
 END LOOP;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='site_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN('profiles','workers','audit_events','username_accounts','staff_compensation') LOOP
 EXECUTE format('INSERT INTO pg_temp.cf_delete_rows SELECT %s,to_jsonb(r) FROM public.%I r WHERE site_id IN(SELECT id FROM public.sites WHERE project_id=$1) ON CONFLICT DO NOTHING',t.oid,t.relname) USING p_project_id;
 END LOOP;
 LOOP
 additions:=0;
 FOR fk IN SELECT c.*,cl.relname AS child,pa.relname AS parent FROM pg_constraint c
 JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
 JOIN pg_class pa ON pa.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pa.relnamespace
 WHERE c.contype='f' AND ns.nspname='public' AND pn.nspname='public' AND cl.relkind='r'
 AND cl.relname NOT IN('profiles','workers','audit_events','username_accounts','staff_compensation') LOOP
 SELECT string_agg(format('c.%I',a.attname),',' ORDER BY k.ord) INTO childcols FROM unnest(fk.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.num;
 SELECT string_agg(format('p.%I',a.attname),',' ORDER BY k.ord) INTO parentcols FROM unnest(fk.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=k.num;
 EXECUTE format('INSERT INTO pg_temp.cf_delete_rows SELECT %s,to_jsonb(c) FROM public.%I c WHERE (%s) IN (SELECT %s FROM public.%I p JOIN pg_temp.cf_delete_rows d ON d.rel=%s AND to_jsonb(p) @> d.row_key) ON CONFLICT DO NOTHING',fk.conrelid,fk.child,childcols,parentcols,fk.parent,fk.confrelid);
 GET DIAGNOSTICS inserted=ROW_COUNT; additions:=additions+inserted;
 END LOOP;
 EXIT WHEN additions=0;
 END LOOP;
 -- Reduce snapshots to stable primary keys; ledger triggers may update other fields.
 FOR t IN SELECT DISTINCT d.rel,c.relname FROM pg_temp.cf_delete_rows d JOIN pg_class c ON c.oid=d.rel LOOP
 SELECT array_agg(a.attname) INTO keycols FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=t.rel AND i.indisprimary;
 IF keycols IS NOT NULL THEN UPDATE pg_temp.cf_delete_rows SET row_key=(SELECT jsonb_object_agg(key,value) FROM jsonb_each(row_key) WHERE key=ANY(keycols)) WHERE rel=t.rel; END IF;
 END LOOP;
 UPDATE public.workers SET site_id=NULL WHERE site_id IN(SELECT id FROM public.sites WHERE project_id=p_project_id);
 LOOP
 attempts:=attempts+1;
 IF attempts>100 THEN RAISE EXCEPTION 'Project dependencies could not be resolved. No project records were deleted.'; END IF;
 progress:=0;
 FOR t IN SELECT DISTINCT d.rel,c.relname FROM pg_temp.cf_delete_rows d JOIN pg_class c ON c.oid=d.rel ORDER BY c.relname LOOP
 IF t.rel='public.projects'::regclass THEN CONTINUE; END IF;
 BEGIN
 EXECUTE format('DELETE FROM public.%I r USING pg_temp.cf_delete_rows d WHERE d.rel=%s AND to_jsonb(r) @> d.row_key',t.relname,t.rel);
 GET DIAGNOSTICS removed=ROW_COUNT; progress:=progress+removed; total:=total+removed;
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 END LOOP;
 EXIT WHEN progress=0;
 END LOOP;
 -- Delete the project LAST: financial-history guards must see cleared children.
 BEGIN
 DELETE FROM public.projects WHERE id=p_project_id;
 GET DIAGNOSTICS removed=ROW_COUNT; total:=total+removed;
 EXCEPTION WHEN foreign_key_violation THEN
 RAISE EXCEPTION 'A linked record prevents deletion. No project records were deleted.';
 END;
 FOR t IN SELECT DISTINCT d.rel,c.relname FROM pg_temp.cf_delete_rows d JOIN pg_class c ON c.oid=d.rel LOOP
 EXECUTE format('SELECT count(*) FROM public.%I r JOIN pg_temp.cf_delete_rows d ON d.rel=%s AND to_jsonb(r) @> d.row_key',t.relname,t.rel) INTO removed;
 IF removed>0 THEN RAISE EXCEPTION 'A linked record prevents deletion. No project records were deleted.'; END IF;
 END LOOP;
 RETURN jsonb_build_object('status','deleted','message',format('Project %s permanently deleted',project.name),'deleted_rows',total);
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_project(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_project(uuid,text) TO authenticated;


COMMIT;
