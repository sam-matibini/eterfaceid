CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ensure_ops_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  mail text;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT email INTO mail FROM auth.users WHERE id = uid;
  IF lower(coalesce(mail, '')) NOT IN ('ops@eterfaceid.com') THEN
    RETURN false;
  END IF;
  INSERT INTO public.platform_staff (user_id, email, level)
  VALUES (uid, mail, 'owner')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_ops_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_ops_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_bootstrap_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'ops@eterfaceid.com' THEN
    INSERT INTO public.platform_staff (user_id, email, level)
    VALUES (NEW.id, NEW.email, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_bootstrap_staff ON auth.users;
CREATE TRIGGER on_auth_user_bootstrap_staff
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_bootstrap_staff();

GRANT INSERT ON public.platform_staff TO authenticated;
DROP POLICY IF EXISTS "bootstrap ops can claim staff" ON public.platform_staff;
CREATE POLICY "bootstrap ops can claim staff"
  ON public.platform_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lower(coalesce(email, '')) = 'ops@eterfaceid.com'
  );

DO $$
DECLARE
  uid uuid;
  instance uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'ops@eterfaceid.com';
  SELECT COALESCE(
    (SELECT instance_id FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) INTO instance;

  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      instance,
      uid,
      'authenticated',
      'authenticated',
      'ops@eterfaceid.com',
      extensions.crypt('eterfaceid', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"eterfaceID staff"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        uid,
        uid,
        jsonb_build_object('sub', uid::text, 'email', 'ops@eterfaceid.com', 'email_verified', true),
        'email',
        uid::text,
        now(),
        now(),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO auth.identities (
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        uid,
        jsonb_build_object('sub', uid::text, 'email', 'ops@eterfaceid.com', 'email_verified', true),
        'email',
        uid::text,
        now(),
        now(),
        now()
      );
    END;
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt('eterfaceid', extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = uid;
  END IF;

  INSERT INTO public.platform_staff (user_id, email, level)
  VALUES (uid, 'ops@eterfaceid.com', 'owner')
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, level = 'owner';
END $$;
