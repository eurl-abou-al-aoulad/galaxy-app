import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { signPayload } from "../_shared/hmac.ts";

interface ActivateBody {
  code: string;
  device_id: string;
  device_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id, device_name } = (await req.json()) as ActivateBody;

    if (!code || !device_id) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const normalized = code.trim().toUpperCase();

    const { data: lic, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("code", normalized)
      .maybeSingle();

    if (error) return json({ ok: false, error: "db_error" }, 500);
    if (!lic) return json({ ok: false, error: "invalid_code" }, 404);
    if (lic.status === "revoked") return json({ ok: false, error: "revoked" }, 403);

    const now = new Date();

    const aiEnabled = Boolean(lic.ai_enabled);

    // إذا الكود مفعّل بالفعل
    if (lic.status === "active" || lic.device_id) {
      if (lic.device_id && lic.device_id !== device_id) {
        return json({ ok: false, error: "device_mismatch" }, 403);
      }
      const expiresAt = new Date(lic.expires_at);
      if (expiresAt < now) {
        await supabase.from("licenses").update({ status: "expired" }).eq("code", normalized);
        return json({ ok: false, error: "expired" }, 403);
      }
      const token = await signPayload(
        { code: normalized, device_id, expires_at: lic.expires_at, ai_enabled: aiEnabled },
        Deno.env.get("LICENSE_HMAC_SECRET")!,
      );
      return json({ ok: true, token, expires_at: lic.expires_at, ai_enabled: aiEnabled });
    }

    // أول تفعيل
    const expiresAt = new Date(now.getTime() + lic.duration_days * 86400000);

    const { error: upErr } = await supabase
      .from("licenses")
      .update({
        device_id,
        device_name: device_name ?? null,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: "active",
      })
      .eq("code", normalized);

    if (upErr) return json({ ok: false, error: "activation_failed" }, 500);

    const token = await signPayload(
      { code: normalized, device_id, expires_at: expiresAt.toISOString(), ai_enabled: aiEnabled },
      Deno.env.get("LICENSE_HMAC_SECRET")!,
    );

    return json({ ok: true, token, expires_at: expiresAt.toISOString(), ai_enabled: aiEnabled });
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
