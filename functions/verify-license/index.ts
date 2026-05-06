import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// تحقق دوري أونلاين من حالة الترخيص (هل ألغي؟ هل انتهى؟)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id } = await req.json();
    if (!code || !device_id) return json({ ok: false, error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lic } = await supabase
      .from("licenses")
      .select("status,device_id,expires_at")
      .eq("code", String(code).trim().toUpperCase())
      .maybeSingle();

    if (!lic) return json({ ok: false, error: "invalid_code" }, 404);
    if (lic.status === "revoked") return json({ ok: false, error: "revoked" }, 403);
    if (lic.status === "expired") return json({ ok: false, error: "expired" }, 403);
    if (lic.device_id && lic.device_id !== device_id) {
      return json({ ok: false, error: "device_mismatch" }, 403);
    }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      // علّم الكود كمنتهٍ في DB ليبقى منتهياً للزيارات القادمة
      await supabase.from("licenses").update({ status: "expired" }).eq("code", String(code).trim().toUpperCase());
      return json({ ok: false, error: "expired" }, 403);
    }
    return json({ ok: true, expires_at: lic.expires_at });
  } catch (e) {
    return json({ ok: false, error: "server_error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
