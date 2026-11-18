-- Quantity-aware receipts with replay protection and an immutable movement ledger.
BEGIN;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quantity_received numeric NOT NULL DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.delivery_receipts(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),quantity numeric NOT NULL CHECK(quantity>0),
 received_by uuid NOT NULL REFERENCES auth.users(id),received_at timestamptz NOT NULL DEFAULT now(),note text
);
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receipt_project_read ON public.delivery_receipts;
CREATE POLICY receipt_project_read ON public.delivery_receipts FOR SELECT TO authenticated USING(public.cf_project_access(project_id));
REVOKE ALL ON public.delivery_receipts FROM anon,authenticated;
GRANT SELECT ON public.delivery_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_quantity(p_order_id uuid,p_quantity numeric DEFAULT NULL,p_receipt_id uuid DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE po public.purchase_orders%ROWTYPE; mat public.materials%ROWTYPE; cat public.material_catalog%ROWTYPE;
 qty numeric; receipt uuid:=coalesce(p_receipt_id,gen_random_uuid());
BEGIN
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm','site_manager')
 OR NOT (public.cf_can_manage_project(po.project_id) OR EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=po.project_id AND site_manager_id=auth.uid())) THEN
 RAISE EXCEPTION 'Only assigned project staff can receive goods' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_receipts WHERE id=receipt AND order_id=po.id) THEN RETURN to_jsonb(po); END IF;
 IF po.status='Received' THEN RETURN to_jsonb(po); END IF;
 IF po.status<>'Delivered' THEN RAISE EXCEPTION 'Supplier must report delivery before goods can be received'; END IF;
 PERFORM 1 FROM public.projects WHERE id=po.project_id FOR UPDATE;
 qty:=coalesce(p_quantity,po.quantity_ordered-po.quantity_received);
 IF qty<=0 OR qty>po.quantity_ordered-po.quantity_received OR qty::text IN ('NaN','Infinity','-Infinity') THEN
 RAISE EXCEPTION 'Received quantity exceeds outstanding quantity or is invalid'; END IF;
 SELECT * INTO mat FROM public.materials WHERE id=po.material_id::uuid AND project_id=po.project_id FOR UPDATE;
 IF NOT FOUND THEN
   SELECT * INTO cat FROM public.material_catalog WHERE id=po.material_id::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Order material is not a valid project material or catalog entry'; END IF;
   -- Serialize stock-row creation for distinct orders containing the same item.
   PERFORM 1 FROM public.projects WHERE id=po.project_id FOR UPDATE;
   SELECT * INTO mat FROM public.materials WHERE project_id=po.project_id AND catalog_id=cat.id LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN
     -- BOQ baselines may predate catalog links. Reuse matching stock, never duplicate it.
     SELECT * INTO mat FROM public.materials WHERE project_id=po.project_id AND catalog_id IS NULL
       AND lower(trim(name))=lower(trim(cat.name)) AND lower(trim(unit))=lower(trim(cat.unit)) LIMIT 1 FOR UPDATE;
     IF FOUND THEN
       UPDATE public.materials SET catalog_id=cat.id WHERE id=mat.id RETURNING * INTO mat;
     ELSE
       INSERT INTO public.materials(id,project_id,catalog_id,name,unit,current_stock,minimum_threshold,unit_price)
       VALUES(gen_random_uuid(),po.project_id,cat.id,cat.name,cat.unit,0,10,po.unit_price) RETURNING * INTO mat;
     END IF;
   END IF;
 END IF;
 UPDATE public.materials SET unit_price=CASE WHEN coalesce(current_stock,0)+qty>0
   THEN round((coalesce(current_stock,0)*coalesce(unit_price,0)+qty*po.unit_price)/(coalesce(current_stock,0)+qty),2)
   ELSE po.unit_price END,current_stock=coalesce(current_stock,0)+qty WHERE id=mat.id;
 INSERT INTO public.delivery_receipts(id,order_id,project_id,quantity,received_by,note) VALUES(receipt,po.id,po.project_id,qty,auth.uid(),p_note);
 UPDATE public.purchase_orders SET quantity_received=quantity_received+qty,
 status=CASE WHEN quantity_received+qty>=quantity_ordered THEN 'Received' ELSE 'Delivered' END,
 received_at=CASE WHEN quantity_received+qty>=quantity_ordered THEN now() ELSE received_at END,
 received_by=auth.uid() WHERE id=po.id RETURNING * INTO po;
 RETURN to_jsonb(po);
END $$;
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.receive_purchase_order_quantity(p_order_id) $$;
REVOKE ALL ON FUNCTION public.receive_purchase_order_quantity(uuid,numeric,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_quantity(uuid,numeric,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;
COMMIT;
