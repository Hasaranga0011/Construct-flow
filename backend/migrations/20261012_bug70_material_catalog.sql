-- Migration: 20261012_bug70_material_catalog.sql
-- Goal: Decouple global material catalog from project-specific stock and purchase orders

-- 1. Create the global material_catalog table
CREATE TABLE IF NOT EXISTS public.material_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Units',
    category TEXT NOT NULL DEFAULT 'General',
    reference_price NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_material_catalog_name_unit UNIQUE (name, unit)
);

-- Enable RLS on material_catalog
ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;

-- Read policy: Any authenticated user can read the material catalog
CREATE POLICY "Allow authenticated read on material_catalog"
    ON public.material_catalog
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert/Update policy: Admins and Project Managers can create or update catalog entries
CREATE POLICY "Allow admin/pm insert on material_catalog"
    ON public.material_catalog
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'pm', 'super_admin')
        )
    );

CREATE POLICY "Allow admin/pm update on material_catalog"
    ON public.material_catalog
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'pm', 'super_admin')
        )
    );

-- 2. Add catalog_id column to project stock table (public.materials)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'materials' 
          AND column_name = 'catalog_id'
    ) THEN
        ALTER TABLE public.materials ADD COLUMN catalog_id UUID REFERENCES public.material_catalog(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Populate material_catalog from distinct existing materials
INSERT INTO public.material_catalog (name, unit, category, reference_price)
SELECT DISTINCT ON (trim(name), trim(unit))
    trim(name) AS name,
    coalesce(nullif(trim(unit), ''), 'Units') AS unit,
    coalesce(nullif(trim(category), ''), 'General') AS category,
    coalesce(unit_price, 0.00) AS reference_price
FROM public.materials
WHERE name IS NOT NULL AND trim(name) <> ''
ON CONFLICT (name, unit) DO UPDATE
SET category = EXCLUDED.category,
    reference_price = CASE WHEN material_catalog.reference_price = 0 THEN EXCLUDED.reference_price ELSE material_catalog.reference_price END;

-- 4. Backfill catalog_id on existing public.materials stock rows
UPDATE public.materials m
SET catalog_id = c.id
FROM public.material_catalog c
WHERE trim(m.name) = c.name
  AND coalesce(nullif(trim(m.unit), ''), 'Units') = c.unit
  AND (m.catalog_id IS NULL OR m.catalog_id <> c.id);

-- 5. Backfill material_id in purchase_orders to reference catalog entries where matching
-- For POs whose material_id currently points to a materials row with catalog_id:
UPDATE public.purchase_orders po
SET material_id = m.catalog_id
FROM public.materials m
WHERE po.material_id = m.id
  AND m.catalog_id IS NOT NULL;

-- 6. Ensure receive_purchase_order RPC creates the stock row under project_id if it doesn't exist yet
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_material_id uuid;
  v_catalog_id uuid;
  v_cat record;
  v_stock_id uuid;
BEGIN
  -- Fetch the order
  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'Received' THEN
    RAISE EXCEPTION 'Order already received';
  END IF;

  IF coalesce(v_order.quantity_ordered, 0) <= 0 THEN
    RAISE EXCEPTION 'Order has invalid quantity';
  END IF;

  -- Resolve material_id to catalog_id or fallback
  BEGIN
    v_material_id := nullif(v_order.material_id::text, '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_material_id := NULL;
  END;

  -- Check if v_material_id is in material_catalog
  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.material_catalog WHERE id = v_material_id;
    IF FOUND THEN
      v_catalog_id := v_cat.id;
    END IF;
  END IF;

  -- If still not matched, check by material name/items text
  IF v_catalog_id IS NULL THEN
    SELECT * INTO v_cat FROM public.material_catalog
    WHERE name ILIKE coalesce(v_order.items, 'Material from PO')
    LIMIT 1;

    IF FOUND THEN
      v_catalog_id := v_cat.id;
    ELSE
      -- Create catalog item
      INSERT INTO public.material_catalog (name, unit, category, reference_price)
      VALUES (coalesce(nullif(trim(v_order.items), ''), 'Material from PO'), 'Units', 'General', coalesce(v_order.total_amount, 0))
      RETURNING id, name, unit INTO v_cat;
      v_catalog_id := v_cat.id;
    END IF;
  END IF;

  -- Ensure order references this catalog item
  UPDATE public.purchase_orders
  SET material_id = v_catalog_id
  WHERE id = p_order_id;

  -- Find or create project stock row for this project and catalog item
  SELECT id INTO v_stock_id
  FROM public.materials
  WHERE project_id = v_order.project_id
    AND (catalog_id = v_catalog_id OR name = v_cat.name)
  LIMIT 1;

  IF v_stock_id IS NULL THEN
    INSERT INTO public.materials (project_id, catalog_id, name, unit, current_stock, minimum_threshold, category)
    VALUES (v_order.project_id, v_catalog_id, v_cat.name, coalesce(v_cat.unit, 'Units'), v_order.quantity_ordered, 10, coalesce(v_cat.category, 'General'))
    RETURNING id INTO v_stock_id;
  ELSE
    -- Increment project stock
    UPDATE public.materials
    SET current_stock = coalesce(current_stock, 0) + v_order.quantity_ordered,
        catalog_id = coalesce(catalog_id, v_catalog_id)
    WHERE id = v_stock_id;
  END IF;

  -- Update order status to Received
  UPDATE public.purchase_orders
  SET status = 'Received', received_at = now(), received_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Notifications
  INSERT INTO public.notifications(project_id, target_role, title, message, type)
  VALUES
    (v_order.project_id, 'pm', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success'),
    (v_order.project_id, 'site_manager', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success');

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;
