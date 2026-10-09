-- Migration to add period_start, period_end, and total_amount to salary_slips

ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2);

-- Backfill from existing 'month' or 'created_at' column
UPDATE public.salary_slips 
SET period_start = COALESCE(month, DATE_TRUNC('month', created_at)::DATE)
WHERE period_start IS NULL;

UPDATE public.salary_slips 
SET period_end = (period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE
WHERE period_end IS NULL;

-- Backfill total_amount from total_pay if it exists
UPDATE public.salary_slips
SET total_amount = total_pay
WHERE total_amount IS NULL AND total_pay IS NOT NULL;

ALTER TABLE public.salary_slips ALTER COLUMN period_start SET NOT NULL;
ALTER TABLE public.salary_slips ALTER COLUMN period_end SET NOT NULL;
