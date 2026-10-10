CREATE TABLE IF NOT EXISTS public.public_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    project_name TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.public_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (since it's a public contact form)
CREATE POLICY "Allow anonymous inserts"
    ON public.public_inquiries FOR INSERT
    WITH CHECK (true);

-- Allow only admins to select/update/delete
CREATE POLICY "Allow admin full access"
    ON public.public_inquiries FOR ALL
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );
