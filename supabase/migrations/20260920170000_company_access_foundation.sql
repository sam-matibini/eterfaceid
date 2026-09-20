-- Company identity, RBAC, environment separation, invitations, live-access
-- requests, API request logs and richer audit metadata.
-- Access roles are stored on the membership; app_role stays the coarse
-- RLS write/read split (admin / analyst / viewer).

-- 1. Organization profile
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

UPDATE public.organizations SET legal_name = name WHERE legal_name IS NULL;

-- 2. Membership: access role, environments, granular permissions
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS sandbox_access boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS live_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_access_role_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_access_role_check
  CHECK (access_role IN ('owner','administrator','developer','compliance','analyst','viewer'));

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_user_type_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_type_check
  CHECK (user_type IN ('employee','contractor','consultant'));

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_status_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_check
  CHECK (status IN ('invited','active','disabled'));

UPDATE public.organization_members
SET
  access_role = CASE
    WHEN role = 'admin' THEN 'administrator'
    WHEN role = 'analyst' THEN 'analyst'
    ELSE 'viewer'
  END,
  is_owner = (role = 'admin'),
  live_access = (role = 'admin'),
  mfa_required = (role = 'admin'),
  permissions = CASE
    WHEN role = 'admin' THEN ARRAY[
      'docs.view','sandbox.api','live.api','kyc.reports.view','kyb.reports.view','aml.results.view',
      'reports.download','api_keys.create','webhooks.manage','api_logs.view','users.manage',
      'roles.manage','billing.manage','live.environment.manage'
    ]
    WHEN role = 'analyst' THEN ARRAY[
      'docs.view','sandbox.api','kyc.reports.view','kyb.reports.view','aml.results.view','reports.download'
    ]
    ELSE ARRAY['docs.view']
  END
WHERE permissions = '{}' OR access_role = 'viewer';

-- One owner per existing org: the earliest admin.
WITH first_admin AS (
  SELECT DISTINCT ON (org_id) id
  FROM public.organization_members
  WHERE role = 'admin'
  ORDER BY org_id, created_at
)
UPDATE public.organization_members m
SET is_owner = true, access_role = 'owner'
FROM first_admin
WHERE m.id = first_admin.id;

-- 3. Invitations
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS sandbox_access boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS live_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resent_at timestamptz;

ALTER TABLE public.organization_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '72 hours');

-- 4. Per-org environments (sandbox always; live is the production boundary)
CREATE TABLE IF NOT EXISTS public.org_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('sandbox','live')),
  label text NOT NULL,
  publishable_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.org_environments TO authenticated;
GRANT ALL ON public.org_environments TO service_role;
ALTER TABLE public.org_environments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "env read" ON public.org_environments;
CREATE POLICY "env read" ON public.org_environments FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "env admin write" ON public.org_environments;
CREATE POLICY "env admin write" ON public.org_environments FOR ALL TO authenticated
  USING (public.has_org_role(org_id, 'admin'))
  WITH CHECK (public.has_org_role(org_id, 'admin'));

INSERT INTO public.org_environments (org_id, code, label, publishable_prefix)
SELECT id, 'sandbox', 'Sandbox', 'ef_test_' FROM public.organizations
ON CONFLICT (org_id, code) DO NOTHING;
INSERT INTO public.org_environments (org_id, code, label, publishable_prefix)
SELECT id, 'live', 'Live', 'ef_live_' FROM public.organizations
ON CONFLICT (org_id, code) DO NOTHING;

-- 5. Live access requests (user-level, distinct from org go-live)
CREATE TABLE IF NOT EXISTS public.live_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  reason text,
  scopes text[] NOT NULL DEFAULT ARRAY['live.api','kyc.reports.view','kyb.reports.view','aml.results.view'],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_access_requests_org_idx ON public.live_access_requests (org_id, status);
GRANT SELECT, INSERT, UPDATE ON public.live_access_requests TO authenticated;
GRANT ALL ON public.live_access_requests TO service_role;
ALTER TABLE public.live_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live req read" ON public.live_access_requests;
CREATE POLICY "live req read" ON public.live_access_requests FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) AND (user_id = auth.uid() OR public.has_org_role(org_id, 'admin')));
DROP POLICY IF EXISTS "live req insert" ON public.live_access_requests;
CREATE POLICY "live req insert" ON public.live_access_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND user_id = auth.uid());
DROP POLICY IF EXISTS "live req admin update" ON public.live_access_requests;
CREATE POLICY "live req admin update" ON public.live_access_requests FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, 'admin'))
  WITH CHECK (public.has_org_role(org_id, 'admin'));

CREATE TRIGGER live_access_requests_touch BEFORE UPDATE ON public.live_access_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Login / security events
CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  email text,
  event text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_user_idx ON public.login_events (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "login events self" ON public.login_events;
CREATE POLICY "login events self" ON public.login_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, 'admin'));
DROP POLICY IF EXISTS "login events insert" ON public.login_events;
CREATE POLICY "login events insert" ON public.login_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 7. API request logs (tenant + environment scoped)
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  method text NOT NULL,
  path text NOT NULL,
  status integer,
  success boolean,
  ip_address text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_request_logs_org_idx ON public.api_request_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_request_logs_env_idx ON public.api_request_logs (org_id, environment, created_at DESC);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api logs read" ON public.api_request_logs;
CREATE POLICY "api logs read" ON public.api_request_logs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- 8. API key scopes + kind (publishable vs secret)
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_kind text NOT NULL DEFAULT 'secret',
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['sandbox.api'];

ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_key_kind_check;
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_key_kind_check CHECK (key_kind IN ('secret','publishable'));

-- 9. Richer audit metadata (before/after stay in detail jsonb)
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true;

-- 10. Permission helper — admin or explicit grant
CREATE OR REPLACE FUNCTION public.has_org_permission(_org uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org
      AND user_id = auth.uid()
      AND status = 'active'
      AND (
        is_owner
        OR role = 'admin'
        OR access_role IN ('owner','administrator')
        OR _perm = ANY (permissions)
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_org_permission(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_org_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.member_has_live_access(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org
      AND user_id = auth.uid()
      AND status = 'active'
      AND live_access = true
  )
$$;
REVOKE EXECUTE ON FUNCTION public.member_has_live_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.member_has_live_access(uuid) TO authenticated, service_role;

-- 11. API key / webhook writes follow granular permissions
DROP POLICY IF EXISTS "keys admin write" ON public.api_keys;
DROP POLICY IF EXISTS "keys write" ON public.api_keys;
CREATE POLICY "keys write" ON public.api_keys FOR ALL TO authenticated
  USING (public.has_org_permission(org_id, 'api_keys.create'))
  WITH CHECK (public.has_org_permission(org_id, 'api_keys.create'));

DROP POLICY IF EXISTS "webhooks admin write" ON public.webhook_endpoints;
DROP POLICY IF EXISTS "webhooks write" ON public.webhook_endpoints;
CREATE POLICY "webhooks write" ON public.webhook_endpoints FOR ALL TO authenticated
  USING (public.has_org_permission(org_id, 'webhooks.manage'))
  WITH CHECK (public.has_org_permission(org_id, 'webhooks.manage'));
