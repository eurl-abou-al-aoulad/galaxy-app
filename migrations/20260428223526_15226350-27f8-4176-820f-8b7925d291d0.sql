-- ============================================================
-- 1. جدول التحقّق من ملكية كود الترخيص (verifier-only، بدون كلمة مرور)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.license_auth (
  license_code TEXT PRIMARY KEY,
  verifier_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.license_auth ENABLE ROW LEVEL SECURITY;

-- لا سياسات عامة → الوصول فقط من service_role (Edge Functions)
-- (عدم وجود policy يعني أن المتصفّح لا يرى/يكتب أي شيء)

-- ============================================================
-- 2. إغلاق الوصول المباشر إلى cloud_sync_items
-- ============================================================
DROP POLICY IF EXISTS "Anyone with license_code can read" ON public.cloud_sync_items;
DROP POLICY IF EXISTS "Anyone with license_code can write" ON public.cloud_sync_items;
DROP POLICY IF EXISTS "Anyone with license_code can update" ON public.cloud_sync_items;

-- RLS لا يزال مُفعَّلاً، وبدون أي policy → المتصفح محجوب تماماً.
-- الـ Edge Function (service_role) فقط هي التي تستطيع القراءة/الكتابة.

-- ============================================================
-- 3. فهارس لتسريع المزامنة
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cloud_sync_items_lookup
  ON public.cloud_sync_items (license_code, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_sync_items_unique
  ON public.cloud_sync_items (license_code, table_name, item_id);

-- ============================================================
-- 4. trigger لتحديث updated_at على license_auth
-- ============================================================
DROP TRIGGER IF EXISTS trg_license_auth_updated_at ON public.license_auth;
CREATE TRIGGER trg_license_auth_updated_at
  BEFORE UPDATE ON public.license_auth
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();