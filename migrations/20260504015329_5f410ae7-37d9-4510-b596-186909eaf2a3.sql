CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- إلغاء أي مهمة سابقة بنفس الاسم (تجنّب التكرار)
DO $$
BEGIN
  PERFORM cron.unschedule('galaxy-keepalive-ping');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- جدولة ضرب السيرفر كل 6 أيام في الساعة 03:00 UTC
SELECT cron.schedule(
  'galaxy-keepalive-ping',
  '0 3 */6 * *',
  $$
  SELECT net.http_get(
    url := 'https://project--a76bef20-9a5c-4708-8b55-484ac7257d10.lovable.app/api/public/ping'
  ) AS request_id;
  $$
);