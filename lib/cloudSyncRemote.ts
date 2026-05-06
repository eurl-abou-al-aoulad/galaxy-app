/**
 * المرحلة 5 — مزامنة سحابية بين الحاسوب والهاتف عبر Supabase
 *
 * المبدأ:
 *   - كل عنصر (منتج/فاتورة/دين/...) يُخزَّن كصف في cloud_sync_items
 *     بمفتاح فريد (license_code, table_name, item_id).
 *   - الحمولة (payload) مُشفّرة AES-256-GCM بكلمة مرور المتحكم → السيرفر zero-knowledge.
 *   - رفع: نراقب التغييرات في Dexie ونصفها في طابور أوفلاين، ثم نرفعها عند توفر الإنترنت.
 *   - سحب: عند الفتح + كل دقيقتين، نسحب التغييرات الأحدث من updated_at المخزّن محلياً.
 *   - حل التعارض: client_updated_at الأكبر يفوز (الأحدث يكتب فوق الأقدم).
 *
 * كود الترخيص = هوية المحل (license_code). نفس الكود في الجهازين = نفس البيانات.
 */
import Dexie from "dexie";
import { db, type SectionId } from "@/lib/db";

// ============== بوابة المزامنة الآمنة ==============
// كل عملية تمرّ عبر Edge Function `cloud-sync-gate` مع توقيع HMAC.
// السيرفر لا يعرف كلمة مرور المتحكّم — فقط verifier_hash لا يمكن عكسه.

const GATE_FN = "cloud-sync-gate";

let mobilePairingSessionVerified = false;

export function setMobilePairingSessionVerified(verified: boolean) {
  mobilePairingSessionVerified = verified;
  if (!verified) invalidateRemoteSyncContext();
}

function getGateUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("missing_sync_endpoint");
  return `${base.replace(/\/+$/, "")}/functions/v1/${GATE_FN}`;
}

function getPublishableKey(): string {
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (!key) throw new Error("missing_sync_key");
  return key;
}

function b64encodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// license_secret = HKDF(masterKey, "galaxy-license-secret-v1") → 32 bytes
async function deriveLicenseSecret(master: CryptoKey): Promise<Uint8Array> {
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("galaxy-license-secret-v1") as BufferSource,
      info: new Uint8Array() as BufferSource,
    },
    master,
    { name: "HMAC", hash: "SHA-256", length: 256 } as HmacKeyGenParams,
    true,
    ["sign"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

async function hmacSign(secret: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function callGate(
  op: "register" | "verify" | "push" | "pull",
  ctx: { licenseCode: string; password: string },
  data: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const master = await getMasterKey(ctx.password);
  const licenseSecret = await deriveLicenseSecret(master);

  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const envelope = {
    op,
    license_secret_b64: b64encodeBytes(licenseSecret),
    data,
  };
  const rawBody = JSON.stringify(envelope);
  const bodyHash = await sha256Bytes(new TextEncoder().encode(rawBody));
  const canonical = `${op}\n${ctx.licenseCode}\n${ts}\n${nonce}\n${b64encodeBytes(bodyHash)}`;
  const sig = await hmacSign(licenseSecret, canonical);

  const response = await fetch(getGateUrl(), {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "apikey": getPublishableKey(),
      "authorization": `Bearer ${getPublishableKey()}`,
      "x-galaxy-sig": b64encodeBytes(sig),
      "x-galaxy-license": ctx.licenseCode,
      "x-galaxy-ts": ts,
      "x-galaxy-nonce": nonce,
    },
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = { error: response.statusText || "sync_failed" };
  }
  const result = { ok: response.ok && body.ok === true, status: response.status, body };
  // الكشف عن إلغاء/انتهاء الترخيص من جهة الخادم → فك الاقتران فوراً
  const errStr = String(body?.error ?? "");
  if (!result.ok && (errStr === "revoked" || errStr === "expired" || errStr === "invalid_code")) {
    const act = await db.activation.get(1);
    if (act?.activated && act.activationCode === ctx.licenseCode) {
      void handleLicenseRevoked(errStr);
    }
  }
  return result;
}

// ============== التعامل مع إلغاء الترخيص من جهة المالك ==============

let revokedHandled = false;
async function handleLicenseRevoked(reason: string): Promise<void> {
  if (revokedHandled) return;
  revokedHandled = true;
  try {
    invalidateRemoteSyncContext();
    // امسح كل البيانات المحلية على الهاتف (هي مجرد نسخة من السحابة)
    if (isMobileRoute()) {
      try {
        for (const t of SYNCED_TABLES) {
          await getTable(t).clear();
        }
      } catch (e) {
        console.warn("[RemoteSync] clear local tables failed:", e);
      }
      try { await rdb.queue.clear(); } catch { /* ignore */ }
      try { await rdb.meta.clear(); } catch { /* ignore */ }
    }
    // فك الاقتران (يُعيد المستخدم لشاشة إدخال الكود)
    try {
      await db.activation.update(1, {
        activated: 0,
        activationCode: null,
        lockReason: reason as "revoked" | "expired" | "invalid_code",
      });
    } catch (e) {
      console.warn("[RemoteSync] activation reset failed:", e);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("galaxy:license-revoked", { detail: { reason } }));
    }
  } finally {
    // اسمح بمحاولة جديدة بعد دقيقة (في حال أُعيد التفعيل)
    setTimeout(() => { revokedHandled = false; }, 60_000);
  }
}

// ============== الجداول المُزامَنة ==============

export const SYNCED_TABLES = [
  "products",
  "invoices",
  "debts",
  "customers",
  "expenses",
  "suppliers",
  "repairDevices",
  "tasks",
  "workers",
  "invoiceCounters",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

// المفتاح الموحّد لكل عنصر داخل السحابة.
// لمعظم الجداول id رقمي → نستعمل "{section}:{id}".
// لـ invoiceCounters المفتاح مركّب → "{section}:{type}".
function itemKey(table: SyncedTable, row: Record<string, unknown>): string | null {
  if (table === "invoiceCounters") {
    const s = row.section as string | undefined;
    const t = row.type as string | undefined;
    if (!s || !t) return null;
    return `${s}:${t}`;
  }
  const s = row.section as string | undefined;
  const id = row.id as number | undefined;
  if (!s || id === undefined || id === null) return null;
  return `${s}:${id}`;
}

function getTable(name: SyncedTable): Dexie.Table<Record<string, unknown>, unknown> {
  return (db as unknown as Record<string, Dexie.Table<Record<string, unknown>, unknown>>)[name];
}

// ============== طابور الرفع (يعمل أوفلاين) ==============

interface QueueRow {
  id?: number;
  table: SyncedTable;
  itemId: string;
  payload: string | null; // JSON النصي المشفّر سيُحسب لحظة الإرسال
  rawData: string | null; // JSON الخام (نشفّره عند الإرسال)
  isDeleted: 0 | 1;
  clientUpdatedAt: number;
  createdAt: number;
}

interface MetaRow {
  key: string;
  value: string;
}

class RemoteSyncDB extends Dexie {
  queue!: Dexie.Table<QueueRow, number>;
  meta!: Dexie.Table<MetaRow, string>;
  constructor() {
    super("GalaxyRemoteSync");
    this.version(1).stores({
      queue: "++id, table, itemId, [table+itemId]",
      meta: "key",
    });
  }
}
const rdb = new RemoteSyncDB();

async function getMeta(key: string): Promise<string | null> {
  const r = await rdb.meta.get(key);
  return r?.value ?? null;
}
async function setMeta(key: string, value: string) {
  await rdb.meta.put({ key, value });
}

function scopedMetaKey(ctx: { licenseCode: string }, key: string): string {
  return `${key}:${ctx.licenseCode}`;
}

function isMobileRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/mobile");
}

// ============== التشفير ==============
//
// تحسين أداء: PBKDF2 بـ200K تكرار يستغرق 100-300ms على الهاتف.
// نشتق مفتاح master مرة واحدة (cached) ثم نستخدم HKDF السريع لكل عنصر
// مع salt+IV عشوائيين فريدين. الأمان مكافئ (PBKDF2 يحمي من brute-force على
// كلمة المرور، HKDF يضمن مفاتيح فريدة لكل رسالة).

const PBKDF2_ITERS = 200_000;
const MASTER_SALT = new TextEncoder().encode("galaxy-remote-sync-v1");

let cachedMaster: { password: string; key: CryptoKey } | null = null;

async function getMasterKey(password: string): Promise<CryptoKey> {
  if (cachedMaster && cachedMaster.password === password) return cachedMaster.key;
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const master = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: MASTER_SALT as BufferSource,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "HKDF", length: 256 } as unknown as AesKeyGenParams,
    false,
    ["deriveKey"],
  );
  cachedMaster = { password, key: master };
  return master;
}

async function deriveItemKey(master: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: new Uint8Array() as BufferSource,
    },
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptString(plain: string, password: string): Promise<string> {
  const master = await getMasterKey(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveItemKey(master, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(16 + 12 + ct.byteLength);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return b64encode(out);
}

async function decryptString(b64: string, password: string): Promise<string> {
  const master = await getMasterKey(password);
  const bytes = b64decode(b64);
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ct = bytes.slice(28);
  const key = await deriveItemKey(master, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ============== الإعدادات ==============

export interface RemoteSyncContext {
  licenseCode: string;
  password: string;
  deviceId: string;
}

let cachedCtx: { ctx: RemoteSyncContext; expiresAt: number } | null = null;
const CTX_TTL = 30_000;

export function invalidateRemoteSyncContext() {
  cachedCtx = null;
  cachedMaster = null;
}

export async function verifyRemoteCredentials(
  licenseCode: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const code = licenseCode.trim().toUpperCase();
  const pwd = password.trim();
  if (!code || !pwd) return { ok: false, error: "missing_fields" };
  const res = await callGate("verify", { licenseCode: code, password: pwd }, null);
  return res.ok
    ? { ok: true }
    : { ok: false, error: String(res.body?.error ?? "verify_failed") };
}

async function getContext(): Promise<RemoteSyncContext | null> {
  if (cachedCtx && cachedCtx.expiresAt > Date.now()) return cachedCtx.ctx;
  if (isMobileRoute() && !mobilePairingSessionVerified) return null;
  const act = await db.activation.get(1);
  const settings = await db.settings.get(1);
  if (!act?.activated || !act.activationCode) return null;
  if (!settings?.adminPassword) return null;
  let deviceId = await getMeta("device_id");
  if (!deviceId) {
    deviceId = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await setMeta("device_id", deviceId);
  }
  const ctx: RemoteSyncContext = {
    licenseCode: act.activationCode,
    password: settings.adminPassword,
    deviceId,
  };
  cachedCtx = { ctx, expiresAt: Date.now() + CTX_TTL };

  // تأكّد من تسجيل verifier في السحابة (مرّة واحدة لكل جهاز)
  const registered = await getMeta(scopedMetaKey(ctx, "gate_registered"));
  if (registered !== "1" && !isMobileRoute()) {
    try {
      const res = await callGate("register", ctx, null);
      if (res.ok) {
        await setMeta(scopedMetaKey(ctx, "gate_registered"), "1");
      } else if (res.body?.error === "wrong_password") {
        // كلمة مرور خاطئة على هذا الجهاز ≠ كلمة المرور الأصلية للمحلّ
        console.warn(
          "[RemoteSync] verifier mismatch — كلمة مرور المتحكّم لا تطابق المسجّلة في السحابة",
        );
      } else {
        console.warn("[RemoteSync] register failed:", res.body);
      }
    } catch (e) {
      console.warn("[RemoteSync] register error:", e);
    }
  }
  return ctx;
}

// ============== إضافة إلى الطابور ==============

let suppressHooks = false; // لمنع loop عند تطبيق pull

async function enqueueChange(
  table: SyncedTable,
  row: Record<string, unknown> | null,
  isDeleted: boolean,
  itemIdOverride?: string,
): Promise<void> {
  if (suppressHooks) return;
  const id = itemIdOverride ?? (row ? itemKey(table, row) : null);
  if (!id) return;
  const now = Date.now();
  const rawData = row ? JSON.stringify(row) : null;
  // استبدال أي عنصر سابق لنفس المفتاح في الطابور
  await rdb.transaction("rw", rdb.queue, async () => {
    const existing = await rdb.queue.where("[table+itemId]").equals([table, id]).toArray();
    for (const e of existing) {
      if (e.id !== undefined) await rdb.queue.delete(e.id);
    }
    await rdb.queue.add({
      table,
      itemId: id,
      payload: null,
      rawData,
      isDeleted: isDeleted ? 1 : 0,
      clientUpdatedAt: now,
      createdAt: now,
    });
  });
  // حاول الرفع فوراً (لن يفعل شيئاً إذا أوفلاين)
  scheduleFlush();
}

// ============== الرفع (Push) ==============

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(delayMs = 1500) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushQueue();
  }, delayMs);
}

async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const ctx = await getContext();
  if (!ctx) return;

  // دفعات صغيرة (25) لتجنّب رفع كبير + تشفير متوازٍ
  const items = await rdb.queue.orderBy("id").limit(25).toArray();
  if (items.length === 0) return;

  flushing = true;
  try {
    // شفّر كل العناصر بالتوازي (master key مخبّأ → سريع جداً)
    const rows = await Promise.all(
      items.map(async (it) => ({
        table_name: it.table,
        item_id: it.itemId,
        payload: it.rawData ? await encryptString(it.rawData, ctx.password) : null,
        is_deleted: it.isDeleted === 1,
        device_id: ctx.deviceId,
        client_updated_at: new Date(it.clientUpdatedAt).toISOString(),
      })),
    );

    const res = await callGate("push", ctx, { items: rows });
    if (!res.ok) {
      console.warn("[RemoteSync] push failed:", res.body);
      return; // أبقِ العناصر في الطابور للمحاولة لاحقاً
    }

    // نجح → احذف من الطابور
    const ids = items.map((i) => i.id!).filter((x) => x !== undefined);
    await rdb.queue.bulkDelete(ids);
    await setMeta(scopedMetaKey(ctx, "last_push_at"), String(Date.now()));

    // إذا لا يزال هناك عناصر، استمر
    const remaining = await rdb.queue.count();
    if (remaining > 0) scheduleFlush(500);
  } finally {
    flushing = false;
  }
}

// ============== السحب (Pull) ==============

let pulling = false;

export async function pullRemoteChanges(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (pulling) return { ok: false, count: 0, error: "already_pulling" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, count: 0, error: "offline" };
  }
  const ctx = await getContext();
  if (!ctx) return { ok: false, count: 0, error: "no_context" };

  pulling = true;
  try {
    const lastPullKey = scopedMetaKey(ctx, "last_pull_at");
    const since = (await getMeta(lastPullKey)) ?? "1970-01-01T00:00:00Z";
    const res = await callGate("pull", ctx, { since });
    if (!res.ok) {
      console.warn("[RemoteSync] pull failed:", res.body);
      return { ok: false, count: 0, error: String(res.body?.error ?? "pull_failed") };
    }
    const data = (res.body.items ?? []) as Array<{
      table_name: string;
      item_id: string;
      payload: string | null;
      is_deleted: boolean;
      client_updated_at: string;
      updated_at: string;
      device_id: string | null;
    }>;
    if (!data || data.length === 0) {
      await setMeta(lastPullKey, new Date().toISOString());
      return { ok: true, count: 0 };
    }

    let applied = 0;
    suppressHooks = true;
    try {
      for (const r of data) {
        // تجاهل تعديلاتنا نحن (نفس الجهاز)
        if (r.device_id === ctx.deviceId) continue;
        const table = r.table_name as SyncedTable;
        if (!SYNCED_TABLES.includes(table)) continue;
        const tbl = getTable(table);

        // المفتاح للبحث المحلي
        const [sectionPart, idPart] = String(r.item_id).split(":");
        const localKey: { section?: SectionId; id?: number; type?: string } = {
          section: sectionPart as SectionId,
        };
        if (table === "invoiceCounters") {
          localKey.type = idPart;
        } else {
          localKey.id = Number(idPart);
        }

        // last-write-wins: قارن client_updated_at
        const remoteUpdatedAt = new Date(r.client_updated_at).getTime();
        let skip = false;
        if (table !== "invoiceCounters" && localKey.id !== undefined) {
          const existing = await tbl.get(localKey.id);
          if (existing) {
            const localTs = (existing.updatedAt as number | undefined) ?? 0;
            if (localTs > remoteUpdatedAt) skip = true;
          }
        }
        if (skip) continue;

        if (r.is_deleted) {
          if (table === "invoiceCounters") {
            // العدّادات لا تُحذف عادة
          } else if (localKey.id !== undefined) {
            await tbl.delete(localKey.id);
            applied++;
          }
          continue;
        }

        if (!r.payload) continue;
        try {
          const json = await decryptString(r.payload, ctx.password);
          const obj = JSON.parse(json) as Record<string, unknown>;
          if (table === "invoiceCounters") {
            await tbl.put(obj);
          } else {
            await tbl.put(obj);
          }
          applied++;
        } catch (e) {
          console.warn("[RemoteSync] decrypt failed for", r.item_id, e);
        }
      }
      await setMeta(lastPullKey, new Date().toISOString());
    } finally {
      suppressHooks = false;
    }

    return { ok: true, count: applied };
  } finally {
    pulling = false;
  }
}

// ============== رفع كامل أوّلي (Initial bootstrap) ==============

/**
 * عند أول تشغيل بعد إضافة المزامنة، ارفع كل البيانات الموجودة محلياً.
 * (مرة واحدة لكل جهاز).
 */
export async function bootstrapInitialPush(): Promise<void> {
  const ctx = await getContext();
  if (!ctx) return;

  const doneKey = scopedMetaKey(ctx, "initial_push_done");
  const done = await getMeta(doneKey);
  if (done === "1") return;

  // اجمع كل الصفوف بدفعات على الـmicrotasks لتفادي تجميد الواجهة
  const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
  for (const t of SYNCED_TABLES) {
    const rows = await getTable(t).toArray();
    // أدخل الصفوف بدفعة واحدة على Dexie (أسرع بكثير من add في حلقة)
    const queueRows: QueueRow[] = [];
    const now = Date.now();
    for (const row of rows) {
      const id = itemKey(t, row);
      if (!id) continue;
      queueRows.push({
        table: t,
        itemId: id,
        payload: null,
        rawData: JSON.stringify(row),
        isDeleted: 0,
        clientUpdatedAt: (row.updatedAt as number | undefined) ?? now,
        createdAt: now,
      });
    }
    if (queueRows.length > 0) {
      await rdb.transaction("rw", rdb.queue, async () => {
        for (const row of queueRows) {
          const existing = await rdb.queue
            .where("[table+itemId]")
            .equals([row.table, row.itemId])
            .toArray();
          for (const e of existing) {
            if (e.id !== undefined) await rdb.queue.delete(e.id);
          }
          await rdb.queue.add(row);
        }
      });
    }
    await yieldNow();
  }
  await setMeta(doneKey, "1");
  scheduleFlush(1000);
}

// ============== حالة المزامنة ==============

export interface RemoteSyncStatus {
  enabled: boolean;
  online: boolean;
  pendingCount: number;
  lastPushAt: number | null;
  lastPullAt: number | null;
  licenseCode: string | null;
  deviceId: string | null;
}

export async function getRemoteSyncStatus(): Promise<RemoteSyncStatus> {
  const ctx = await getContext();
  const pending = await rdb.queue.count();
  const lastPush = ctx ? await getMeta(scopedMetaKey(ctx, "last_push_at")) : null;
  const lastPull = ctx ? await getMeta(scopedMetaKey(ctx, "last_pull_at")) : null;
  return {
    enabled: !!ctx,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    pendingCount: pending,
    lastPushAt: lastPush ? Number(lastPush) : null,
    lastPullAt: lastPull ? new Date(lastPull).getTime() : null,
    licenseCode: ctx?.licenseCode ?? null,
    deviceId: ctx?.deviceId ?? null,
  };
}

// ============== مزامنة فورية يدوية ==============

export async function syncNow(): Promise<{
  ok: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}> {
  const ctx = await getContext();
  if (!ctx) return { ok: false, pushed: 0, pulled: 0, error: "no_context" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, pushed: 0, pulled: 0, error: "offline" };
  }
  await bootstrapInitialPush();
  const before = await rdb.queue.count();
  await flushQueue();
  const after = await rdb.queue.count();
  const pulled = await pullRemoteChanges();
  return {
    ok: pulled.ok,
    pushed: Math.max(0, before - after),
    pulled: pulled.count,
    error: pulled.error,
  };
}

// ============== المراقب الرئيسي ==============

let started = false;
let pullTimer: ReturnType<typeof setInterval> | null = null;

export function startRemoteSyncWatcher() {
  if (started) return;
  started = true;

  // 1) hooks على كل جدول
  for (const t of SYNCED_TABLES) {
    const tbl = getTable(t);
    tbl.hook("creating", function (primKey, obj) {
      const row = { ...(obj as Record<string, unknown>) };
      // primKey قد يكون id جديد لم يُحقن بعد في obj
      if (t !== "invoiceCounters" && row.id === undefined && primKey !== undefined) {
        row.id = primKey as number;
      }
      void enqueueChange(t, row, false);
    });
    tbl.hook("updating", function (mods, primKey, obj) {
      const merged = { ...(obj as Record<string, unknown>), ...(mods as Record<string, unknown>) };
      if (t !== "invoiceCounters" && merged.id === undefined && primKey !== undefined) {
        merged.id = primKey as number;
      }
      void enqueueChange(t, merged, false);
    });
    tbl.hook("deleting", function (primKey, obj) {
      const row = (obj as Record<string, unknown>) ?? { id: primKey };
      const id = itemKey(t, row);
      if (id) void enqueueChange(t, null, true, id);
    });
  }

  // 2) عند العودة للإنترنت → ادفع الطابور
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      scheduleFlush(500);
      void pullRemoteChanges();
    });
  }

  // 3) سحب دوري — كل 3 دقائق فقط، ويتوقف عند إخفاء التبويب
  const startPullTimer = () => {
    if (pullTimer) return;
    pullTimer = setInterval(
      () => {
        if (typeof document !== "undefined" && document.hidden) return;
        void pullRemoteChanges();
      },
      3 * 60 * 1000,
    );
  };
  const stopPullTimer = () => {
    if (pullTimer) {
      clearInterval(pullTimer);
      pullTimer = null;
    }
  };
  startPullTimer();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPullTimer();
      else {
        startPullTimer();
        void pullRemoteChanges();
      }
    });
  }

  // 4) إقلاع: bootstrap + flush + pull بعد 5 ثوانٍ من بدء التطبيق (أعطِ الـUI أولوية)
  setTimeout(() => {
    void (async () => {
      await bootstrapInitialPush();
      await flushQueue();
      await pullRemoteChanges();
    })();
  }, 5000);

  // 5) إذا تم تفعيل البرنامج بعد تشغيله، أعد محاولة الرفع الأولي بدون انتظار إعادة فتح التطبيق.
  setTimeout(() => {
    void bootstrapInitialPush();
  }, 20_000);
}

export function stopRemoteSyncWatcher() {
  if (pullTimer) clearInterval(pullTimer);
  pullTimer = null;
  started = false;
}
