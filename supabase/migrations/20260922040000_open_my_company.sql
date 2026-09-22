-- Existing owners could not reach the dashboard: membership inserts were
-- blocked by circular admin RLS, created companies were invisible, and on
-- some live schemas even organization INSERT was denied. A single
-- security-definer entry point opens or creates the caller's company.

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

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM (
    SELECT org_id AS id, created_at FROM public.organization_members WHERE user_id = auth.uid()
    UNION ALL
    SELECT id, created_at FROM public.organizations WHERE created_by = auth.uid()
  ) orgs
  ORDER BY created_at
  LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.find_my_company()
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

  SELECT org_id INTO oid
  FROM public.organization_members
  WHERE user_id = uid
  ORDER BY created_at
  LIMIT 1;

  IF oid IS NULL THEN
    SELECT id INTO oid
    FROM public.organizations
    WHERE created_by = uid
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF oid IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (oid, uid, 'admin')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';

  RETURN oid;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_my_company(_name text DEFAULT 'My company')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  oid uuid;
  org_name text := nullif(trim(coalesce(_name, '')), '');
BEGIN
  oid := public.find_my_company();
  IF oid IS NOT NULL THEN
    RETURN oid;
  END IF;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (
    coalesce(org_name, 'My company'),
    'team-' || substr(uid::text, 1, 8) || '-' || substr(md5(random()::text), 1, 5),
    uid
  )
  RETURNING id INTO oid;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (oid, uid, 'admin')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';

  RETURN oid;
END;
$$;

REVOKE ALL ON FUNCTION public.created_this_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_created_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_my_company() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_my_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.created_this_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_created_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_my_company() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_my_company(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "orgs insert" ON public.organizations;
CREATE POLICY "orgs insert"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

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
