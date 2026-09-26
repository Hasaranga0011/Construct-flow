-- Phase 3: Extend client_messages to support 3-way multi-channel chat.
-- Adds sender_role, receiver_role, and read_at columns.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- Run as database owner after 20260926_fix_attendance_rls.sql.

BEGIN;

-- Add multi-channel columns to client_messages.
ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS sender_role  text,
  ADD COLUMN IF NOT EXISTS receiver_role text,
  ADD COLUMN IF NOT EXISTS read_at      timestamptz;

-- Back-fill existing rows: assume legacy rows are client <-> pm threads.
UPDATE public.client_messages
SET
  sender_role   = COALESCE(sender_role,   'client'),
  receiver_role = COALESCE(receiver_role, 'pm')
WHERE sender_role IS NULL OR receiver_role IS NULL;

-- Index for fast thread queries (project + channel pair).
CREATE INDEX IF NOT EXISTS idx_client_messages_channel
  ON public.client_messages (project_id, sender_role, receiver_role);

-- Index for unread count queries per recipient.
CREATE INDEX IF NOT EXISTS idx_client_messages_unread
  ON public.client_messages (receiver_id, read_at)
  WHERE read_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- RLS: a message is only visible to its sender or receiver.
-- ─────────────────────────────────────────────────────────────

-- Drop any existing broad policies.
DO $$
DECLARE
  pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_messages', pol_name);
  END LOOP;
END
$$;

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages FORCE ROW LEVEL SECURITY;

-- SELECT: only sender or receiver.
CREATE POLICY client_messages_select ON public.client_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- INSERT: sender must be the authenticated user (no impersonation).
CREATE POLICY client_messages_insert ON public.client_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      -- Verify the sender_role matches the authenticated user's actual role.
      sender_role = (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    )
  );

-- UPDATE: only receiver can mark as read (sets read_at).
CREATE POLICY client_messages_update_read ON public.client_messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- DELETE: admin only.
CREATE POLICY client_messages_delete_admin ON public.client_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

REVOKE INSERT, UPDATE, DELETE ON public.client_messages FROM anon;

COMMIT;
