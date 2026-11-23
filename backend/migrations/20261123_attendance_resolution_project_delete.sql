BEGIN;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS checkout_correction_reason text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS checkout_corrected_by uuid;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS checkout_corrected_at timestamptz;

CREATE OR REPLACE FUNCTION public.resolve_missing_checkout(p_attendance_id uuid,p_checkout timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.attendance%ROWTYPE; project uuid; person uuid; duration numeric;
BEGIN
 SELECT * INTO a FROM public.attendance WHERE id=p_attendance_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attendance not found' USING ERRCODE='P0002'; END IF;
 SELECT project_id INTO project FROM public.sites WHERE id=a.site_id;
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(project) THEN
 RAISE EXCEPTION 'Assigned project manager required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=project FOR UPDATE;
 IF a.check_in_time IS NULL OR a.check_out_time IS NOT NULL THEN RAISE EXCEPTION 'Only a missing check-out can be resolved'; END IF;
 IF p_checkout IS NULL OR p_checkout<=a.check_in_time OR p_checkout>now() OR p_checkout>a.check_in_time+interval '24 hours' THEN
 RAISE EXCEPTION 'Choose an actual check-out after check-in, within 24 hours and not in the future' USING ERRCODE='23514'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Explain the check-out correction (5–1000 characters)' USING ERRCODE='23514'; END IF;
 SELECT user_id INTO person FROM public.workers WHERE id=a.worker_id;
 IF EXISTS(SELECT 1 FROM public.salary_slips WHERE project_id=project AND worker_id IN (a.worker_id,person)
 AND a.date BETWEEN period_start AND period_end) THEN RAISE EXCEPTION 'A payslip already covers this attendance; resolve payroll before changing it'; END IF;
 duration:=extract(epoch FROM(p_checkout-a.check_in_time))/3600;
 UPDATE public.attendance SET check_out_time=p_checkout,hours_worked=round(least(duration,8),4),
 overtime_hours=round(greatest(duration-8,0),4),checkout_correction_reason=trim(p_reason),
 checkout_corrected_by=auth.uid(),checkout_corrected_at=now() WHERE id=a.id;
 RETURN jsonb_build_object('id',a.id,'message','Check-out corrected. Reload and review attendance before approval.');
END $$;
REVOKE ALL ON FUNCTION public.resolve_missing_checkout(uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_missing_checkout(uuid,timestamptz,text) TO authenticated;

-- Snapshot exact project-owned rows before deleting children. Shared identities and
-- audit history are never traversed. Any unresolved constraint rolls back everything.
CREATE OR REPLACE FUNCTION public.permanently_delete_project(p_project_id uuid,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; t record; fk record; childcols text; parentcols text;
 keycols text[]; inserted integer; additions integer; removed integer; progress integer; total integer:=0; attempts integer:=0;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'')<>'super_admin' THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_confirmation IS DISTINCT FROM project.name THEN RAISE EXCEPTION 'Type the exact project name to confirm permanent deletion' USING ERRCODE='23514'; END IF;
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
