-- ConstructFlow Schema Part 2 (Client & Media)

-- 1. Client Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES public.projects(id),
    amount NUMERIC NOT NULL,
    description TEXT NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Overdue')),
    paid_date DATE
);

-- 2. Project Media (Photos/Docs) Table
CREATE TABLE IF NOT EXISTS public.photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES public.projects(id),
    uploaded_by UUID REFERENCES auth.users(id),
    url TEXT NOT NULL,
    caption TEXT,
    category TEXT DEFAULT 'Progress'
);

-- 3. Messages Table (PM & Client Chat)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sender_id UUID REFERENCES auth.users(id),
    receiver_id UUID REFERENCES auth.users(id),
    project_id UUID REFERENCES public.projects(id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Permissive Policies (FOR DEVELOPMENT MVP ONLY)
CREATE POLICY "Allow all access for invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access for photos" ON public.photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access for messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
