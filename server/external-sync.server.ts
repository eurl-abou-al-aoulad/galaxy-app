/**
 * عميل Supabase الخارجي (سيرفر فقط) — يستخدم service_role key
 * يتصل بـ Supabase الخاص بالمستخدم (مستقل عن Lovable Cloud)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getExternalSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.EXTERNAL_SUPABASE_URL;
  const serviceKey = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("EXTERNAL_SUPABASE_URL غير مهيأ");
  if (!serviceKey) throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY غير مهيأ");

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export const SYNC_TABLE = "galaxy_mobile_sync";
export const SHOP_INFO_TABLE = "galaxy_shop_info";
