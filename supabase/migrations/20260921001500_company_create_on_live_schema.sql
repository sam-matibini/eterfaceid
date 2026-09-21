-- Let the person who created a company join it as the first admin
-- without waiting for service-role or the later RBAC columns.
DROP POLICY IF EXISTS "creator joins as first admin" ON public.organization_members;
CREATE POLICY "creator joins as first admin"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = org_id
        AND o.created_by = auth.uid()
    )
  );

-- Optional profile columns. Safe if they already exist.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS primary_admin_user_id uuid REFERENCES auth.users(id);
