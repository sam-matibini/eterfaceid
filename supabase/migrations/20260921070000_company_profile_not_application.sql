-- Company profile is stored on organizations. org_applications is the go-live
-- KYB table. Creators must still be able to insert a draft there later, and
-- the existing name-only RPC keeps joining the creator as the first admin.

DROP POLICY IF EXISTS "creators manage applications" ON public.org_applications;
CREATE POLICY "creators manage applications"
  ON public.org_applications
  FOR ALL
  TO authenticated
  USING (public.created_this_org(org_id))
  WITH CHECK (public.created_this_org(org_id));
