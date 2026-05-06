/**
 * mobile-gateway — بوابة عامة لتطبيق الهاتف (نظام QR Login مثل WhatsApp Web)
 *
 * الإجراءات:
 *  - createSession: البرنامج المكتبي ينشئ رمز جلسة (token) لإنشاء QR
 *  - resolveSession: الهاتف يستبدل الرمز ببيانات المحل (دخول تلقائي)
 *  - login: تسجيل دخول يدوي بكود التفعيل + كود المتحكم (احتياطي)
 *  - fetch: جلب بيانات المحل (يقبل token أو licenseCode+controlCode)
 *  - upsert: تحديث/إضافة عنصر من الهاتف
 *  - revokeSession: إلغاء جلسة هاتف
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SYNC_TABLE = "galaxy_mobile_sync";
const SHOP_INFO_TABLE = "galaxy_shop_info";
const SESSION_TABLE = "galaxy_mobile_sessions";

const ALLOWED_TYPES = new Set([
  "products", "invoices", "debts", "expenses",
  "customers", "suppliers", "workers",
]);

function getClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateToken(): string {
  // 32 bytes URL-safe — صعب التخمين
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyByCredentials(sb: any, licenseCode: string, controlCode: string) {
  const { data, error } = await sb
    .from(SHOP_INFO_TABLE)
    .select("license_code, control_code, shop_name, shop_address, shop_phone, owner_name, updated_at")
    .eq("license_code", licenseCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false as const, reason: "license_not_found" };
  if (data.control_code !== controlCode) return { ok: false as const, reason: "wrong_control_code" };
  return { ok: true as const, shop: data };
}

async function verifyByToken(sb: any, token: string) {
  const { data: session, error } = await sb
    .from(SESSION_TABLE)
    .select("license_code, control_code, shop_name, expires_at, revoked")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) return { ok: false as const, reason: "session_not_found" };
  if (session.revoked) return { ok: false as const, reason: "session_revoked" };
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: "session_expired" };
  }
  // جلب بيانات المحل الكاملة
  const { data: shop } = await sb
    .from(SHOP_INFO_TABLE)
    .select("license_code, control_code, shop_name, shop_address, shop_phone, owner_name, updated_at")
    .eq("license_code", session.license_code)
    .maybeSingle();
  // تحديث آخر استخدام (best-effort)
  sb.from(SESSION_TABLE).update({ last_used_at: new Date().toISOString() })
    .eq("token", token).then(() => {}, () => {});
  return {
    ok: true as const,
    licenseCode: session.license_code,
    controlCode: session.control_code,
    shop: shop ?? { shop_name: session.shop_name },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const sb = getClient();

    // ============== createSession (البرنامج المكتبي → ينشئ QR) ==============
    if (action === "createSession") {
      const licenseCode = String(body.licenseCode ?? "").trim();
      const controlCode = String(body.controlCode ?? "").trim();
      if (!licenseCode || !controlCode) {
        return jsonResponse({ ok: false, error: "missing_credentials" }, 400);
      }
      const v = await verifyByCredentials(sb, licenseCode, controlCode);
      if (!v.ok) return jsonResponse(v, 200);

      // 🛡️ تحقق من إذن المالك للترخيص
      const { data: lic } = await sb
        .from("licenses")
        .select("mobile_enabled, mobile_max_devices, status")
        .eq("code", licenseCode)
        .maybeSingle();

      if (!lic) {
        return jsonResponse({ ok: false, reason: "license_not_found" }, 200);
      }
      if (lic.status === "revoked" || lic.status === "expired") {
        return jsonResponse({ ok: false, reason: "license_inactive" }, 200);
      }
      if (!lic.mobile_enabled) {
        return jsonResponse({ ok: false, reason: "mobile_disabled_by_owner" }, 200);
      }

      // عدّ الجلسات النشطة الحالية
      const { count: activeCount } = await sb
        .from(SESSION_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("license_code", licenseCode)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString());

      const max = lic.mobile_max_devices ?? 1;
      if (max > 0 && (activeCount ?? 0) >= max) {
        return jsonResponse({
          ok: false,
          reason: "device_limit_reached",
          limit: max,
          active: activeCount,
        }, 200);
      }

      const token = generateToken();
      const deviceLabel = String(body.deviceLabel ?? "").slice(0, 80) || null;

      const { error } = await sb.from(SESSION_TABLE).insert({
        token,
        license_code: licenseCode,
        control_code: controlCode,
        shop_name: v.shop.shop_name,
        device_label: deviceLabel,
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true, token, expiresInDays: 30 });
    }

    // ============== resolveSession (الهاتف بعد مسح QR) ==============
    if (action === "resolveSession") {
      const token = String(body.token ?? "").trim();
      if (!token) return jsonResponse({ ok: false, error: "missing_token" }, 400);
      const v = await verifyByToken(sb, token);
      if (!v.ok) return jsonResponse(v, 200);
      return jsonResponse({
        ok: true,
        shop: {
          shopName: v.shop?.shop_name ?? null,
          shopAddress: v.shop?.shop_address ?? null,
          shopPhone: v.shop?.shop_phone ?? null,
          ownerName: v.shop?.owner_name ?? null,
          lastUpdate: v.shop?.updated_at ?? null,
        },
      });
    }

    // ============== login (يدوي - احتياطي) ==============
    if (action === "login") {
      const licenseCode = String(body.licenseCode ?? "").trim();
      const controlCode = String(body.controlCode ?? "").trim();
      if (!licenseCode || !controlCode) {
        return jsonResponse({ ok: false, error: "missing_credentials" }, 400);
      }
      const v = await verifyByCredentials(sb, licenseCode, controlCode);
      if (!v.ok) return jsonResponse(v, 200);
      return jsonResponse({
        ok: true,
        shop: {
          shopName: v.shop.shop_name,
          shopAddress: v.shop.shop_address,
          shopPhone: v.shop.shop_phone,
          ownerName: v.shop.owner_name,
          lastUpdate: v.shop.updated_at,
        },
      });
    }

    // ============== fetch (يقبل token أو credentials) ==============
    if (action === "fetch") {
      let licenseCode = String(body.licenseCode ?? "").trim();
      let controlCode = String(body.controlCode ?? "").trim();
      let shopInfo: any = null;

      const token = String(body.token ?? "").trim();
      if (token) {
        const v = await verifyByToken(sb, token);
        if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed", reason: v.reason }, 401);
        licenseCode = v.licenseCode;
        controlCode = v.controlCode;
        shopInfo = v.shop;
      } else {
        if (!licenseCode || !controlCode) {
          return jsonResponse({ ok: false, error: "missing_credentials" }, 400);
        }
        const v = await verifyByCredentials(sb, licenseCode, controlCode);
        if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed", reason: v.reason }, 401);
        shopInfo = v.shop;
      }

      const types: string[] = Array.isArray(body.dataTypes)
        ? body.dataTypes.filter((t: string) => ALLOWED_TYPES.has(t))
        : [];
      if (types.length === 0) return jsonResponse({ ok: false, error: "no_types" }, 400);

      const { data: rows, error } = await sb
        .from(SYNC_TABLE)
        .select("data_type, payload, updated_at")
        .eq("license_code", licenseCode)
        .in("data_type", types)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);

      const grouped: Record<string, any[]> = {};
      for (const t of types) grouped[t] = [];
      for (const r of rows ?? []) {
        const t = r.data_type as string;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(r.payload);
      }
      return jsonResponse({
        ok: true,
        data: grouped,
        shop: {
          shopName: shopInfo?.shop_name ?? null,
          shopAddress: shopInfo?.shop_address ?? null,
          shopPhone: shopInfo?.shop_phone ?? null,
        },
        fetchedAt: Date.now(),
      });
    }

    // ============== upsert (تعديل من الهاتف) ==============
    if (action === "upsert") {
      let licenseCode = String(body.licenseCode ?? "").trim();
      let controlCode = String(body.controlCode ?? "").trim();
      const token = String(body.token ?? "").trim();

      if (token) {
        const v = await verifyByToken(sb, token);
        if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed" }, 401);
        licenseCode = v.licenseCode;
        controlCode = v.controlCode;
      } else {
        if (!licenseCode || !controlCode) {
          return jsonResponse({ ok: false, error: "missing_credentials" }, 400);
        }
        const v = await verifyByCredentials(sb, licenseCode, controlCode);
        if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed" }, 401);
      }

      const dataType = String(body.dataType ?? "");
      if (!ALLOWED_TYPES.has(dataType)) {
        return jsonResponse({ ok: false, error: "bad_type" }, 400);
      }
      const { error } = await sb.from(SYNC_TABLE).insert({
        license_code: licenseCode,
        control_code: controlCode,
        data_type: dataType,
        payload: body.payload ?? {},
        device_id: String(body.deviceId ?? "mobile-web"),
        client_updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true });
    }

    // ============== revokeSession (للإدارة) ==============
    if (action === "revokeSession") {
      const licenseCode = String(body.licenseCode ?? "").trim();
      const controlCode = String(body.controlCode ?? "").trim();
      const token = String(body.token ?? "").trim();
      if (!licenseCode || !controlCode || !token) {
        return jsonResponse({ ok: false, error: "missing_params" }, 400);
      }
      const v = await verifyByCredentials(sb, licenseCode, controlCode);
      if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed" }, 401);
      const { error } = await sb.from(SESSION_TABLE)
        .update({ revoked: true })
        .eq("token", token)
        .eq("license_code", licenseCode);
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true });
    }

    // ============== listSessions (للإدارة من البرنامج) ==============
    if (action === "listSessions") {
      const licenseCode = String(body.licenseCode ?? "").trim();
      const controlCode = String(body.controlCode ?? "").trim();
      if (!licenseCode || !controlCode) {
        return jsonResponse({ ok: false, error: "missing_credentials" }, 400);
      }
      const v = await verifyByCredentials(sb, licenseCode, controlCode);
      if (!v.ok) return jsonResponse({ ok: false, error: "auth_failed" }, 401);
      const { data, error } = await sb.from(SESSION_TABLE)
        .select("token, device_label, created_at, expires_at, last_used_at, revoked")
        .eq("license_code", licenseCode)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true, sessions: data ?? [] });
    }

    return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
