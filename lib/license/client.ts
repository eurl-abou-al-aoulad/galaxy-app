import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceName } from "./device";
import {
  decodePayloadFromToken,
  loadLicense,
  saveLicense,
  clearLicense,
  type StoredLicense,
} from "./storage";
import { markActivated, markRevoked, markExpired } from "@/lib/activation";

export type LicenseStatus =
  | { state: "valid"; expiresAt: Date; daysLeft: number; code: string }
  | { state: "missing" }
  | { state: "expired" }
  | { state: "device_mismatch" }
  | { state: "revoked" }
  | { state: "invalid_code" }
  | { state: "tampered" }
  | { state: "error"; message: string };

// فحص خفيف عند كل فتح (60 ثانية) لرصد الإلغاء/الحذف فوراً
const ONLINE_CHECK_INTERVAL_MS = 60 * 1000;

export async function activateLicense(code: string): Promise<LicenseStatus> {
  const device_id = await getDeviceId();
  const device_name = getDeviceName();

  const { data, error } = await supabase.functions.invoke("activate-license", {
    body: { code: code.trim().toUpperCase(), device_id, device_name },
  });

  if (error) {
    const details = error as { message?: string; context?: { json?: () => Promise<{ error?: string }> } };
    let body: { error?: string } | null = null;
    try {
      if (typeof details.context?.json === "function") body = await details.context.json();
    } catch {
      body = null;
    }
    const e = body?.error;
    if (e === "device_mismatch") return { state: "device_mismatch" };
    if (e === "expired") return { state: "expired" };
    if (e === "revoked") return { state: "revoked" };
    if (e === "invalid_code") return { state: "invalid_code" };
    const msg = details.message ?? "تعذّر الاتصال";
    return { state: "error", message: msg };
  }
  if (!data?.ok) {
    const e = data?.error as string;
    if (e === "device_mismatch") return { state: "device_mismatch" };
    if (e === "expired") return { state: "expired" };
    if (e === "revoked") return { state: "revoked" };
    if (e === "invalid_code") return { state: "invalid_code" };
    return { state: "error", message: e ?? "تعذّر التفعيل" };
  }

  const payload = decodePayloadFromToken(data.token);
  if (!payload) return { state: "tampered" };

  const stored: StoredLicense = {
    token: data.token,
    payload,
    saved_at: new Date().toISOString(),
    last_online_check: new Date().toISOString(),
  };
  await saveLicense(stored);
  await markActivated(payload.code);

  const expiresAt = new Date(payload.expires_at);
  return {
    state: "valid",
    expiresAt,
    daysLeft: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)),
    code: payload.code,
  };
}

export async function checkLicense(): Promise<LicenseStatus> {
  const stored = await loadLicense();
  if (!stored) return { state: "missing" };

  const device_id = await getDeviceId();
  if (stored.payload.device_id !== device_id) return { state: "device_mismatch" };

  const expiresAt = new Date(stored.payload.expires_at);
  // فحص الانتهاء المحلي — يقفل النظام حتى أوفلاين
  if (expiresAt < new Date()) {
    await markExpired();
    return { state: "expired" };
  }

  // فحص أونلاين دوري — يتجاهل الأخطاء (وضع أوفلاين مسموح)
  const lastCheck = new Date(stored.last_online_check).getTime();
  if (Date.now() - lastCheck > ONLINE_CHECK_INTERVAL_MS) {
    try {
      const { data, error } = await supabase.functions.invoke("verify-license", {
        body: { code: stored.payload.code, device_id },
      });

      // عند HTTP 4xx/5xx، الـ SDK يضع الجواب في error.context وليس في data
      let body: { ok?: boolean; error?: string; expires_at?: string } | null = data ?? null;
      if (error) {
        try {
          const ctx = (error as { context?: { json?: () => Promise<{ ok?: boolean; error?: string }> } }).context;
          if (typeof ctx?.json === "function") body = await ctx.json();
        } catch {
          body = null;
        }
      }

      if (body?.ok === false) {
        // 1) المالك ألغى الترخيص
        if (body.error === "revoked") {
          await markRevoked("revoked");
          return { state: "revoked" };
        }
        // 2) المالك حذف الترخيص نهائياً → الكود لم يعد موجوداً في DB السيرفر
        if (body.error === "invalid_code") {
          await markRevoked("invalid_code");
          return { state: "invalid_code" };
        }
        // 3) انتهت المدة من جانب السيرفر
        if (body.error === "expired") {
          await markExpired();
          return { state: "expired" };
        }
        if (body.error === "device_mismatch") return { state: "device_mismatch" };
      }
      if (body?.ok) {
        await saveLicense({
          ...stored,
          last_online_check: new Date().toISOString(),
          payload: { ...stored.payload, expires_at: body.expires_at ?? stored.payload.expires_at },
        });
      }
    } catch {
      // أوفلاين — اعتمد على التحقق المحلي
    }
  }

  return {
    state: "valid",
    expiresAt,
    daysLeft: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)),
    code: stored.payload.code,
  };
}

export function deactivateLocal(): void {
  clearLicense();
}
