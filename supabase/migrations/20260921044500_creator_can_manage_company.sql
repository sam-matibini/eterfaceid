-- Creators must manage the company they inserted even when the
-- organization_members row was blocked by circular admin RLS.
-- SECURITY DEFINER helpers can read organizations.created_by without
-- going through the member-only SELECT policy.

CREATE OR REPLACE FUNCTION public.created_this_org(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = _org AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members WHERE org_id = _org AND user_id = auth.uid()
  ) OR public.created_this_org(_org);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE org_id = _org AND user_id = auth.uid() AND role = _role
  ) OR (_role = 'admin' AND public.created_this_org(_org));
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE org_id = _org AND user_id = auth.uid() AND role IN ('admin', 'analyst')
  ) OR public.created_this_org(_org);
$$;

CREATE OR REPLACE FUNCTION public.current_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM public.organizations WHERE created_by = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.created_this_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.created_this_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS "orgs read created" ON public.organizations;
CREATE POLICY "orgs read created"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "orgs creator update" ON public.organizations;
CREATE POLICY "orgs creator update"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "creator joins as first admin" ON public.organization_members;
CREATE POLICY "creator joins as first admin"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND public.created_this_org(org_id)
  );

DROP POLICY IF EXISTS "creator manages members" ON public.organization_members;
CREATE POLICY "creator manages members"
  ON public.organization_members
  FOR ALL
  TO authenticated
  USING (public.created_this_org(org_id))
  WITH CHECK (public.created_this_org(org_id));

DROP POLICY IF EXISTS "creator manages invites" ON public.organization_invites;
CREATE POLICY "creator manages invites"
  ON public.organization_invites
  FOR ALL
  TO authenticated
  USING (public.created_this_org(org_id))
  WITH CHECK (public.created_this_org(org_id));

DROP POLICY IF EXISTS "creator reads applications" ON public.org_applications;
CREATE POLICY "creator reads applications"
  ON public.org_applications
  FOR SELECT
  TO authenticated
  USING (public.created_this_org(org_id));

DROP POLICY IF EXISTS "creator writes applications" ON public.org_applications;
CREATE POLICY "creator writes applications"
  ON public.org_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.created_this_org(org_id));

DROP POLICY IF EXISTS "creator updates applications" ON public.org_applications;
CREATE POLICY "creator updates applications"
  ON public.org_applications
  FOR UPDATE
  TO authenticated
  USING (public.created_this_org(org_id));

CREATE OR REPLACE FUNCTION public.join_created_company(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.created_this_org(_org_id) THEN
    RAISE EXCEPTION 'Not the company creator';
  END IF;
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_org_id, uid, 'admin')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';
  RETURN _org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_created_company(_org_id uuid, _name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  UPDATE public.organizations
     SET name = trim(_name)
   WHERE id = _org_id
     AND created_by = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not the company creator';
  END IF;
  PERFORM public.join_created_company(_org_id);
  RETURN _org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_created_company_member(_org_id uuid, _user_id uuid, _role text DEFAULT 'viewer')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  next_role public.app_role;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.created_this_org(_org_id) THEN
    RAISE EXCEPTION 'Not the company creator';
  END IF;
  next_role := CASE lower(coalesce(_role, 'viewer'))
    WHEN 'admin' THEN 'admin'::public.app_role
    WHEN 'analyst' THEN 'analyst'::public.app_role
    ELSE 'viewer'::public.app_role
  END;
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_org_id, _user_id, next_role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_to_created_company(
  _org_id uuid,
  _email text,
  _role text,
  _token_hash text,
  _expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  invite_id uuid;
  next_role public.app_role;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.created_this_org(_org_id) THEN
    RAISE EXCEPTION 'Not the company creator';
  END IF;
  next_role := CASE lower(coalesce(_role, 'viewer'))
    WHEN 'admin' THEN 'admin'::public.app_role
    WHEN 'analyst' THEN 'analyst'::public.app_role
    ELSE 'viewer'::public.app_role
  END;
  INSERT INTO public.organization_invites (org_id, email, role, token_hash, invited_by, expires_at)
  VALUES (_org_id, lower(_email), next_role, _token_hash, uid, _expires_at)
  RETURNING id INTO invite_id;
  RETURN invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_created_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_created_company(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_created_company_member(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_to_created_company(uuid, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_created_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_created_company(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_created_company_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_created_company(uuid, text, text, text, timestamptz) TO authenticated;
