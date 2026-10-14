-- Fix save_project_with_assignments RPC and ensure admin access
CREATE OR REPLACE FUNCTION public.save_project_with_assignments(
    p_project_id uuid DEFAULT NULL,
    p_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project public.projects%ROWTYPE;
    v_role text := public.cf_current_role();
    v_changes jsonb;
    v_key text;
    v_assignment_role text;
BEGIN
    IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'pm') THEN
        RAISE EXCEPTION 'Insufficient permissions to save project' USING ERRCODE = '42501';
    END IF;

    -- Strip assignment array fields from project record changes
    v_changes := p_data - 'site_managers' - 'workers' - 'suppliers' - 'admins';

    IF p_project_id IS NULL THEN
        INSERT INTO public.projects (
            name, location, start_date, end_date, pm_id, client_id, status, total_budget, address, latitude, longitude
        ) VALUES (
            (v_changes->>'name')::text,
            (v_changes->>'location')::text,
            (v_changes->>'start_date')::date,
            (v_changes->>'end_date')::date,
            (v_changes->>'pm_id')::uuid,
            (v_changes->>'client_id')::uuid,
            COALESCE((v_changes->>'status')::text, 'Planning'),
            COALESCE((v_changes->>'total_budget')::numeric, 0),
            (v_changes->>'address')::text,
            (v_changes->>'latitude')::numeric,
            (v_changes->>'longitude')::numeric
        ) RETURNING * INTO v_project;
        p_project_id := v_project.id;
    ELSE
        UPDATE public.projects SET
            name = COALESCE((v_changes->>'name')::text, name),
            location = COALESCE((v_changes->>'location')::text, location),
            start_date = COALESCE((v_changes->>'start_date')::date, start_date),
            end_date = COALESCE((v_changes->>'end_date')::date, end_date),
            pm_id = CASE WHEN v_changes ? 'pm_id' THEN (v_changes->>'pm_id')::uuid ELSE pm_id END,
            client_id = CASE WHEN v_changes ? 'client_id' THEN (v_changes->>'client_id')::uuid ELSE client_id END,
            status = COALESCE((v_changes->>'status')::text, status),
            total_budget = COALESCE((v_changes->>'total_budget')::numeric, total_budget),
            address = COALESCE((v_changes->>'address')::text, address),
            latitude = COALESCE((v_changes->>'latitude')::numeric, latitude),
            longitude = COALESCE((v_changes->>'longitude')::numeric, longitude)
        WHERE id = p_project_id
        RETURNING * INTO v_project;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- Sync role assignments safely with correct column 'role'
    FOR v_key, v_assignment_role IN VALUES
        ('site_managers', 'site_manager'),
        ('workers', 'worker'),
        ('suppliers', 'supplier'),
        ('admins', 'admin')
    LOOP
        IF p_data ? v_key AND p_data->v_key IS NOT NULL AND jsonb_typeof(p_data->v_key) = 'array' THEN
            DELETE FROM public.project_role_assignments
            WHERE project_id = v_project.id AND role = v_assignment_role;

            INSERT INTO public.project_role_assignments (project_id, user_id, role)
            SELECT v_project.id, (u.id)::uuid, v_assignment_role
            FROM jsonb_array_elements_text(p_data->v_key) AS u(id)
            ON CONFLICT (project_id, user_id, role) DO NOTHING;
        END IF;
    END LOOP;

    -- Sync PM assignment
    IF v_project.pm_id IS NOT NULL THEN
        DELETE FROM public.pm_projects WHERE project_id = v_project.id;
        INSERT INTO public.pm_projects (project_id, pm_id) VALUES (v_project.id, v_project.pm_id)
        ON CONFLICT DO NOTHING;

        DELETE FROM public.project_role_assignments WHERE project_id = v_project.id AND role = 'pm';
        INSERT INTO public.project_role_assignments (project_id, user_id, role)
        VALUES (v_project.id, v_project.pm_id, 'pm')
        ON CONFLICT (project_id, user_id, role) DO NOTHING;
    END IF;

    -- Sync Client assignment
    IF v_project.client_id IS NOT NULL THEN
        DELETE FROM public.project_role_assignments WHERE project_id = v_project.id AND role = 'client';
        INSERT INTO public.project_role_assignments (project_id, user_id, role)
        VALUES (v_project.id, v_project.client_id, 'client')
        ON CONFLICT (project_id, user_id, role) DO NOTHING;
    END IF;

    RETURN to_jsonb(v_project);
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_with_assignments(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_project_with_assignments(uuid, jsonb) TO authenticated;
