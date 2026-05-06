-- ============================================================
-- Galaxy — نقل نظام التراخيص إلى Supabase الخاص بك
-- شغّل هذا SQL مرة واحدة في Supabase Dashboard → SQL Editor
-- ============================================================

-- 1️⃣ جدول التراخيص الرئيسي
CREATE TABLE IF NOT EXISTS public.licenses (
  code text PRIMARY KEY,
  status text NOT NULL DEFAULT 'unused',
  duration_days integer NOT NULL DEFAULT 365,
  device_id text,
  device_name text,
  activated_at timestamptz,
  expires_at timestamptz,
  customer_name text,
  customer_phone text,
  notes text,
  ai_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_device ON public.licenses(device_id);

-- 2️⃣ جدول كلمات مرور التراخيص (للمصادقة)
CREATE TABLE IF NOT EXISTS public.license_auth (
  license_code text PRIMARY KEY REFERENCES public.licenses(code) ON DELETE CASCADE,
  verifier_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3️⃣ تفعيل RLS — الوصول حصراً عبر service_role (من edge functions)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_auth ENABLE ROW LEVEL SECURITY;

-- ✅ تمّ! الآن جداول التراخيص جاهزة في Supabase الخاص بك.
-- الخطوة التالية: نقل Edge Functions
