import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/hmac.ts";

// التحقق من كود فك قفل أدوات المطوّر (DevLockOverlay)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id, device_name, user_agent } = await req.json();
    const expected = Deno.env.get("DEV_ACCESS_CODE") ?? "";
    const success = !!code && code === expected;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("dev_access_attempts").insert({
      code_hash: code ? await sha256Hex(String(code)) : null,
      device_id: device_id ?? null,
      device_name: device_name ?? null,
      user_agent: user_agent ?? null,
      success,
    });

    return new Response(JSON.stringify({ ok: success }), {
      status: success ? 200 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
