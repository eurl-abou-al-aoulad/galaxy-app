-- جدول جلسات الهاتف (مثل QR WhatsApp Web)
-- البرنامج المكتبي ينشئ جلسة برمز عشوائي قصير العمر
-- الهاتف يمسح QR ويستخدم الرمز للدخول مباشرة بدون كتابة أي شيء
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

-- RLS مفعّلة، لكن لا توجد سياسات عامة — الوصول حصراً عبر edge function (service role)
ALTER TABLE public.galaxy_mobile_sessions ENABLE ROW LEVEL SECURITY;

-- دالة تنظّف الجلسات المنتهية تلقائياً (تُستدعى عند الحاجة)
CREATE OR REPLACE FUNCTION public.cleanup_expired_mobile_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.galaxy_mobile_sessions
  WHERE expires_at < now() OR revoked = true;
END;
$$;