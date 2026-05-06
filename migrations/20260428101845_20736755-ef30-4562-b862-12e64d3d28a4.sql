-- جدول مزامنة عناصر المحل بين الحاسوب والهاتف
-- البيانات (payload) مشفّرة client-side بكلمة مرور المتحكم — السيرفر zero-knowledge
CREATE TABLE public.cloud_sync_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_code TEXT NOT NULL,
  table_name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  payload TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  device_id TEXT,
  client_updated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (license_code, table_name, item_id)
);

CREATE INDEX idx_cloud_sync_pull
  ON public.cloud_sync_items (license_code, updated_at DESC);

CREATE INDEX idx_cloud_sync_lookup
  ON public.cloud_sync_items (license_code, table_name);

ALTER TABLE public.cloud_sync_items ENABLE ROW LEVEL SECURITY;

-- لا توجد مصادقة Supabase Auth — التحقق يعتمد على معرفة license_code (مثل كلمة مرور).
-- البيانات نفسها مشفّرة من جانب العميل.
CREATE POLICY "Anyone with license_code can read"
  ON public.cloud_sync_items FOR SELECT
  USING (true);

CREATE POLICY "Anyone with license_code can write"
  ON public.cloud_sync_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone with license_code can update"
  ON public.cloud_sync_items FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_cloud_sync_items_updated_at
  BEFORE UPDATE ON public.cloud_sync_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();