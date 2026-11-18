-- Run after all 20261117 workflow/role-boundary migrations. No business records deleted.
BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS boq_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.project_boq_lines(
 project_id uuid NOT NULL REFERENCES public.projects(id), id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('work','material','labour')), description text NOT NULL,
 stage text, unit text, quantity numeric NOT NULL DEFAULT 0 CHECK(quantity>=0),
 rate numeric NOT NULL DEFAULT 0 CHECK(rate>=0), amount numeric NOT NULL DEFAULT 0 CHECK(amount>=0),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(project_id,id)
);
CREATE TABLE IF NOT EXISTS public.project_boq_revisions(
 project_id uuid NOT NULL REFERENCES public.projects(id), revision integer NOT NULL,
 boq_data jsonb NOT NULL, reason text NOT NULL, changed_by uuid REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,revision)
);
CREATE TABLE IF NOT EXISTS public.project_boq_worker_rates(
 project_id uuid NOT NULL REFERENCES public.projects(id),worker_id uuid NOT NULL REFERENCES public.profiles(id),
 daily_rate numeric NOT NULL CHECK(daily_rate>=0 AND daily_rate::text NOT IN ('NaN','Infinity','-Infinity')),PRIMARY KEY(project_id,worker_id)
);
ALTER TABLE public.project_boq_worker_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_boq_worker_rates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_boq_worker_rates TO authenticated;
DROP POLICY IF EXISTS boq_worker_rates_read ON public.project_boq_worker_rates;
CREATE POLICY boq_worker_rates_read ON public.project_boq_worker_rates FOR SELECT TO authenticated USING(public.cf_can_manage_project(project_id) OR (public.cf_current_role()='worker' AND worker_id=auth.uid()));
ALTER TABLE public.project_boq_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_boq_lines,public.project_boq_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_boq_lines,public.project_boq_revisions TO authenticated;
DROP POLICY IF EXISTS boq_lines_read ON public.project_boq_lines;
CREATE POLICY boq_lines_read ON public.project_boq_lines FOR SELECT TO authenticated
 USING(public.cf_current_role() IN ('super_admin','pm','client') AND public.cf_project_access(project_id));
DROP POLICY IF EXISTS boq_revision_read ON public.project_boq_revisions;
CREATE POLICY boq_revision_read ON public.project_boq_revisions FOR SELECT TO authenticated
 USING(public.cf_can_manage_project(project_id));
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.client_payment_schedule ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.variation_orders ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS boq_stage text;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS allocated_budget numeric NOT NULL DEFAULT 0;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS rate_source text;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS boq_revision integer;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['materials','material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders','salary_slips'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=t||'_boq_project_fk') THEN
 EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(project_id,boq_item_id) REFERENCES public.project_boq_lines(project_id,id)',t,t||'_boq_project_fk');
 END IF;
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(project_id,boq_item_id)',t||'_boq_lookup',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.cf_sync_boq(p_project_id uuid,p_boq jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_data jsonb; group_name text; kind_value text; line_id uuid; label text; qty numeric; price numeric; total numeric; cursor_date date; due date;
BEGIN
 -- Internal-only; callers lock and authorize the project before entering.
 UPDATE public.project_boq_lines SET active=false WHERE project_id=p_project_id;
 FOREACH group_name IN ARRAY ARRAY['items','materials','labour_rates'] LOOP
 kind_value:=CASE group_name WHEN 'items' THEN 'work' WHEN 'materials' THEN 'material' ELSE 'labour' END;
 FOR row_data IN SELECT value FROM jsonb_array_elements(coalesce(p_boq->group_name,'[]'::jsonb)) LOOP
 label:=coalesce(row_data->>'description',row_data->>'name',row_data->>'trade',row_data->>'role');
 line_id:=coalesce(nullif(row_data->>'id','')::uuid,md5(group_name||'|'||coalesce(row_data->>'activity_id',label)||'|'||coalesce(row_data->>'unit',''))::uuid);
 qty:=coalesce((row_data->>'allocated_quantity')::numeric,(row_data->>'quantity')::numeric,0);
 price:=coalesce((row_data->>'daily_rate')::numeric,(row_data->>'unit_price')::numeric,(row_data->>'rate')::numeric,0);
 total:=CASE WHEN kind_value='work' THEN coalesce((row_data->>'amount')::numeric,qty*price) ELSE qty*price END;
 IF EXISTS(SELECT 1 FROM public.project_boq_lines WHERE project_id=p_project_id AND id=line_id AND kind<>kind_value) THEN RAISE EXCEPTION 'A BOQ item cannot change its item type'; END IF;
 IF nullif(trim(label),'') IS NULL OR qty<0 OR price<0 OR total<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') OR total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ line'; END IF;
 INSERT INTO public.project_boq_lines(project_id,id,kind,description,stage,unit,quantity,rate,amount,active)
 VALUES(p_project_id,line_id,kind_value,label,row_data->>'stage',row_data->>'unit',qty,price,total,true)
 ON CONFLICT(project_id,id) DO UPDATE SET description=excluded.description,stage=excluded.stage,unit=excluded.unit,
 quantity=excluded.quantity,rate=excluded.rate,amount=excluded.amount,active=true;
 END LOOP;
 END LOOP;
 -- Update planning fields only. Never change on-hand stock or its received-cost valuation.
 IF EXISTS(SELECT 1 FROM public.materials m JOIN public.project_boq_lines b ON b.project_id=m.project_id AND b.id=m.boq_item_id
 WHERE m.project_id=p_project_id AND lower(trim(m.unit)) IS DISTINCT FROM lower(trim(b.unit)) AND
 (coalesce(m.current_stock,0)<>0 OR EXISTS(SELECT 1 FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id))) THEN RAISE EXCEPTION 'A material with stock or orders cannot change units; add a separate BOQ material'; END IF;
 UPDATE public.materials m SET boq_item_id=b.id,quantity=b.quantity::text,name=b.description,unit=b.unit
 FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.active AND b.kind='material'
 AND m.project_id=b.project_id AND (m.boq_item_id=b.id OR (m.boq_item_id IS NULL AND lower(trim(m.name))=lower(trim(b.description)) AND lower(trim(m.unit))=lower(trim(b.unit))));
 INSERT INTO public.materials(id,project_id,name,unit,current_stock,minimum_threshold,quantity,unit_price,category,status,boq_item_id)
 SELECT gen_random_uuid(),p_project_id,b.description,b.unit,0,greatest(10,round(b.quantity*0.1)),b.quantity::text,0,'General','Pending Order',b.id
 FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.active AND b.kind='material'
 AND NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND boq_item_id=b.id);
 SELECT coalesce(start_date,current_date) INTO cursor_date FROM public.projects WHERE id=p_project_id;
 FOR row_data IN SELECT value FROM jsonb_array_elements(coalesce(p_boq->'milestones','[]'::jsonb)) LOOP
 label:=coalesce(row_data->>'boq_stage',row_data->>'title');
 IF NOT (p_boq->'stage_budgets' ? label) THEN CONTINUE; END IF;
 SELECT due_date INTO due FROM public.milestones WHERE project_id=p_project_id AND (boq_stage=label OR title=label) LIMIT 1;
 IF NOT FOUND THEN
 due:=coalesce(nullif(row_data->>'due_date','')::date,cursor_date+greatest(1,coalesce((row_data->>'duration_days')::integer,21)));
 INSERT INTO public.milestones(id,project_id,title,description,due_date,planned_date,status,completion_percentage,boq_stage,allocated_budget)
 VALUES(gen_random_uuid(),p_project_id,row_data->>'title',coalesce(row_data->>'description',''),due,due,'Pending',0,label,(p_boq->'stage_budgets'->>label)::numeric);
 END IF;
 cursor_date:=greatest(due,cursor_date);
 END LOOP;
 UPDATE public.milestones m SET allocated_budget=coalesce((p_boq->'stage_budgets'->>m.boq_stage)::numeric,0)
 WHERE m.project_id=p_project_id AND m.boq_stage IS NOT NULL;
 UPDATE public.milestones m SET boq_stage=coalesce(m.boq_stage,m.title),allocated_budget=(p_boq->'stage_budgets'->>coalesce(m.boq_stage,m.title))::numeric
 WHERE m.project_id=p_project_id AND p_boq->'stage_budgets' ? coalesce(m.boq_stage,m.title);
 UPDATE public.projects SET completion_percentage=(SELECT coalesce(round(sum(completion_percentage*allocated_budget)/nullif(sum(allocated_budget),0)),0)
 FROM public.milestones WHERE project_id=p_project_id AND boq_stage IS NOT NULL) WHERE id=p_project_id
 AND EXISTS(SELECT 1 FROM public.milestones WHERE project_id=p_project_id AND allocated_budget>0);
END $$;
REVOKE ALL ON FUNCTION public.cf_sync_boq(uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Preserve the existing atomic project/assignment/payload implementation.
DO $$ BEGIN
 IF to_regprocedure('public.cf_save_project_payload_before_boq(uuid,jsonb)') IS NULL THEN
 ALTER FUNCTION public.cf_save_project_payload(uuid,jsonb) RENAME TO cf_save_project_payload_before_boq;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.cf_save_project_payload(p_project_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE boq jsonb:=p_data->'boq_data'; rev integer; override_row jsonb; previous public.projects%ROWTYPE; baseline numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 IF jsonb_array_length(coalesce(boq->'items','[]'::jsonb))>20000 OR jsonb_array_length(coalesce(boq->'materials','[]'::jsonb))>1000 OR jsonb_array_length(coalesce(boq->'labour_rates','[]'::jsonb))>1000 THEN RAISE EXCEPTION 'BOQ exceeds the supported item limit'; END IF;
 IF coalesce((boq->>'items_count')::integer,0)>jsonb_array_length(coalesce(boq->'items','[]'::jsonb)) THEN RAISE EXCEPTION 'Upload the original complete BOQ; the stored data contains only a preview'; END IF;
 IF previous.boq_revision>0 AND ((p_data->>'boq_expected_revision')::integer IS DISTINCT FROM previous.boq_revision OR length(trim(coalesce(boq->>'revision_reason','')))<5) THEN RAISE EXCEPTION 'Use an audited BOQ revision with the current revision number'; END IF;
 baseline:=(boq->>'total_budget')::numeric;
 IF baseline IS NULL OR baseline<=0 OR baseline::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ total'; END IF;
 IF jsonb_array_length(coalesce(boq->'items','[]'::jsonb))>0 AND abs(baseline-(SELECT coalesce(sum((value->>'amount')::numeric),0) FROM jsonb_array_elements(boq->'items')))>0.01 THEN RAISE EXCEPTION 'BOQ total must equal its line amounts'; END IF;
 END IF;
 -- The legacy inserter must not create a second stock row when an existing BOQ
 -- material is renamed. Its stable link owns the existing stock identity.
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 p_data:=jsonb_set(p_data,'{boq_data,materials}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(coalesce(boq->'materials','[]'::jsonb))
 WHERE NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND boq_item_id=nullif(value->>'id','')::uuid)),'[]'::jsonb));
 END IF;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN p_data:=jsonb_set(p_data,'{boq_data}',(p_data->'boq_data')-'labour_overrides'); END IF;
 PERFORM public.cf_save_project_payload_before_boq(p_project_id,p_data);
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 FOR override_row IN SELECT value FROM jsonb_array_elements(coalesce(p_data->'milestones','[]'::jsonb)) LOOP
 IF boq->'stage_budgets' ? (override_row->>'boq_stage') THEN
 UPDATE public.milestones SET boq_stage=override_row->>'boq_stage' WHERE project_id=p_project_id AND title=override_row->>'title';
 END IF;
 END LOOP;
 UPDATE public.projects SET boq_data=boq-'labour_overrides' WHERE id=p_project_id;
 DELETE FROM public.project_boq_worker_rates WHERE project_id=p_project_id;
 FOR override_row IN SELECT value FROM jsonb_array_elements(coalesce(boq->'labour_overrides','[]'::jsonb)) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(override_row->>'worker_id')::uuid AND role='worker' AND is_approved IS TRUE) THEN RAISE EXCEPTION 'Choose an approved worker for project pay rates'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_role_assignments WHERE project_id=p_project_id AND user_id=(override_row->>'worker_id')::uuid AND role='worker')
 AND NOT EXISTS(SELECT 1 FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE sw.project_id=p_project_id AND coalesce(w.user_id,sw.worker_id)=(override_row->>'worker_id')::uuid) THEN RAISE EXCEPTION 'Worker rate override requires an assigned worker'; END IF;
 INSERT INTO public.project_boq_worker_rates(project_id,worker_id,daily_rate) VALUES(p_project_id,(override_row->>'worker_id')::uuid,(override_row->>'daily_rate')::numeric);
 END LOOP;
 PERFORM public.cf_sync_boq(p_project_id,boq);
 UPDATE public.projects SET boq_revision=boq_revision+1,total_budget=CASE WHEN p_data ? 'total_budget' THEN total_budget
 ELSE greatest(0,coalesce(total_budget,0)+baseline-coalesce((previous.boq_data->>'total_budget')::numeric,
 coalesce(previous.total_budget,0)-coalesce((SELECT sum(amount) FROM public.variation_orders WHERE project_id=p_project_id AND status='Approved'),0))) END
 WHERE id=p_project_id RETURNING boq_revision INTO rev;
 INSERT INTO public.project_boq_revisions(project_id,revision,boq_data,reason,changed_by)
 VALUES(p_project_id,rev,boq,coalesce(nullif(boq->>'revision_reason',''),'Project BOQ baseline'),auth.uid());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.cf_save_project_payload(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cf_save_project_payload_before_boq(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.revise_project_boq(p_project_id uuid,p_boq jsonb,p_expected_revision integer,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; new_baseline numeric; rev integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_expected_revision IS NULL OR project.boq_revision<>p_expected_revision THEN RAISE EXCEPTION 'BOQ changed. Reload before saving your revision'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Explain the BOQ revision'; END IF;
 new_baseline:=(p_boq->>'total_budget')::numeric;
 IF new_baseline IS NULL OR new_baseline<=0 OR new_baseline::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ total'; END IF;
 IF jsonb_array_length(coalesce(p_boq->'items','[]'::jsonb))>0 AND abs(new_baseline-(SELECT coalesce(sum((value->>'amount')::numeric),0) FROM jsonb_array_elements(p_boq->'items')))>0.01 THEN RAISE EXCEPTION 'BOQ total must equal its line amounts'; END IF;
 PERFORM public.cf_save_project_payload(p_project_id,jsonb_build_object('boq_expected_revision',p_expected_revision,'boq_data',p_boq||jsonb_build_object('revision_reason',p_reason)));
 -- Preserve approved variations and explicit project budget adjustments as a delta.
 SELECT boq_revision INTO rev FROM public.projects WHERE id=p_project_id;
 PERFORM public.refresh_project_spend(p_project_id);
 RETURN jsonb_build_object('ok',true,'revision',rev,'boq_data',p_boq);
END $$;
REVOKE ALL ON FUNCTION public.revise_project_boq(uuid,jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revise_project_boq(uuid,jsonb,integer,text) TO authenticated;

-- Old upload entry point cannot silently replace an already-established baseline.
CREATE OR REPLACE FUNCTION public.apply_project_boq(p_project_id uuid,p_boq jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rev integer;
BEGIN
 SELECT boq_revision INTO rev FROM public.projects WHERE id=p_project_id;
 IF coalesce(rev,0)>0 THEN RAISE EXCEPTION 'Use the BOQ workspace to review and save an audited revision'; END IF;
 RETURN public.revise_project_boq(p_project_id,p_boq,coalesce(rev,0),'Initial BOQ upload');
END $$;

CREATE OR REPLACE FUNCTION public.cf_guard_boq_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line public.project_boq_lines%ROWTYPE; found_id uuid; candidates integer; committed numeric; old_link uuid; stock_id uuid; actual_unit text;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN old_link:=OLD.boq_item_id; END IF;
 IF NEW.boq_item_id IS NULL AND TG_TABLE_NAME IN ('purchase_orders','project_expenses') THEN
 SELECT boq_item_id INTO found_id FROM public.materials WHERE id=nullif(to_jsonb(NEW)->>'material_id','')::uuid AND project_id=NEW.project_id;
 IF found_id IS NULL AND TG_TABLE_NAME='purchase_orders' THEN
 SELECT boq_item_id INTO found_id FROM public.material_requests WHERE id=nullif(to_jsonb(NEW)->>'request_id','')::uuid AND project_id=NEW.project_id;
 END IF;
 NEW.boq_item_id:=found_id;
 END IF;
 IF NEW.boq_item_id IS NULL AND TG_TABLE_NAME='material_requests' THEN
 SELECT count(*),(array_agg(id))[1] INTO candidates,found_id FROM public.project_boq_lines WHERE project_id=NEW.project_id AND active AND kind='material'
 AND lower(trim(description))=lower(trim(NEW.item_name)) AND lower(trim(unit))=lower(trim(NEW.unit));
 IF candidates=1 THEN NEW.boq_item_id:=found_id; END IF;
 END IF;
 IF NEW.boq_item_id IS NULL THEN
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND boq_revision>0) THEN
 RAISE EXCEPTION 'Choose a BOQ reference. Add an editable BOQ item first for work outside the current plan'; END IF;
 RETURN NEW; -- Existing unallocated records remain visible for explicit reconciliation.
 END IF;
 SELECT * INTO line FROM public.project_boq_lines WHERE project_id=NEW.project_id AND id=NEW.boq_item_id;
 IF NOT FOUND OR (NOT line.active AND (TG_OP='INSERT' OR old_link IS DISTINCT FROM NEW.boq_item_id)) THEN RAISE EXCEPTION 'Choose an active BOQ item from this project'; END IF;
 IF TG_TABLE_NAME IN ('material_requests','purchase_orders') AND line.kind<>'material' THEN RAISE EXCEPTION 'Choose a BOQ material baseline for procurement'; END IF;
 IF TG_TABLE_NAME IN ('client_payment_schedule','variation_orders') AND line.kind<>'work' THEN RAISE EXCEPTION 'Choose a BOQ work item for payments or variations'; END IF;
 IF TG_TABLE_NAME='purchase_orders' AND line.kind='material' AND to_jsonb(NEW)->>'status' NOT IN ('Cancelled','Rejected') THEN
 SELECT unit INTO actual_unit FROM public.materials WHERE id=NEW.material_id::uuid AND project_id=NEW.project_id;
 IF actual_unit IS NULL THEN SELECT unit INTO actual_unit FROM public.material_catalog WHERE id=NEW.material_id::uuid; END IF;
 IF actual_unit IS NULL OR lower(trim(actual_unit))<>lower(trim(line.unit)) THEN RAISE EXCEPTION 'Order material unit must match its BOQ baseline'; END IF;
 IF TG_OP='INSERT' THEN
 SELECT id INTO stock_id FROM public.materials WHERE project_id=NEW.project_id AND boq_item_id=line.id;
 IF stock_id IS NOT NULL THEN NEW.material_id:=stock_id; END IF;
 END IF;
 IF lower(trim(coalesce(to_jsonb(NEW)->>'unit',line.unit)))<>lower(trim(line.unit)) THEN RAISE EXCEPTION 'Order unit must match its BOQ material'; END IF;
 SELECT coalesce(sum(quantity_ordered),0) INTO committed FROM public.purchase_orders
 WHERE project_id=NEW.project_id AND boq_item_id=line.id AND id<>NEW.id AND status NOT IN ('Cancelled','Rejected');
 IF committed+NEW.quantity_ordered>line.quantity AND (TG_OP='INSERT' OR NEW.quantity_ordered IS DISTINCT FROM OLD.quantity_ordered OR old_link IS DISTINCT FROM NEW.boq_item_id) THEN
 RAISE EXCEPTION 'Order exceeds BOQ planned quantity. Revise the BOQ before ordering additional material'; END IF;
 END IF;
 IF TG_TABLE_NAME='client_payment_schedule' THEN
 SELECT coalesce(sum(amount),0) INTO committed FROM public.client_payment_schedule
 WHERE project_id=NEW.project_id AND boq_item_id=line.id AND id<>NEW.id AND status NOT IN ('Cancelled','Rejected');
 IF committed+NEW.amount>line.amount+coalesce((SELECT sum(amount) FROM public.variation_orders WHERE project_id=NEW.project_id AND boq_item_id=line.id AND status='Approved'),0)
 AND (TG_OP='INSERT' OR NEW.amount IS DISTINCT FROM OLD.amount OR old_link IS DISTINCT FROM NEW.boq_item_id) THEN
 RAISE EXCEPTION 'Scheduled payments exceed this BOQ item and its approved variations'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS zz_boq_link ON public.%I',t);
 EXECUTE format('CREATE TRIGGER zz_boq_link BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cf_guard_boq_link()',t);
 END LOOP;
END $$;

-- Existing RPCs accept their original JSON payloads plus an explicit BOQ reference.
DO $$ BEGIN
 IF to_regprocedure('public.record_project_expense_before_boq(uuid,jsonb)') IS NULL THEN
 ALTER FUNCTION public.record_project_expense(uuid,jsonb) RENAME TO record_project_expense_before_boq; END IF;
 IF to_regprocedure('public.create_project_commercial_record_before_boq(uuid,text,jsonb)') IS NULL THEN
 ALTER FUNCTION public.create_project_commercial_record(uuid,text,jsonb) RENAME TO create_project_commercial_record_before_boq; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.record_project_expense(p_project_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; stock public.materials%ROWTYPE; qty numeric:=coalesce((p_data->>'quantity_used')::numeric,0); value_amount numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF value_amount IS NULL OR value_amount<0 OR qty<0 OR value_amount::text IN ('NaN','Infinity','-Infinity') OR qty::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Invalid expense'; END IF;
 IF nullif(p_data->>'purchase_order_id','') IS NOT NULL THEN RAISE EXCEPTION 'PO costs are already included in project financials'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF qty>0 THEN
 SELECT * INTO stock FROM public.materials WHERE id=(p_data->>'material_id')::uuid AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND OR coalesce(stock.current_stock,0)<qty THEN RAISE EXCEPTION 'Insufficient project stock'; END IF;
 UPDATE public.materials SET current_stock=current_stock-qty WHERE id=stock.id;
 value_amount:=0; -- Received goods are already costed; usage is a stock movement.
 END IF;
 INSERT INTO public.project_expenses(project_id,title,description,amount,expense_date,category,material_id,quantity_used,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'title'),p_data->>'description',value_amount,coalesce((p_data->>'expense_date')::date,current_date),p_data->>'category',nullif(p_data->>'material_id','')::uuid,qty,nullif(p_data->>'boq_item_id','')::uuid)
 RETURNING to_jsonb(project_expenses.*) INTO saved;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION public.create_project_commercial_record(p_project_id uuid,p_kind text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; amount_value numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF amount_value IS NULL OR amount_value<=0 OR amount_value::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'description'),'') IS NULL THEN RAISE EXCEPTION 'A description and positive amount are required'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p_kind='payment' THEN
 IF p_data->>'due_date' IS NULL THEN RAISE EXCEPTION 'Payment due date required'; END IF;
 INSERT INTO public.client_payment_schedule(project_id,description,amount,due_date,status,created_by,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'description'),amount_value,(p_data->>'due_date')::date,'Pending',auth.uid(),nullif(p_data->>'boq_item_id','')::uuid) RETURNING to_jsonb(client_payment_schedule.*) INTO saved;
 ELSIF p_kind='variation' THEN
 IF nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Variation title required'; END IF;
 INSERT INTO public.variation_orders(project_id,title,description,amount,status,created_by,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'title'),trim(p_data->>'description'),amount_value,'Pending',auth.uid(),nullif(p_data->>'boq_item_id','')::uuid) RETURNING to_jsonb(variation_orders.*) INTO saved;
 ELSE RAISE EXCEPTION 'Invalid commercial record kind';
 END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.record_project_expense_before_boq(uuid,jsonb),public.create_project_commercial_record_before_boq(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_project_expense(uuid,jsonb),public.create_project_commercial_record(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_project_expense(uuid,jsonb),public.create_project_commercial_record(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_boq(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; result jsonb; role_value text:=public.cf_current_role();
BEGIN
 IF auth.uid() IS NULL OR coalesce(role_value,'') NOT IN ('super_admin','pm','client','site_manager') OR NOT coalesce(public.cf_project_access(p_project_id),false) THEN RAISE EXCEPTION 'Project BOQ access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF role_value='site_manager' THEN
 RETURN jsonb_build_object('revision',project.boq_revision,'project_name',project.name,'materials',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.description,'unit',b.unit,'allocated_quantity',b.quantity,'active',b.active,
 'ordered_quantity',(SELECT coalesce(sum(quantity_ordered),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status NOT IN ('Cancelled','Rejected')),
 'received_quantity',(SELECT coalesce(sum(quantity_received),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id)
 )),'[]'::jsonb) FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.kind='material' AND b.active));
 END IF;
 SELECT jsonb_build_object('project_name',project.name,'revision',project.boq_revision,'boq_data',project.boq_data,'project_budget',project.total_budget,
 'requires_reupload',CASE WHEN jsonb_typeof(project.boq_data->'items_count')='number' THEN (project.boq_data->>'items_count')::numeric>jsonb_array_length(coalesce(project.boq_data->'items','[]'::jsonb)) ELSE false END,
 'lines',coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'ordered_quantity',(SELECT coalesce(sum(quantity_ordered),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status NOT IN ('Cancelled','Rejected')),
 'received_quantity',(SELECT coalesce(sum(quantity_received),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id),
 'used_quantity',(SELECT coalesce(sum(quantity_used),0) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id=b.id),
 'actual_cost',(SELECT coalesce(sum(CASE WHEN status='Received' THEN total_price WHEN status='Delivered' AND quantity_ordered>0 THEN total_price*least(1,quantity_received/quantity_ordered) ELSE 0 END),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id)
 +(SELECT coalesce(sum(amount),0) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id=b.id)
 +(SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) FROM public.salary_slips WHERE project_id=p_project_id AND boq_item_id=b.id AND status='Paid'),
 'payment_scheduled',(SELECT coalesce(sum(amount),0) FROM public.client_payment_schedule WHERE project_id=p_project_id AND boq_item_id=b.id),
 'approved_variations',(SELECT coalesce(sum(amount),0) FROM public.variation_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status='Approved')
 )) FROM public.project_boq_lines b WHERE b.project_id=p_project_id),'[]'::jsonb),
 'unallocated_orders',(SELECT count(*) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'unallocated_expenses',(SELECT count(*) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'payroll_paid',(SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) FROM public.salary_slips WHERE project_id=p_project_id AND status='Paid')
 ) INTO result;
 IF role_value='client' THEN
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)-'labour_overrides'-'labour_rates');
 result:=jsonb_set(result,'{lines}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(result->'lines') WHERE value->>'kind'<>'labour'),'[]'::jsonb));
 END IF;
 IF role_value IN ('super_admin','pm') THEN
 result:=result||jsonb_build_object('unallocated_records',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT 'purchase_orders' AS table_name,id,coalesce(po_number,'Purchase order') AS label FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'project_expenses',id,title FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'material_requests',id,item_name FROM public.material_requests WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'client_payment_schedule',id,description FROM public.client_payment_schedule WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'variation_orders',id,title FROM public.variation_orders WHERE project_id=p_project_id AND boq_item_id IS NULL LIMIT 200
 ) r),'[]'::jsonb));
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)||jsonb_build_object('labour_overrides',coalesce((SELECT jsonb_agg(jsonb_build_object('worker_id',worker_id,'daily_rate',daily_rate)) FROM public.project_boq_worker_rates WHERE project_id=p_project_id),'[]'::jsonb)));
 result:=result||jsonb_build_object('workers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name)) FROM public.profiles p WHERE p.role='worker' AND EXISTS(SELECT 1 FROM public.project_role_assignments a WHERE a.project_id=p_project_id AND a.user_id=p.id AND a.role='worker')),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT project_id,revision,reason,changed_by,changed_at FROM public.project_boq_revisions WHERE project_id=p_project_id ORDER BY revision DESC LIMIT 10) r),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_project_boq(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_project_boq(uuid) TO authenticated;

-- A direct Data API update must not bypass revision history or reset the counter.
CREATE OR REPLACE FUNCTION public.cf_protect_boq_baseline() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
 IF TG_OP='INSERT' THEN
 IF NEW.boq_data IS NOT NULL OR NEW.boq_revision<>0 THEN RAISE EXCEPTION 'Save BOQ through the project workflow'; END IF;
 ELSIF NEW.boq_data IS DISTINCT FROM OLD.boq_data OR NEW.boq_revision IS DISTINCT FROM OLD.boq_revision THEN
 RAISE EXCEPTION 'Use an audited BOQ revision'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cf_protect_boq_baseline ON public.projects;
CREATE TRIGGER cf_protect_boq_baseline BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.cf_protect_boq_baseline();

CREATE OR REPLACE FUNCTION public.allocate_boq_record(p_project_id uuid,p_table text,p_record_id uuid,p_boq_item_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN ('material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders') THEN RAISE EXCEPTION 'Invalid record type'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.project_boq_lines WHERE project_id=p_project_id AND id=p_boq_item_id AND active) THEN RAISE EXCEPTION 'Choose an active BOQ item from this project'; END IF;
 EXECUTE format('UPDATE public.%I SET boq_item_id=$1 WHERE id=$2 AND project_id=$3',p_table) USING p_boq_item_id,p_record_id,p_project_id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Project record not found' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.allocate_boq_record(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.allocate_boq_record(uuid,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_project_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END; weighted numeric;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=project FOR UPDATE;
 SELECT round(sum(completion_percentage*allocated_budget)/nullif(sum(allocated_budget),0)) INTO weighted
 FROM public.milestones WHERE project_id=project AND boq_stage IS NOT NULL;
 UPDATE public.projects SET completion_percentage=coalesce(weighted,(SELECT round(avg(coalesce(completion_percentage,CASE WHEN status='Completed' THEN 100 ELSE 0 END))) FROM public.milestones WHERE project_id=project),0)
 WHERE id=project;
 RETURN NULL;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
