-- ============================================================
-- Galaxy Mobile — إعداد جدول جلسات الهاتف
-- شغّل هذا SQL مرة واحدة في Supabase الخارجي الخاص بك
-- (Supabase Dashboard → SQL Editor → الصق ونفّذ)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.galaxy_mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  license_code text NOT NULL,
  control_code text NOT NULL,
  shop_name text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_used_at timestamptz,
  revoked boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_galaxy_mobile_sessions_token
  ON public.galaxy_mobile_sessions (token)
  WHERE revoked = false;

CREATE INDEX IF NOT EXISTS idx_galaxy_mobile_sessions_license
  ON public.galaxy_mobile_sessions (license_code);

ALTER TABLE public.galaxy_mobile_sessions ENABLE ROW LEVEL SECURITY;
-- لا نحتاج policies — الوصول حصراً عبر service_role من edge function

-- ✅ تمّ. الآن نظام QR Login جاهز للعمل.
