-- Project creation and BOQ application must not report success with missing children.
BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS boq_data jsonb;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS quantity text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS status text;


CREATE OR REPLACE FUNCTION public.cf_save_project_payload(p_project_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; item jsonb; boq jsonb:=p_data->'boq_data';
 items jsonb; cursor_date date; due date; qty numeric; price numeric; title_value text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
   IF jsonb_typeof(boq)<>'object' THEN RAISE EXCEPTION 'Invalid BOQ payload'; END IF;
   UPDATE public.projects SET boq_data=boq WHERE id=p_project_id;
 END IF;
 items:=coalesce(nullif(p_data->'milestones','null'::jsonb),nullif(boq->'milestones','null'::jsonb),'[]'::jsonb);
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'Invalid milestone list'; END IF;
 cursor_date:=project.start_date;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   title_value:=trim(item->>'title');
   IF nullif(title_value,'') IS NULL OR length(title_value)>200 THEN RAISE EXCEPTION 'Milestone title required'; END IF;
   IF item ? 'due_date' AND nullif(item->>'due_date','') IS NOT NULL THEN due:=(item->>'due_date')::date;
   ELSIF coalesce((item->>'duration_days')::integer,0)>0 THEN cursor_date:=cursor_date+(item->>'duration_days')::integer; due:=cursor_date;
   ELSE due:=project.end_date; END IF;
   IF coalesce(item->>'status','Pending') NOT IN ('Pending','Not Started') OR coalesce((item->>'completion_percentage')::numeric,0)<>0 THEN
     RAISE EXCEPTION 'New project milestones must start pending'; END IF;
   INSERT INTO public.milestones(id,project_id,title,description,due_date,planned_date,status,completion_percentage)
   SELECT gen_random_uuid(),p_project_id,title_value,coalesce(item->>'description',''),due,due,'Pending',0
   WHERE NOT EXISTS(SELECT 1 FROM public.milestones WHERE project_id=p_project_id AND lower(trim(title))=lower(title_value));
 END LOOP;
 items:=coalesce(nullif(boq->'materials','null'::jsonb),'[]'::jsonb);
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'Invalid BOQ material list'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   title_value:=trim(item->>'name'); qty:=coalesce((item->>'allocated_quantity')::numeric,0); price:=coalesce((item->>'unit_price')::numeric,0);
   IF nullif(title_value,'') IS NULL OR qty<0 OR price<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Invalid BOQ material'; END IF;
   INSERT INTO public.materials(id,project_id,name,unit,current_stock,minimum_threshold,quantity,unit_price,category,status)
   SELECT gen_random_uuid(),p_project_id,title_value,coalesce(item->>'unit','units'),0,greatest(10,round(qty*0.1)),qty::text,price,coalesce(item->>'category','General'),'Pending Order'
   WHERE NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND lower(trim(name))=lower(title_value));
 END LOOP;
 IF nullif(p_data->>'boq_file_url','') IS NOT NULL THEN
   IF p_data->>'boq_file_url' !~ '^https://' THEN RAISE EXCEPTION 'BOQ document requires a secure storage URL'; END IF;
   INSERT INTO public.shared_documents(project_id,name,filename,file_name,category,file_url,url,status,uploaded_by)
   VALUES(p_project_id,'Bill of Quantities - '||project.name,'Bill of Quantities','Bill of Quantities','BOQ',p_data->>'boq_file_url',p_data->>'boq_file_url','Active',auth.uid());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.cf_save_project_payload(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_project_boq(p_project_id uuid,p_boq jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE budget numeric:=(p_boq->>'total_budget')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF budget IS NULL OR budget<=0 OR budget::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ budget'; END IF;
 PERFORM public.cf_save_project_payload(p_project_id,jsonb_build_object('boq_data',p_boq));
 UPDATE public.projects SET total_budget=budget WHERE id=p_project_id;
 PERFORM public.refresh_project_spend(p_project_id);
 RETURN jsonb_build_object('ok',true,'boq_data',p_boq);
END $$;
REVOKE ALL ON FUNCTION public.apply_project_boq(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_project_boq(uuid,jsonb) TO authenticated;
COMMIT;
