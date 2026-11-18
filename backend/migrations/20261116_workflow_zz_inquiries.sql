BEGIN;
CREATE TABLE IF NOT EXISTS public.public_inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL,
 project_name text, message text NOT NULL, status text NOT NULL DEFAULT 'unread',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_inquiries FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE,DELETE ON public.public_inquiries TO authenticated;
DROP POLICY IF EXISTS inquiry_admin_boundary ON public.public_inquiries;
CREATE POLICY inquiry_admin_boundary ON public.public_inquiries AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.cf_current_role()='super_admin') WITH CHECK(public.cf_current_role()='super_admin');
DROP POLICY IF EXISTS inquiry_admin_access ON public.public_inquiries;
CREATE POLICY inquiry_admin_access ON public.public_inquiries FOR ALL TO authenticated
 USING(public.cf_current_role()='super_admin') WITH CHECK(public.cf_current_role()='super_admin');
-- Browser identities cannot bypass the API's validation and request limit.
CREATE OR REPLACE FUNCTION public.submit_public_inquiry(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inquiry uuid;
BEGIN
 IF length(trim(p_data->>'name')) NOT BETWEEN 2 AND 120
 OR length(trim(p_data->>'message')) NOT BETWEEN 10 AND 5000
 OR p_data->>'email' IS NULL THEN RAISE EXCEPTION 'Invalid inquiry'; END IF;
 INSERT INTO public.public_inquiries(name,email,project_name,message)
 VALUES(trim(p_data->>'name'),p_data->>'email',p_data->>'project_name',trim(p_data->>'message')) RETURNING id INTO inquiry;
 INSERT INTO public.notifications(user_id,target_user_id,target_role,title,message,type)
 SELECT id,id,'super_admin','New inquiry: '||trim(p_data->>'name'),
 'Email: '||(p_data->>'email')||E'\nProject: '||coalesce(p_data->>'project_name','N/A')||E'\n'||trim(p_data->>'message'),'general'
 FROM public.profiles WHERE role IN ('super_admin','admin') AND is_approved IS TRUE;
 RETURN inquiry;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_inquiry(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_inquiry(jsonb) TO service_role;
COMMIT;
