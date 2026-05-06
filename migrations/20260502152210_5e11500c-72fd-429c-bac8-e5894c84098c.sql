-- إضافة أعمدة التحكم في خاصية الهاتف لكل ترخيص
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS mobile_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobile_max_devices integer NOT NULL DEFAULT 1;

-- فهرس لتسريع البحث عن الجلسات النشطة لترخيص معيّن
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_license_active
  ON public.galaxy_mobile_sessions (license_code)
  WHERE revoked = false;