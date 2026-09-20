CREATE TABLE public.thekyb_lookups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  case_id uuid not null references public.cases(id) on delete cascade,
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
  profile jsonb not null default '{}'::jsonb,
  comparisons jsonb not null default '[]'::jsonb,
  result text,
  created_by uuid,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.thekyb_lookups TO authenticated;
GRANT ALL ON public.thekyb_lookups TO service_role;
ALTER TABLE public.thekyb_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read org registry lookups" ON public.thekyb_lookups
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Writers add registry lookups" ON public.thekyb_lookups
  FOR INSERT TO authenticated WITH CHECK (public.can_write_org(org_id));
CREATE TRIGGER set_org BEFORE INSERT ON public.thekyb_lookups
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_case();
CREATE INDEX thekyb_lookups_case_idx ON public.thekyb_lookups (case_id, created_at DESC);

CREATE TABLE public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  api_key text not null,
  last4 text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;