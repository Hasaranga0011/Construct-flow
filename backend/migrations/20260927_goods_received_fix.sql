BEGIN;

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
  v_material_id := v_order.material_id;
  IF v_material_id IS NULL THEN
    INSERT INTO public.materials (project_id, name, unit, global_stock_quantity, low_stock_threshold)
    VALUES (v_order.project_id, coalesce(v_order.items, 'Material from PO'), 'Units', 0, 10)
    RETURNING id INTO v_material_id;

    UPDATE public.purchase_orders
    SET material_id = v_material_id
    WHERE id = p_order_id;
  END IF;

  -- Atomic update of materials stock
  UPDATE public.materials
  SET global_stock_quantity = coalesce(global_stock_quantity, 0) + v_order.quantity_ordered
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

COMMIT;
