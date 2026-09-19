INSERT INTO public.integration_settings (provider, label, category, status)
VALUES ('thekyb', 'The KYB', 'registry', 'not_configured')
ON CONFLICT (provider) DO UPDATE
  SET label = EXCLUDED.label, category = EXCLUDED.category;

INSERT INTO public.api_notepad (title, purpose, status, notes)
SELECT
  'The KYB',
  'Live corporate registry lookup — legal name, status, officers and beneficial owners from official registries.',
  'keys_needed',
  'Generate the API secret key at https://backoffice.thekyb.com/ (Settings → API integration) and paste it in the form on this page. Docs: https://developers.thekyb.com/docs/services/kyb_check_v2'
WHERE NOT EXISTS (SELECT 1 FROM public.api_notepad WHERE title = 'The KYB');

CREATE TABLE public.integration_secrets (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  last4 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

REVOKE ALL ON public.integration_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.thekyb_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  kyb_request_id text,
  kyb_response_id text,
  query_name text,
  registration_number text,
  country_code text,
  matched_name text,
  registry_status text,
  company_type text,
  risk_level text,
  verification_status text,
  fetch_status text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparisons jsonb NOT NULL DEFAULT '[]'::jsonb,
  result text NOT NULL DEFAULT 'review',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX thekyb_lookups_case_idx ON public.thekyb_lookups (case_id, created_at DESC);
CREATE INDEX thekyb_lookups_org_idx ON public.thekyb_lookups (org_id, created_at DESC);

GRANT SELECT, INSERT ON public.thekyb_lookups TO authenticated;
GRANT ALL ON public.thekyb_lookups TO service_role;
ALTER TABLE public.thekyb_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read thekyb lookups"
  ON public.thekyb_lookups FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.is_platform_staff());

CREATE POLICY "writers insert thekyb lookups"
  ON public.thekyb_lookups FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND public.can_write(auth.uid()));
