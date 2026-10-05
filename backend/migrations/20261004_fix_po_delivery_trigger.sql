BEGIN;

-- Drop the trigger first
DROP TRIGGER IF EXISTS po_delivery_stock_trigger ON public.purchase_orders;

-- Recreate the function ensuring it explicitly uses NEW.material_id and casts it if necessary
CREATE OR REPLACE FUNCTION public.increment_site_stock_on_delivery()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status = 'Delivered' AND OLD.status != 'Delivered' THEN
        IF NEW.material_id IS NOT NULL THEN
            IF NEW.site_id IS NOT NULL THEN
                -- Ensure we insert into site_materials using strictly UUID
                INSERT INTO public.site_materials (site_id, material_id, stock_quantity)
                VALUES (NEW.site_id, NEW.material_id::uuid, NEW.quantity_ordered)
                ON CONFLICT (site_id, material_id) 
                DO UPDATE SET stock_quantity = site_materials.stock_quantity + NEW.quantity_ordered,
                              last_updated = now();
            ELSE
                -- Update global stock if no site is specified
                UPDATE public.materials 
                SET current_stock = COALESCE(current_stock, 0) + NEW.quantity_ordered
                WHERE id = NEW.material_id::uuid;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER po_delivery_stock_trigger
AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.increment_site_stock_on_delivery();

COMMIT;
