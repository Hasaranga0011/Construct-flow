-- Supplier Dashboard Tables

-- 1. Create the purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    supplier_name TEXT NOT NULL,
    po_number TEXT NOT NULL UNIQUE,
    items TEXT NOT NULL,
    expected_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Pending Delivery', 'Delivered', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    amount NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Processing', 'Paid', 'Overdue')),
    paid_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optional: Insert some mock data for testing (Requires at least one project to exist)
-- Replace the project_id below with an actual project_id from your projects table if you want a mock PO.
-- DO NOT run the mock inserts if you don't have projects.
/*
INSERT INTO public.purchase_orders (project_id, supplier_name, po_number, items, expected_date, status)
SELECT 
  id, 
  'Supplier', -- Create an account with full_name 'Supplier'
  'PO-2026-089', 
  '500x Cement Bags (50kg)', 
  '2026-07-20', 
  'Pending Delivery'
FROM public.projects LIMIT 1;

INSERT INTO public.invoices (po_id, invoice_number, amount, status)
SELECT 
  id, 
  'INV-4022', 
  850000, 
  'Paid'
FROM public.purchase_orders WHERE po_number = 'PO-2026-089' LIMIT 1;
*/
