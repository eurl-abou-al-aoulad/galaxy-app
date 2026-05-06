import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// إدارة المالك: إنشاء/قائمة/إلغاء/إعادة تعيين أكواد التراخيص
// يتطلب ترويسة x-owner-secret == OWNER_SECRET

function genCode(): string {
  // 4 مجموعات من 5 أحرف: GLXY-XXXX-XXXX-XXXX
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `GLXY-${block(5)}-${block(5)}-${block(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ownerSecret = req.headers.get("x-owner-secret");
  if (!ownerSecret || ownerSecret !== Deno.env.get("OWNER_SECRET")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "list";

    if (req.method === "GET" || action === "list") {
      const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, licenses: data });
    }

    // ============== stats: مراقبة استخدام قاعدة البيانات ==============
    if (action === "stats") {
      const nowIso = new Date().toISOString();
      const [lic, sessions, syncItems] = await Promise.all([
        supabase.from("licenses").select("status, mobile_enabled, ai_enabled", { count: "exact" }),
        supabase.from("galaxy_mobile_sessions").select("revoked, expires_at", { count: "exact" }),
        supabase.from("cloud_sync_items").select("id", { count: "exact", head: true }),
      ]);

      const licList = lic.data ?? [];
      const sessList = sessions.data ?? [];
      const activeSessions = sessList.filter((s: { revoked: boolean; expires_at: string }) =>
        !s.revoked && new Date(s.expires_at) > new Date()
      ).length;

      // تقدير تقريبي لحجم البيانات (KB)
      const estimateKB = ((lic.count ?? 0) * 1) + ((sessions.count ?? 0) * 0.5) + ((syncItems.count ?? 0) * 2);

      return json({
        ok: true,
        ts: nowIso,
        licenses_total: lic.count ?? 0,
        licenses_active: licList.filter((l: { status: string }) => l.status === "active").length,
        licenses_unused: licList.filter((l: { status: string }) => l.status === "unused").length,
        licenses_expired: licList.filter((l: { status: string }) => l.status === "expired").length,
        licenses_revoked: licList.filter((l: { status: string }) => l.status === "revoked").length,
        ai_enabled_count: licList.filter((l: { ai_enabled: boolean }) => l.ai_enabled).length,
        mobile_enabled_count: licList.filter((l: { mobile_enabled: boolean }) => l.mobile_enabled).length,
        mobile_sessions_total: sessions.count ?? 0,
        mobile_sessions_active: activeSessions,
        sync_items_total: syncItems.count ?? 0,
        estimated_size_mb: Math.round(estimateKB / 1024 * 100) / 100,
        // حدود خطة Supabase Free
        free_limits: {
          db_mb: 500,
          mau: 50000,
          storage_gb: 1,
          bandwidth_gb: 5,
        },
      });
    }

    const body = await req.json().catch(() => ({}));

    if (action === "create") {
      const count = Math.min(Math.max(Number(body.count ?? 1), 1), 50);
      const duration_days = Number(body.duration_days ?? 365);
      const customer_name = body.customer_name ?? null;
      const customer_phone = body.customer_phone ?? null;
      const notes = body.notes ?? null;
      const ai_enabled = Boolean(body.ai_enabled ?? false);
      const mobile_enabled = Boolean(body.mobile_enabled ?? false);
      const rawLimit = Number(body.mobile_max_devices ?? 1);
      const mobile_max_devices =
        Number.isFinite(rawLimit) && rawLimit >= 0 ? Math.min(Math.floor(rawLimit), 999) : 1;

      const rows = Array.from({ length: count }, () => ({
        code: genCode(),
        duration_days,
        customer_name,
        customer_phone,
        notes,
        ai_enabled,
        mobile_enabled,
        mobile_max_devices,
      }));

      const { data, error } = await supabase.from("licenses").insert(rows).select();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, created: data });
    }

    // ============== update_meta: تعديل بيانات الزبون والملاحظات ==============
    if (action === "update_meta") {
      const patch: Record<string, unknown> = {};
      if (body.customer_name !== undefined) patch.customer_name = body.customer_name || null;
      if (body.customer_phone !== undefined) patch.customer_phone = body.customer_phone || null;
      if (body.notes !== undefined) patch.notes = body.notes || null;
      if (Object.keys(patch).length === 0) return json({ ok: true });
      const { error } = await supabase.from("licenses").update(patch).eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    // ============== bulk: إجراءات جماعية على عدة أكواد ==============
    if (action === "bulk") {
      const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
      const op = String(body.op ?? "");
      if (codes.length === 0) return json({ ok: false, error: "no_codes" }, 400);
      if (op === "revoke") {
        const { error } = await supabase.from("licenses").update({ status: "revoked" }).in("code", codes);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, count: codes.length });
      }
      if (op === "delete") {
        const { error } = await supabase.from("licenses").delete().in("code", codes);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, count: codes.length });
      }
      if (op === "extend") {
        const days = Number(body.days ?? 30);
        const { data: rows } = await supabase
          .from("licenses").select("code, expires_at").in("code", codes);
        for (const r of rows ?? []) {
          const base = r.expires_at ? new Date(r.expires_at) : new Date();
          const newExp = new Date(base.getTime() + days * 86400000);
          await supabase.from("licenses")
            .update({ expires_at: newExp.toISOString(), status: "active" })
            .eq("code", r.code);
        }
        return json({ ok: true, count: rows?.length ?? 0 });
      }
      if (op === "set_ai") {
        const { error } = await supabase.from("licenses")
          .update({ ai_enabled: Boolean(body.ai_enabled) }).in("code", codes);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, count: codes.length });
      }
      if (op === "set_mobile") {
        const enabled = Boolean(body.mobile_enabled);
        const { error } = await supabase.from("licenses")
          .update({ mobile_enabled: enabled }).in("code", codes);
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!enabled) {
          await supabase.from("galaxy_mobile_sessions")
            .update({ revoked: true })
            .in("license_code", codes)
            .eq("revoked", false);
        }
        return json({ ok: true, count: codes.length });
      }
      return json({ ok: false, error: "unknown_bulk_op" }, 400);
    }

    if (action === "set_ai") {
      const ai_enabled = Boolean(body.ai_enabled);
      const { error } = await supabase
        .from("licenses")
        .update({ ai_enabled })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, ai_enabled });
    }

    // ============== set_mobile: تفعيل/تعطيل ربط الهاتف ==============
    if (action === "set_mobile") {
      const mobile_enabled = Boolean(body.mobile_enabled);
      const { error } = await supabase
        .from("licenses")
        .update({ mobile_enabled })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      // إن أُلغي تماماً → ألغِ كل الجلسات النشطة
      if (!mobile_enabled) {
        await supabase.from("galaxy_mobile_sessions")
          .update({ revoked: true })
          .eq("license_code", body.code)
          .eq("revoked", false);
      }
      return json({ ok: true, mobile_enabled });
    }

    // ============== set_mobile_limit: تحديد عدد الهواتف المسموح ==============
    if (action === "set_mobile_limit") {
      const raw = Number(body.mobile_max_devices ?? 1);
      const mobile_max_devices = Number.isFinite(raw) && raw >= 0 ? Math.min(Math.floor(raw), 999) : 1;
      const { error } = await supabase
        .from("licenses")
        .update({ mobile_max_devices })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, mobile_max_devices });
    }

    // ============== list_sessions: عرض جلسات الهاتف لترخيص ==============
    if (action === "list_sessions") {
      const { data, error } = await supabase
        .from("galaxy_mobile_sessions")
        .select("token, device_label, created_at, expires_at, last_used_at, revoked")
        .eq("license_code", body.code)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, sessions: data ?? [] });
    }

    // ============== revoke_session: فصل جلسة هاتف معيّنة ==============
    if (action === "revoke_session") {
      const { error } = await supabase
        .from("galaxy_mobile_sessions")
        .update({ revoked: true })
        .eq("token", body.token);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "revoke") {
      const { error } = await supabase
        .from("licenses")
        .update({ status: "revoked" })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "reset_device") {
      const { error } = await supabase
        .from("licenses")
        .update({ device_id: null, device_name: null, activated_at: null, expires_at: null, status: "unused" })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "extend") {
      const days = Number(body.days ?? 30);
      const { data: cur } = await supabase
        .from("licenses").select("expires_at").eq("code", body.code).maybeSingle();
      const base = cur?.expires_at ? new Date(cur.expires_at) : new Date();
      const newExp = new Date(base.getTime() + days * 86400000);
      const { error } = await supabase
        .from("licenses")
        .update({ expires_at: newExp.toISOString(), status: "active" })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, expires_at: newExp.toISOString() });
    }

    if (action === "delete") {
      const { error } = await supabase.from("licenses").delete().eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
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
