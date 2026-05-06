-- ========== LICENSES ==========
CREATE TABLE IF NOT EXISTS public.licenses (
  code TEXT PRIMARY KEY,
  duration_days INTEGER NOT NULL DEFAULT 365,
  device_id TEXT,
  device_name TEXT,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','active','expired','revoked')),
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_device ON public.licenses(device_id);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- لا policies = مغلق تماماً للـ anon. فقط service role في Edge Functions يقرأ/يكتب.

-- ========== DEV ACCESS ATTEMPTS ==========
CREATE TABLE IF NOT EXISTS public.dev_access_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT,
  device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_attempts_created ON public.dev_access_attempts(created_at DESC);

ALTER TABLE public.dev_access_attempts ENABLE ROW LEVEL SECURITY;

-- ========== TRIGGER updated_at ==========
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();