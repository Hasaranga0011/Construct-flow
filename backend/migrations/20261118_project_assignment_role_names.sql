-- Normalize display role names at the assignment boundary without changing profiles,
-- approval requirements, project access checks, or the existing BOQ transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.cf_assignment_role(p_role text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE lower(regexp_replace(trim(p_role),'\s+','_','g'))
 WHEN 'admin' THEN 'super_admin'
 WHEN 'superadmin' THEN 'super_admin'
 WHEN 'project_manager' THEN 'pm'
 WHEN 'manager' THEN 'pm'
 WHEN 'sitemanager' THEN 'site_manager'
 ELSE lower(regexp_replace(trim(p_role),'\s+','_','g')) END;
$$;
REVOKE ALL ON FUNCTION public.cf_assignment_role(text) FROM PUBLIC,anon,authenticated;

-- Patch only the two role comparisons. Keep the installed transaction and any
-- later workflow fixes intact. Abort atomically if its definition is unexpected.
DO $migration$
DECLARE definition text; old_single text; old_multiple text;
BEGIN
 definition:=pg_get_functiondef('public.save_project_with_assignments(uuid,jsonb)'::regprocedure);
 old_single:='(role=pair.role OR role IN (''super_admin'',''admin''))';
 old_multiple:='(role=pair.role OR (pair.role=''admin'' AND role=''super_admin''))';
 IF position('public.cf_assignment_role(role)' in definition)>0 THEN
   RETURN; -- already applied
 END IF;
 IF position(old_single in definition)=0 OR position(old_multiple in definition)=0 THEN
   RAISE EXCEPTION 'Unexpected project transaction definition; review before applying assignment normalization';
 END IF;
 definition:=replace(definition,old_single,
   '(public.cf_assignment_role(role)=public.cf_assignment_role(pair.role) OR public.cf_assignment_role(role)=''super_admin'')');
 definition:=replace(definition,old_multiple,
   '(public.cf_assignment_role(role)=public.cf_assignment_role(pair.role))');
 EXECUTE definition;
END;
$migration$;
COMMIT;
