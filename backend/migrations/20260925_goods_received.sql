-- Goods-received boundary for purchase orders.
-- Apply after 20260925_workflow_integrity.sql as a database owner.
-- Supplier delivery does not increase stock; PM/site-manager receipt does.
BEGIN;

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
  IF v_order.status <> 'Delivered' THEN
    RAISE EXCEPTION 'Order must be delivered before receipt confirmation';
  END IF;
  IF v_order.material_id IS NULL OR coalesce(v_order.quantity_ordered, 0) <= 0 THEN
    RAISE EXCEPTION 'Order has invalid material or quantity';
  END IF;

  UPDATE public.materials
  SET global_stock_quantity = coalesce(global_stock_quantity, 0) + v_order.quantity_ordered
  WHERE id = v_order.material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;

  UPDATE public.purchase_orders
  SET status = 'Received', received_at = now(), received_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.notifications(project_id, target_role, title, message, type)
  VALUES
    (v_order.project_id, 'pm', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success'),
    (v_order.project_id, 'site_manager', 'Goods received', 'Purchase order ' || v_order.po_number || ' was received and added to stock.', 'success');

  RETURN to_jsonb(v_order);
END
$$;

REVOKE ALL ON FUNCTION public.deliver_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_purchase_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;

COMMIT;
