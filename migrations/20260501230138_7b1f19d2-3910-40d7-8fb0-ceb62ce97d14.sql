-- إضافة عمود لتفعيل/تعطيل الذكاء الاصطناعي على مستوى كل ترخيص
ALTER TABLE public.licenses
ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;