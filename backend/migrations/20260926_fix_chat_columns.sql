-- Migration: ensure client_messages has both 'message' and 'content' columns
-- and that the messages table used by supplier/site_manager chat has a 'content' column.

-- Fix client_messages table
ALTER TABLE IF EXISTS client_messages
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT;

-- Ensure messages table has all needed columns
ALTER TABLE IF EXISTS messages
  ADD COLUMN IF NOT EXISTS sender_role TEXT,
  ADD COLUMN IF NOT EXISTS receiver_role TEXT,
  ADD COLUMN IF NOT EXISTS receiver_id UUID;

-- Keep content column in sync with message for client_messages
CREATE OR REPLACE FUNCTION sync_client_message_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content IS NULL AND NEW.message IS NOT NULL THEN
    NEW.content := NEW.message;
  END IF;
  IF NEW.message IS NULL AND NEW.content IS NOT NULL THEN
    NEW.message := NEW.content;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_client_message_cols ON client_messages;
CREATE TRIGGER trg_sync_client_message_cols
  BEFORE INSERT OR UPDATE ON client_messages
  FOR EACH ROW EXECUTE FUNCTION sync_client_message_columns();
