-- Enforce that purchase orders can only be created for assigned suppliers
CREATE OR REPLACE FUNCTION check_valid_supplier_assignment()
RETURNS TRIGGER AS $$
DECLARE
    is_assigned BOOLEAN;
BEGIN
    -- Check if the supplier is assigned to the project
    SELECT EXISTS (
        SELECT 1 
        FROM project_role_assignments 
        WHERE project_id = NEW.project_id 
          AND user_id = NEW.supplier_id 
          AND role = 'supplier'
    ) INTO is_assigned;

    IF NOT is_assigned THEN
        RAISE EXCEPTION 'Supplier % is not assigned to project %', NEW.supplier_id, NEW.project_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_supplier_assignment ON purchase_orders;

CREATE TRIGGER trg_enforce_supplier_assignment
BEFORE INSERT OR UPDATE OF project_id, supplier_id ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION check_valid_supplier_assignment();
