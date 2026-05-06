// Device Fingerprint مستقر — يجمع UUID + سمات المتصفح/الجهاز
// مخزّن في localStorage لضمان الاستقرار عبر إعادة التشغيل

const DEVICE_KEY = "__galaxy_dev_id_v1";

function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function collectTraits(): string {
  const n = navigator;
  const s = screen;
  return [
    n.userAgent,
    n.language,
    (n.languages || []).join(","),
    n.platform,
    `${s.width}x${s.height}x${s.colorDepth}`,
    new Date().getTimezoneOffset(),
    (n as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? "",
    (n as Navigator & { deviceMemory?: number }).deviceMemory ?? "",
  ].join("|");
}

export async function getDeviceId(): Promise<string> {
  let stored = "";
  try {
    stored = localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    // لا يوجد localStorage
  }
  if (stored) return stored;

  const seed = `${uuid()}::${collectTraits()}`;
  const id = await sha256Hex(seed);
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return `${os} • ${browser}`;
}
