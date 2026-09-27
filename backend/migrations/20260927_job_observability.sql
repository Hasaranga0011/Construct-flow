-- ConstructFlow: Job Observability
-- Adds a table for tracking background cron jobs executed by APScheduler

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- RLS: Only admins can view job runs. Service role bypasses RLS for inserts.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view job runs" 
    ON public.job_runs FOR SELECT 
    TO authenticated 
    USING (public.cf_role() = 'super_admin');

COMMIT;
