// ============================================================
// Cloud Sync Gate — البوابة الآمنة الوحيدة لقراءة/كتابة بيانات المحلّ
// ============================================================
//
// كل عملية تحمل توقيع HMAC-SHA256(license_secret, canonical_string)
// حيث license_secret = HKDF(adminPassword, "galaxy-license-secret-v1")
// السيرفر لا يعرف adminPassword أبداً — يُخزَّن فقط verifier_hash =
// SHA-256(HMAC(license_secret, "galaxy-verifier-v1")).
//
// عمليات مدعومة:
//   - register : أوّل اقتران، يسجّل verifier_hash
//   - verify   : تحقّق سريع
//   - push     : رفع دفعة من العناصر المشفّرة
//   - pull     : سحب التغييرات الأحدث منذ ts معيّن
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-galaxy-sig, x-galaxy-license, x-galaxy-ts, x-galaxy-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============= Crypto helpers =============

const enc = new TextEncoder();

function b64decode(s: string): Uint8Array {
  // قبول base64 و base64url
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hmacSha256(secret: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

// canonical string لتوقيعه — يجب أن يطابق العميل بالضبط
function buildCanonical(op: string, license: string, ts: string, nonce: string, bodyHashB64: string): string {
  return `${op}\n${license}\n${ts}\n${nonce}\n${bodyHashB64}`;
}

// التحقّق من التوقيع: العميل يرسل license_secret_b64 المشتق محلياً + التوقيع
async function verifySignature(
  licenseSecret: Uint8Array,
  op: string,
  license: string,
  ts: string,
  nonce: string,
  rawBody: string,
  providedSigB64: string,
): Promise<boolean> {
  const bodyHash = await sha256(enc.encode(rawBody));
  const canonical = buildCanonical(op, license, ts, nonce, b64encode(bodyHash));
  const expected = await hmacSha256(licenseSecret, canonical);
  const provided = b64decode(providedSigB64);
  return timingSafeEqual(expected, provided);
}

async function computeVerifier(licenseSecret: Uint8Array): Promise<string> {
  const v = await hmacSha256(licenseSecret, "galaxy-verifier-v1");
  const h = await sha256(v);
  return b64encode(h);
}

// ============= Handler =============

interface ClientEnvelope {
  op: "register" | "verify" | "push" | "pull";
  // license_secret المشتق محلياً من كلمة مرور المتحكّم (يُرسَل كلّ طلب — هو "بصمة" المعرفة بكلمة المرور)
  // ⚠️ هذه ليست كلمة المرور نفسها. لا يمكن عكسها لاستخراج كلمة المرور.
  license_secret_b64: string;
  data?: unknown;
}

interface PushItem {
  table_name: string;
  item_id: string;
  payload: string | null;
  is_deleted: boolean;
  device_id: string;
  client_updated_at: string;
}

const ALLOWED_TABLES = new Set([
  "products", "invoices", "debts", "customers", "expenses",
  "suppliers", "repairDevices", "tasks", "workers", "invoiceCounters",
]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    // --- 1) رؤوس التوقيع ---
    const sigB64 = req.headers.get("x-galaxy-sig");
    const license = req.headers.get("x-galaxy-license");
    const ts = req.headers.get("x-galaxy-ts");
    const nonce = req.headers.get("x-galaxy-nonce");
    if (!sigB64 || !license || !ts || !nonce) {
      return jsonResponse({ error: "missing_auth_headers" }, 401);
    }

    // anti-replay: ts ضمن ±5 دقائق
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
      return jsonResponse({ error: "stale_timestamp" }, 401);
    }

    const rawBody = await req.text();
    let envelope: ClientEnvelope;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    if (!envelope.op || !envelope.license_secret_b64) {
      return jsonResponse({ error: "invalid_envelope" }, 400);
    }

    const licenseSecret = b64decode(envelope.license_secret_b64);
    if (licenseSecret.length < 16 || licenseSecret.length > 64) {
      return jsonResponse({ error: "bad_secret_size" }, 400);
    }

    // --- 2) تحقّق من التوقيع (يثبت أن المرسل يملك license_secret) ---
    const sigOk = await verifySignature(licenseSecret, envelope.op, license, ts, nonce, rawBody, sigB64);
    if (!sigOk) {
      return jsonResponse({ error: "invalid_signature" }, 401);
    }

    // --- 3) تحقّق أن كود الترخيص موجود وصالح قبل أي تسجيل/مزامنة ---
    const normalizedLicense = license.trim().toUpperCase();
    const { data: licenseRow, error: licenseErr } = await admin
      .from("licenses")
      .select("status,expires_at")
      .eq("code", normalizedLicense)
      .maybeSingle();

    if (licenseErr) {
      console.error("[gate] license lookup error", licenseErr);
      return jsonResponse({ error: "internal" }, 500);
    }
    if (!licenseRow) return jsonResponse({ error: "invalid_code" }, 404);
    if (licenseRow.status === "revoked") return jsonResponse({ error: "revoked" }, 403);
    if (licenseRow.status === "expired") return jsonResponse({ error: "expired" }, 403);
    if (licenseRow.expires_at && new Date(licenseRow.expires_at) < new Date()) {
      await admin.from("licenses").update({ status: "expired" }).eq("code", normalizedLicense);
      return jsonResponse({ error: "expired" }, 403);
    }

    // --- 4) تحقّق ملكية license_code ---
    const incomingVerifier = await computeVerifier(licenseSecret);
    const { data: authRow, error: authErr } = await admin
      .from("license_auth")
      .select("verifier_hash")
      .eq("license_code", normalizedLicense)
      .maybeSingle();

    if (authErr) {
      console.error("[gate] auth lookup error", authErr);
      return jsonResponse({ error: "internal" }, 500);
    }

    if (envelope.op === "register") {
      if (!authRow) {
        // أوّل اقتران — سجّل
        const { error: insErr } = await admin
          .from("license_auth")
          .insert({ license_code: normalizedLicense, verifier_hash: incomingVerifier });
        if (insErr) {
          console.error("[gate] register insert error", insErr);
          return jsonResponse({ error: "register_failed" }, 500);
        }
        return jsonResponse({ ok: true, registered: true });
      }
      // موجود — يجب أن يطابق
      if (authRow.verifier_hash !== incomingVerifier) {
        return jsonResponse({ error: "wrong_password" }, 403);
      }
      return jsonResponse({ ok: true, registered: false });
    }

    // باقي العمليات تتطلّب verifier مطابق
    if (!authRow) return jsonResponse({ error: "not_registered" }, 403);
    if (authRow.verifier_hash !== incomingVerifier) {
      return jsonResponse({ error: "wrong_password" }, 403);
    }

    // --- 5) العمليات ---
    if (envelope.op === "verify") {
      return jsonResponse({ ok: true });
    }

    if (envelope.op === "push") {
      const items = (envelope.data as { items?: PushItem[] } | undefined)?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return jsonResponse({ error: "no_items" }, 400);
      }
      if (items.length > 100) return jsonResponse({ error: "batch_too_large" }, 400);

      const rows = items
        .filter((it) => ALLOWED_TABLES.has(it.table_name) && typeof it.item_id === "string" && it.item_id.length < 200)
        .map((it) => ({
          license_code: normalizedLicense,
          table_name: it.table_name,
          item_id: it.item_id,
          payload: it.payload,
          is_deleted: !!it.is_deleted,
          device_id: typeof it.device_id === "string" ? it.device_id.slice(0, 80) : null,
          client_updated_at: it.client_updated_at,
        }));

      if (rows.length === 0) return jsonResponse({ error: "no_valid_items" }, 400);

      const { error: upErr } = await admin
        .from("cloud_sync_items")
        .upsert(rows, { onConflict: "license_code,table_name,item_id" });

      if (upErr) {
        console.error("[gate] push error", upErr);
        return jsonResponse({ error: "push_failed", detail: upErr.message }, 500);
      }
      return jsonResponse({ ok: true, count: rows.length });
    }

    if (envelope.op === "pull") {
      const since = (envelope.data as { since?: string } | undefined)?.since ?? "1970-01-01T00:00:00Z";
      const { data, error } = await admin
        .from("cloud_sync_items")
        .select("table_name,item_id,payload,is_deleted,client_updated_at,updated_at,device_id")
        .eq("license_code", license)
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .limit(500);

      if (error) {
        console.error("[gate] pull error", error);
        return jsonResponse({ error: "pull_failed" }, 500);
      }
      return jsonResponse({ ok: true, items: data ?? [] });
    }

    return jsonResponse({ error: "unknown_op" }, 400);
  } catch (e) {
    console.error("[gate] unhandled", e);
    return jsonResponse({ error: "internal" }, 500);
  }
});
