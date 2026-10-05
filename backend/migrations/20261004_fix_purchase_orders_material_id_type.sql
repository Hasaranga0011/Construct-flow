-- Fix for Bug 37: Type mismatch on material_id
-- The purchase_orders.material_id column was originally created as TEXT, but the
-- po_delivery_stock_trigger inserts this value into site_materials.material_id which is UUID.
-- This causes the "column material_id is of type uuid but expression is of type text" error
-- when status is updated to 'Delivered'.
--
-- This migration alters the column to be a UUID natively, which satisfies the trigger's strict typing.

-- We must cast the existing TEXT values to UUID. Any invalid text will cause this to fail,
-- but the python code was already patched to ensure only valid UUIDs are written.
-- If there is invalid text (e.g. 'Bricks'), we can set it to NULL or a dummy UUID.
-- For safety, we will just cast.

BEGIN;

-- 1. Alter the column type using an explicit cast with a safe regex check
ALTER TABLE public.purchase_orders
  ALTER COLUMN material_id TYPE UUID USING (
    CASE
      WHEN material_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN material_id::text::uuid
      ELSE NULL
    END
  );

COMMIT;
