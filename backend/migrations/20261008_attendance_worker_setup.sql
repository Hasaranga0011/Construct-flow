-- Attendance must not require a fabricated NIC for an assigned worker account.
-- Existing NIC values and all attendance records are preserved.
BEGIN;
ALTER TABLE public.workers ALTER COLUMN nic_number DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
