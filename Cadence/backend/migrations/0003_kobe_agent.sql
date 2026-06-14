-- ── 0003_kobe_agent.sql ───────────────────────────────────────────────────
-- Creates a dedicated Kobe agent login and grants it read/write access to
-- all of Rodney's Cadence data via updated RLS policies.
--
-- BEFORE RUNNING:
--   Replace REPLACE_WITH_KOBE_PASSWORD with the password you will store in
--   the Mac Keychain. Do that find-and-replace in the SQL editor before
--   clicking Run — do not paste the password into chat.
--
-- Run in: https://supabase.com/dashboard/project/uimjzehrykeebocphdna/editor

-- ── Step 1: Create Kobe's auth user (email confirmation bypassed) ──────────
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  role, aud, raw_app_meta_data, raw_user_meta_data
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'kobe-agent@cadence.app',
  crypt('REPLACE_WITH_KOBE_PASSWORD', gen_salt('bf')),
  now(), now(), now(),
  'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'kobe-agent@cadence.app'
);

-- ── Step 2: Auth identity record ───────────────────────────────────────────
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(), now(), now()
FROM auth.users u
WHERE u.email = 'kobe-agent@cadence.app'
ON CONFLICT DO NOTHING;

-- ── Step 3: Update RLS on all 12 tables so Kobe reads/writes Rodney's rows ─
DO $$
DECLARE
  rodney_id uuid;
  kobe_id   uuid;
  t         text;
BEGIN
  SELECT id INTO rodney_id FROM auth.users WHERE email = 'rbalech@gmail.com';
  SELECT id INTO kobe_id   FROM auth.users WHERE email = 'kobe-agent@cadence.app';

  RAISE NOTICE '=== Cadence agent setup ===';
  RAISE NOTICE 'Rodney UUID : %', rodney_id;
  RAISE NOTICE 'Kobe UUID   : %', kobe_id;
  RAISE NOTICE 'Give Kobe these two values. Kobe must pass owner_id = Rodney UUID on every INSERT.';

  FOREACH t IN ARRAY ARRAY[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity'
  ] LOOP

    -- SELECT
    EXECUTE format('DROP POLICY IF EXISTS %s_select ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %s_select ON %I FOR SELECT USING (
         owner_id = auth.uid()
         OR (auth.uid() = %L::uuid AND owner_id = %L::uuid)
       )', t, t, kobe_id::text, rodney_id::text
    );

    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS %s_insert ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %s_insert ON %I FOR INSERT WITH CHECK (
         owner_id = auth.uid()
         OR (auth.uid() = %L::uuid AND owner_id = %L::uuid)
       )', t, t, kobe_id::text, rodney_id::text
    );

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS %s_update ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %s_update ON %I FOR UPDATE
         USING    (owner_id = auth.uid() OR (auth.uid() = %L::uuid AND owner_id = %L::uuid))
         WITH CHECK (owner_id = auth.uid() OR (auth.uid() = %L::uuid AND owner_id = %L::uuid))
       ', t, t, kobe_id::text, rodney_id::text, kobe_id::text, rodney_id::text
    );

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS %s_delete ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %s_delete ON %I FOR DELETE USING (
         owner_id = auth.uid()
         OR (auth.uid() = %L::uuid AND owner_id = %L::uuid)
       )', t, t, kobe_id::text, rodney_id::text
    );

  END LOOP;

  RAISE NOTICE 'Done. Kobe can now read/write all of Rodney''s Cadence data.';
END $$;
