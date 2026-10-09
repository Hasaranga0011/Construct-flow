-- Restore a single inventory-write boundary after the October delivery trigger.
-- Requires the existing core tables and cf_current_role/cf_can_manage_project helpers.
-- Reinstall both RPCs so earlier same-day migration ordering cannot restore a
-- delivery-time stock increment. No existing stock quantities are rewritten.
BEGIN;
DROP TRIGGER IF EXISTS po_delivery_stock_trigger ON public.purchase_orders;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

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
  IF v_order.status <> 'Confirmed' THEN
    RAISE EXCEPTION 'Order must be confirmed before delivery';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'Delivered', delivered_at = now(), delivered_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.notifications(project_id, target_role, title, message, type)
  VALUES
    (v_order.project_id, 'pm', 'Goods delivered', 'Purchase order ' || v_order.po_number || ' is ready for receipt confirmation.', 'info'),
    (v_order.project_id, 'site_manager', 'Goods delivered', 'Purchase order ' || v_order.po_number || ' is ready for receipt confirmation.', 'info');

  RETURN to_jsonb(v_order);
END
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
  v_role text := public.cf_current_role();
  v_material_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;

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

  IF v_order.status = 'Received' THEN RETURN to_jsonb(v_order); END IF;
  
  -- Allow receipt directly from Pending Delivery (admin override) or Delivered
  IF v_order.status NOT IN ('Delivered', 'Pending Delivery') THEN
    RAISE EXCEPTION 'Order must be delivered or pending delivery before receipt confirmation';
  END IF;

  IF coalesce(v_order.quantity_ordered, 0) <= 0 THEN
    RAISE EXCEPTION 'Order has invalid quantity';
  END IF;

  -- Handle missing material_id gracefully by auto-creating it
  -- Legacy orders may hold a material name instead of a UUID.
  BEGIN
    v_material_id := nullif(v_order.material_id::text, '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    SELECT id INTO v_material_id FROM public.materials
    WHERE name = v_order.material_id::text
      AND project_id IS NOT DISTINCT FROM v_order.project_id
    ORDER BY id LIMIT 1;
  END;
  IF v_material_id IS NULL THEN
    INSERT INTO public.materials (project_id, name, unit, current_stock, minimum_threshold)
    VALUES (v_order.project_id, coalesce(nullif(v_order.material_id::text, ''), v_order.items::text, 'Material from PO'), 'Units', 0, 10)
    RETURNING id INTO v_material_id;

  END IF;

  UPDATE public.purchase_orders
  SET material_id = v_material_id
  WHERE id = p_order_id;

  -- Atomic update of materials stock
  UPDATE public.materials
  SET current_stock = coalesce(current_stock, 0) + v_order.quantity_ordered
  WHERE id = v_material_id;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found for stock update'; END IF;

  -- Update order status
  UPDATE public.purchase_orders
  SET status = 'Received', received_at = now(), received_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Fire notifications
  INSERT INTO public.notifications(project_id, target_role, title, message, type)
  VALUES
    (v_order.project_id, 'pm', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success'),
    (v_order.project_id, 'site_manager', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success');

  RETURN to_jsonb(v_order);
END
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;


REVOKE ALL ON FUNCTION public.deliver_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_purchase_order(uuid) TO authenticated;
COMMIT;
