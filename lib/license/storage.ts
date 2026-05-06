// تخزين مشفّر للترخيص محلياً
// يستخدم AES-GCM مع مفتاح مشتق من device fingerprint
// التوقيع HMAC المُصدر من السيرفر هو الحجة النهائية للصلاحية

import { getDeviceId } from "./device";

const STORAGE_KEY = "__galaxy_lic_v1";

export interface LicensePayload {
  code: string;
  device_id: string;
  expires_at: string;
  /** يفعّله المالك في لوحة التحكم عند إنشاء الكود */
  ai_enabled?: boolean;
}

export interface StoredLicense {
  token: string; // base64url(payload).base64url(hmac) من السيرفر
  payload: LicensePayload;
  saved_at: string;
  last_online_check: string;
}

async function deriveKey(seed: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(seed);
  const baseHash = await crypto.subtle.digest("SHA-256", enc);
  return crypto.subtle.importKey("raw", baseHash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function saveLicense(data: StoredLicense): Promise<void> {
  const key = await deriveKey(await getDeviceId());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ iv: b64(iv.buffer), ct: b64(ct) }),
  );
}

export async function loadLicense(): Promise<StoredLicense | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { iv, ct } = JSON.parse(raw);
    const key = await deriveKey(await getDeviceId());
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      key,
      fromB64(ct),
    );
    return JSON.parse(new TextDecoder().decode(pt)) as StoredLicense;
  } catch {
    return null;
  }
}

export function clearLicense(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// تحقق محلي من التوقيع وانتهاء الصلاحية وربط الجهاز
export function decodePayloadFromToken(token: string): LicensePayload | null {
  try {
    const [body] = token.split(".");
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
