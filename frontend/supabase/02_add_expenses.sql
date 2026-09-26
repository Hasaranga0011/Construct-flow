-- Add spent_cost to projects table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'spent_cost'
  ) THEN
    ALTER TABLE projects ADD COLUMN spent_cost NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Create project_expenses table
CREATE TABLE IF NOT EXISTS project_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS for expenses
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

-- Expense access is installed by backend/migrations/20260925_harden_core_rls.sql.
-- With RLS enabled and no bootstrap policy, this table fails closed.
