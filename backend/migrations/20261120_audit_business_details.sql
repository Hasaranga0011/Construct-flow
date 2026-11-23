-- Apply after 20261120_audit_events.sql. Future snapshots include business details.
-- Existing immutable history is not rewritten: omitted old values cannot be recovered.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.audit_events') IS NULL THEN
  RAISE EXCEPTION 'Install 20261120_audit_events.sql before this migration';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cf_audit_snapshot(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result jsonb; item record; text_value text;
BEGIN
 IF payload IS NULL THEN RETURN NULL; END IF;
 CASE jsonb_typeof(payload)
 WHEN 'object' THEN
  result:='{}'::jsonb;
  FOR item IN SELECT key,value FROM jsonb_each(payload) LOOP
   -- Authentication material is not business history, even for administrators.
   IF item.key ~* '(password|passwd|(^|_)pwd($|_)|secret|token|authorization|api_?key|credential|session|private_?key|access_?key|recovery|(^|_)otp($|_)|qr_?code|qr_?payload)' THEN CONTINUE; END IF;
   result:=result||jsonb_build_object(item.key,public.cf_audit_snapshot(item.value));
  END LOOP;
  RETURN result;
 WHEN 'array' THEN
  SELECT coalesce(jsonb_agg(public.cf_audit_snapshot(value) ORDER BY ordinal),'[]'::jsonb)
   INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY AS entries(value,ordinal);
  RETURN result;
 WHEN 'string' THEN
  text_value:=payload#>>'{}';
  IF text_value ~* '^data:' THEN RETURN to_jsonb('[File content not copied to audit history]'::text); END IF;
  IF text_value ~* '^https?://' THEN
   -- Keep document references without signed query tokens or URL credentials.
   text_value:=regexp_replace(text_value,'[?#].*$','');
   text_value:=regexp_replace(text_value,'^(https?://)[^/@]+@','\1','i');
   RETURN to_jsonb(text_value);
  END IF;
  RETURN payload;
 ELSE RETURN payload;
 END CASE;
END $$;
REVOKE ALL ON FUNCTION public.cf_audit_snapshot(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.cf_audit_snapshot(jsonb) IS 'Business snapshots including contact details; recursively excludes authentication material and signed URL tokens. Applies to future changes only.';

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
 -- Every changed value is retained, without copying an unchanged full BOQ/file
 -- catalogue into history each time a project status or budget is updated.
 IF TG_OP='UPDATE' THEN
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO previous FROM jsonb_each(previous) WHERE key=ANY(fields);
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO following FROM jsonb_each(following) WHERE key=ANY(fields);
 END IF;
 INSERT INTO public.audit_events(actor_id,actor_role,table_name,action,record_id,project_id,changed_fields,before_data,after_data)
 VALUES(auth.uid(),coalesce(public.cf_current_role(),auth.role(),'database'),TG_TABLE_NAME,TG_OP,
  coalesce(row_data->>'id',row_data->>'user_id',row_data->>'worker_id'),project,fields,
  CASE WHEN previous IS NOT NULL THEN public.cf_audit_snapshot(previous) END,
  CASE WHEN following IS NOT NULL THEN public.cf_audit_snapshot(following) END);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cf_capture_audit_event() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
