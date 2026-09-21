-- App admin owners can add developer and operations staff.
DROP POLICY IF EXISTS "staff owners insert staff" ON public.platform_staff;
CREATE POLICY "staff owners insert staff"
  ON public.platform_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_staff()
    AND EXISTS (
      SELECT 1 FROM public.platform_staff s
      WHERE s.user_id = auth.uid() AND s.level = 'owner'
    )
  );

DROP POLICY IF EXISTS "staff owners update staff" ON public.platform_staff;
CREATE POLICY "staff owners update staff"
  ON public.platform_staff
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_staff s
      WHERE s.user_id = auth.uid() AND s.level = 'owner'
    )
  );

DROP POLICY IF EXISTS "staff owners delete staff" ON public.platform_staff;
CREATE POLICY "staff owners delete staff"
  ON public.platform_staff
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_staff s
      WHERE s.user_id = auth.uid() AND s.level = 'owner'
    )
  );

DROP POLICY IF EXISTS "staff read company members" ON public.organization_members;
CREATE POLICY "staff read company members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (public.is_platform_staff());
