-- STEP 1: Standardize role values
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = 'super_admin' 
WHERE role IN ('Admin', 'admin');

UPDATE profiles SET role = 'pm' 
WHERE role IN ('Manager', 'manager', 'PM');

UPDATE profiles SET role = 'site_manager' 
WHERE role IN ('Site Manager', 'site manager');

UPDATE profiles SET role = 'client' 
WHERE role IN ('Client');

UPDATE profiles SET role = 'worker' 
WHERE role IN ('Worker');

UPDATE profiles SET role = 'supplier' 
WHERE role IN ('Supplier');

ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
  'super_admin','pm','site_manager',
  'client','worker','supplier'
));

-- STEP 2: Add missing columns to attendance
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qr_scan_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_id UUID;

-- STEP 3: Add missing columns to labour
ALTER TABLE labour
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS qr_url TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS joined_date DATE DEFAULT CURRENT_DATE;

-- STEP 4: Create sites table
CREATE TABLE IF NOT EXISTS sites (
  site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  site_manager_id UUID REFERENCES auth.users(id),
  address TEXT,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- STEP 5: Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  materials_supplied TEXT[],
  created_at TIMESTAMP DEFAULT now()
);

-- STEP 6: Add missing columns to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(supplier_id),
  ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id),
  ADD COLUMN IF NOT EXISTS quantity_ordered NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_delivery DATE,
  ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- STEP 7: Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
  quotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  created_by UUID REFERENCES auth.users(id),
  material_cost NUMERIC,
  labour_cost NUMERIC,
  equipment_cost NUMERIC,
  overhead NUMERIC,
  total_cost NUMERIC,
  timeline_days INTEGER,
  pdf_url TEXT,
  ai_generated BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'draft',
  sent_to_client BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

-- STEP 8: Create ml_predictions table
CREATE TABLE IF NOT EXISTS ml_predictions (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  delay_risk_score NUMERIC,
  cost_overrun_pct NUMERIC,
  resource_score NUMERIC,
  recommendation TEXT,
  confidence NUMERIC,
  created_at TIMESTAMP DEFAULT now()
);

-- STEP 9: Enable RLS on new tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;

-- STEP 10: Drop all broad "true" RLS policies
DROP POLICY IF EXISTS "true" ON projects;
DROP POLICY IF EXISTS "Allow all read access for projects" ON projects;
DROP POLICY IF EXISTS "Allow all insert access for projects" ON projects;
DROP POLICY IF EXISTS "Allow all update access for projects" ON projects;

DROP POLICY IF EXISTS "true" ON labour;
DROP POLICY IF EXISTS "Allow all read access for labour" ON labour;
DROP POLICY IF EXISTS "Allow all insert access for labour" ON labour;
DROP POLICY IF EXISTS "Allow all update access for labour" ON labour;

DROP POLICY IF EXISTS "true" ON attendance;
DROP POLICY IF EXISTS "Allow all read access for attendance" ON attendance;
DROP POLICY IF EXISTS "Allow all insert access for attendance" ON attendance;
DROP POLICY IF EXISTS "Allow all update access for attendance" ON attendance;

DROP POLICY IF EXISTS "true" ON materials;
DROP POLICY IF EXISTS "Allow all read access for materials" ON materials;
DROP POLICY IF EXISTS "Allow all insert access for materials" ON materials;
DROP POLICY IF EXISTS "Allow all update access for materials" ON materials;

DROP POLICY IF EXISTS "true" ON material_requests;
DROP POLICY IF EXISTS "Allow all read access for material_requests" ON material_requests;
DROP POLICY IF EXISTS "Allow all insert access for material_requests" ON material_requests;
DROP POLICY IF EXISTS "Allow all update access for material_requests" ON material_requests;

DROP POLICY IF EXISTS "true" ON invoices;
DROP POLICY IF EXISTS "Allow all access for invoices" ON invoices;

DROP POLICY IF EXISTS "true" ON photos;
DROP POLICY IF EXISTS "Allow all access for photos" ON photos;

DROP POLICY IF EXISTS "true" ON payroll;
DROP POLICY IF EXISTS "Allow all access for payroll" ON payroll;

DROP POLICY IF EXISTS "true" ON milestones;
DROP POLICY IF EXISTS "Allow all access for milestones" ON milestones;

DROP POLICY IF EXISTS "true" ON notifications;
DROP POLICY IF EXISTS "Allow all access for notifications" ON notifications;

DROP POLICY IF EXISTS "true" ON purchase_orders;

-- STEP 11: Create production RLS policies

-- PROJECTS
CREATE POLICY "projects_select" 
ON projects FOR SELECT USING (
  auth.uid() = client_id OR
  auth.uid() = pm_id OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

CREATE POLICY "projects_update"
ON projects FOR UPDATE USING (
  auth.uid() = pm_id OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- ATTENDANCE
CREATE POLICY "attendance_select"
ON attendance FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM labour
    WHERE id = attendance.worker_id
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN (
      'super_admin','pm','site_manager'
    )
  )
);

CREATE POLICY "attendance_insert"
ON attendance FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN (
      'super_admin','pm','site_manager'
    )
  )
);

CREATE POLICY "attendance_update"
ON attendance FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN (
      'super_admin','pm','site_manager'
    )
  )
);

-- PAYROLL
CREATE POLICY "payroll_select"
ON payroll FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM labour
    WHERE id = payroll.worker_id
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin','pm')
  )
);

-- PURCHASE ORDERS
CREATE POLICY "po_select"
ON purchase_orders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM suppliers
    WHERE supplier_id = purchase_orders.supplier_id
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin','pm')
  )
);

-- NOTIFICATIONS
CREATE POLICY "notifications_select"
ON notifications FOR SELECT USING (
  auth.uid() = user_id OR
  target_role = 'All' OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = target_role
  )
);

-- MILESTONES
CREATE POLICY "milestones_select"
ON milestones FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE id = milestones.project_id
    AND (
      client_id = auth.uid() OR
      pm_id = auth.uid()
    )
  ) OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- SUPPLIERS
CREATE POLICY "suppliers_select"
ON suppliers FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin','pm')
  )
);

-- QUOTATIONS
CREATE POLICY "quotations_select"
ON quotations FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM projects
    WHERE id = quotations.project_id
    AND client_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- STEP 12: Low stock Supabase trigger
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.global_stock_quantity < NEW.low_stock_threshold THEN
    INSERT INTO notifications (
      title, message, type, target_role, is_read
    ) VALUES (
      'Low Stock: ' || NEW.item_name,
      'Only ' || NEW.global_stock_quantity || ' ' || NEW.unit || ' remaining',
      'alert',
      'super_admin',
      false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS low_stock_trigger ON materials;

CREATE TRIGGER low_stock_trigger
AFTER UPDATE ON materials
FOR EACH ROW EXECUTE FUNCTION check_low_stock();
