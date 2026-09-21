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

CREATE OR REPLACE FUNCTION public.create_company_workspace(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  oid uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (_name, _slug, uid)
  RETURNING id INTO oid;
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (oid, uid, 'admin');
  RETURN oid;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_company_workspace(text, text) TO authenticated;

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
