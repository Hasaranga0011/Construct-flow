-- Migration: 20261014_fix_po_notification_enum.sql
-- Fix Postgres enum notification_type mismatch and null user_id constraint in deliver_purchase_order and receive_purchase_order.

-- 1. Ensure 'info' and 'success' enum values exist if postgres allows adding them
DO $$
BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'info';
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'success';
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN others THEN NULL;
END $$;

-- 2. Allow role-targeted notifications without an individual user_id, or allow null
ALTER TABLE IF EXISTS public.notifications ALTER COLUMN user_id DROP NOT NULL;

-- 3. Update deliver_purchase_order to provide user_id and use 'general' safe enum
CREATE OR REPLACE FUNCTION public.deliver_purchase_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
  v_role text := public.cf_current_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
    coalesce(v_role = 'super_admin', false)
    OR coalesce(v_role = 'supplier' AND v_order.supplier_id = auth.uid(), false)
    OR public.cf_can_manage_project(v_order.project_id)
  ) THEN
    RAISE EXCEPTION 'Not your order' USING ERRCODE = '42501';
  END IF;
  IF v_order.status = 'Received' THEN RETURN to_jsonb(v_order); END IF;
  IF v_order.status = 'Delivered' THEN RETURN to_jsonb(v_order); END IF;
  IF v_order.status NOT IN ('Confirmed', 'Pending Delivery') THEN
    RAISE EXCEPTION 'Order must be confirmed before delivery';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'Delivered', delivered_at = now(), delivered_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.notifications(user_id, project_id, target_role, title, message, type)
  VALUES
    (coalesce(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid), v_order.project_id, 'pm', 'Goods delivered', 'Purchase order ' || v_order.po_number || ' is ready for receipt confirmation.', 'general'::notification_type),
    (coalesce(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid), v_order.project_id, 'site_manager', 'Goods delivered', 'Purchase order ' || v_order.po_number || ' is ready for receipt confirmation.', 'general'::notification_type);

  RETURN to_jsonb(v_order);
END
$$;

-- 4. Update receive_purchase_order to provide user_id and use 'general' safe enum
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
  v_role text := public.cf_current_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    coalesce(v_role = 'super_admin', false)
    OR public.cf_can_manage_project(v_order.project_id)
    OR (v_role = 'site_manager' AND EXISTS (
      SELECT 1
      FROM public.project_role_assignments pra
      WHERE pra.project_id = v_order.project_id
        AND pra.user_id = auth.uid()
        AND pra.role = 'site_manager'
    ))
  ) THEN
    RAISE EXCEPTION 'Only the project team can confirm receipt' USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'Received' THEN
    RETURN to_jsonb(v_order);
  END IF;

  IF v_order.status NOT IN ('Delivered', 'Pending Delivery') THEN
    RAISE EXCEPTION 'Order must be delivered or pending delivery before receipt confirmation';
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

  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.material_catalog WHERE id = v_material_id;
    IF FOUND THEN
      v_catalog_id := v_cat.id;
    END IF;
  END IF;

  IF v_catalog_id IS NULL THEN
    SELECT * INTO v_cat FROM public.material_catalog
    WHERE name ILIKE coalesce(v_order.items, 'Material from PO')
    LIMIT 1;

    IF FOUND THEN
      v_catalog_id := v_cat.id;
    ELSE
      INSERT INTO public.material_catalog (name, unit, category, reference_price)
      VALUES (coalesce(nullif(trim(v_order.items), ''), 'Material from PO'), 'Units', 'General', coalesce(v_order.total_price, 0))
      RETURNING id, name, unit INTO v_cat;
      v_catalog_id := v_cat.id;
    END IF;
  END IF;

  UPDATE public.purchase_orders
  SET material_id = v_catalog_id
  WHERE id = p_order_id;

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
    UPDATE public.materials
    SET current_stock = coalesce(current_stock, 0) + v_order.quantity_ordered,
        catalog_id = coalesce(catalog_id, v_catalog_id)
    WHERE id = v_stock_id;
  END IF;

  UPDATE public.purchase_orders
  SET status = 'Received', received_at = now(), received_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.notifications(user_id, project_id, target_role, title, message, type)
  VALUES
    (coalesce(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid), v_order.project_id, 'pm', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'general'::notification_type),
    (coalesce(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid), v_order.project_id, 'site_manager', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'general'::notification_type);

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.deliver_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_purchase_order(uuid) TO authenticated;
