/**
 * المرحلة 4 — مزامنة محلية مشفّرة (USB / مجلد شبكة / مجلد محلي)
 *
 * - تستخدم File System Access API لاختيار مجلد دائم (Chrome/Edge/Electron Chromium).
 * - تشفير AES-256-GCM بكلمة مرور المتحكم (PBKDF2 200k iters).
 * - يحفظ ملفات بصيغة `{prefix}-YYYYMMDD-HHmm.galaxy.enc` ويُدوّر آخر N نسخ.
 * - مشغّل تلقائي: كل فاصل دقائق + بعد كل تغيير مهم (debounce 30s).
 * - دالة استرجاع تقرأ ملف .galaxy.enc وتفك تشفيره وتستورده.
 *
 * كل شيء محلي: لا توجد سيرفرات ولا API خارجية.
 */
import Dexie from "dexie";
import { db, exportAllData, importAllData } from "@/lib/db";

// ============== تخزين مقبض المجلد (IndexedDB منفصل) ==============

class HandleStore extends Dexie {
  handles!: Dexie.Table<{ id: string; handle: FileSystemDirectoryHandle }, string>;
  constructor() {
    super("GalaxyCloudSyncHandles");
    this.version(1).stores({ handles: "id" });
  }
}
const handleDb = new HandleStore();

export async function saveDirHandle(handle: FileSystemDirectoryHandle) {
  await handleDb.handles.put({ id: "sync_dir", handle });
}
export async function getDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await handleDb.handles.get("sync_dir");
  return row?.handle ?? null;
}
export async function clearDirHandle() {
  await handleDb.handles.delete("sync_dir");
}

// ============== دعم المتصفح ==============

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** يطلب من المستخدم اختيار مجلد ويحفظ المقبض */
export async function pickSyncFolder(): Promise<{ ok: boolean; name?: string; error?: string }> {
  if (!isFsAccessSupported()) {
    return { ok: false, error: "browser_unsupported" };
  }
  try {
    // @ts-expect-error - showDirectoryPicker is not yet in TS lib for older targets
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "galaxy-sync-folder",
      startIn: "documents",
    });
    await saveDirHandle(handle);
    await db.settings.update(1, { cloudSyncFolderName: handle.name });
    return { ok: true, name: handle.name };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "cancelled" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "pick_failed" };
  }
}

/** يتحقق ويعيد طلب الإذن إن لزم */
async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  // @ts-expect-error - permission APIs experimental on FileSystemHandle
  const cur = await handle.queryPermission(opts);
  if (cur === "granted") return true;
  // @ts-expect-error - permission APIs experimental on FileSystemHandle
  const req = await handle.requestPermission(opts);
  return req === "granted";
}

// ============== التشفير (AES-256-GCM + PBKDF2) ==============

const ENC_VERSION = 1;
const PBKDF2_ITERS = 200_000;
const SALT_LEN = 16;
const IV_LEN = 12;

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * صيغة الملف:
 *   bytes 0..3   = "GLX1" (magic)
 *   byte 4       = version (1)
 *   bytes 5..20  = salt (16)
 *   bytes 21..32 = iv (12)
 *   bytes 33..   = ciphertext (AES-GCM)
 */
async function encryptJson(json: string, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json)),
  );
  const out = new Uint8Array(5 + SALT_LEN + IV_LEN + ct.byteLength);
  out[0] = 0x47; out[1] = 0x4c; out[2] = 0x58; out[3] = 0x31; // "GLX1"
  out[4] = ENC_VERSION;
  out.set(salt, 5);
  out.set(iv, 5 + SALT_LEN);
  out.set(ct, 5 + SALT_LEN + IV_LEN);
  return out;
}

async function decryptToJson(bytes: Uint8Array, password: string): Promise<string> {
  if (bytes.length < 5 + SALT_LEN + IV_LEN + 16) throw new Error("invalid_file");
  if (bytes[0] !== 0x47 || bytes[1] !== 0x4c || bytes[2] !== 0x58 || bytes[3] !== 0x31) {
    throw new Error("not_galaxy_backup");
  }
  if (bytes[4] !== ENC_VERSION) throw new Error("unsupported_version");
  const salt = bytes.slice(5, 5 + SALT_LEN);
  const iv = bytes.slice(5 + SALT_LEN, 5 + SALT_LEN + IV_LEN);
  const ct = bytes.slice(5 + SALT_LEN + IV_LEN);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ============== أسماء الملفات + التدوير ==============

function fileNameNow(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.galaxy.enc`;
}

async function rotate(handle: FileSystemDirectoryHandle, prefix: string, keep: number) {
  const names: string[] = [];
  // values() exists in FS Access spec but not in older TS lib types
  const iter = (handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values();
  for await (const entry of iter) {
    if (entry.kind === "file" && entry.name.startsWith(prefix) && entry.name.endsWith(".galaxy.enc")) {
      names.push(entry.name);
    }
  }
  names.sort(); // اسم الملف يحتوي طابع زمني → ترتيب أبجدي = ترتيب زمني
  const excess = names.length - keep;
  for (let i = 0; i < excess; i++) {
    try { await handle.removeEntry(names[i]); } catch { /* ignore */ }
  }
}

// ============== المزامنة الفعلية ==============

export type SyncResult =
  | { ok: true; fileName: string; bytes: number }
  | { ok: false; reason: "no_folder" | "permission_denied" | "no_password" | "disabled" | "error"; error?: string };

export async function performSync(opts?: { force?: boolean }): Promise<SyncResult> {
  const settings = await db.settings.get(1);
  if (!settings) return { ok: false, reason: "error", error: "no_settings" };
  if (!opts?.force && settings.cloudSyncEnabled !== 1) return { ok: false, reason: "disabled" };

  const handle = await getDirHandle();
  if (!handle) return { ok: false, reason: "no_folder" };

  const granted = await ensurePermission(handle);
  if (!granted) return { ok: false, reason: "permission_denied" };

  const password = settings.adminPassword;
  if (!password || password.length < 1) return { ok: false, reason: "no_password" };

  try {
    const json = await exportAllData();
    const enc = await encryptJson(json, password);
    const name = fileNameNow(settings.cloudSyncFilePrefix ?? "galaxy-backup");
    const fileHandle = await handle.getFileHandle(name, { create: true });
    const writable = await (fileHandle as unknown as {
      createWritable: () => Promise<{ write: (d: BlobPart) => Promise<void>; close: () => Promise<void> }>;
    }).createWritable();
    // كتابة عبر Blob — يتفادى تعارض الأنواع بين Uint8Array<ArrayBufferLike> و BufferSource الصارم
    await writable.write(new Blob([new Uint8Array(enc)]));
    await writable.close();
    await rotate(handle, settings.cloudSyncFilePrefix ?? "galaxy-backup", settings.cloudSyncKeepCount ?? 7);
    await db.settings.update(1, { cloudSyncLastAt: Date.now() });
    return { ok: true, fileName: name, bytes: enc.byteLength };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "unknown" };
  }
}

// ============== الاسترجاع ==============

export async function restoreFromEncryptedFile(file: File, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const json = await decryptToJson(bytes, password);
    await importAllData(json);
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.name === "OperationError") {
      return { ok: false, error: "wrong_password" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "decrypt_failed" };
  }
}

// ============== المراقب التلقائي (مؤقّت + تغيير) ==============

let intervalTimer: ReturnType<typeof setInterval> | null = null;
let changeDebounce: ReturnType<typeof setTimeout> | null = null;
let watcherStarted = false;

const CHANGE_DEBOUNCE_MS = 30 * 1000;

function scheduleOnChange() {
  if (changeDebounce) clearTimeout(changeDebounce);
  changeDebounce = setTimeout(() => {
    void performSync().then((r) => {
      if (!r.ok && r.reason !== "disabled") {
        // فشل صامت — يُسجّل في console فقط حتى لا يزعج أصحاب المحلات
        console.warn("[CloudSync] auto-sync failed:", r);
      }
    });
  }, CHANGE_DEBOUNCE_MS);
}

export function startCloudSyncWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;

  // 1) مؤقّت دوري
  const tick = async () => {
    const s = await db.settings.get(1);
    if (!s || s.cloudSyncEnabled !== 1) return;
    const interval = (s.cloudSyncIntervalMin ?? 60) * 60 * 1000;
    const last = s.cloudSyncLastAt ?? 0;
    if (Date.now() - last >= interval) {
      void performSync();
    }
  };
  // فحص كل 5 دقائق
  intervalTimer = setInterval(tick, 5 * 60 * 1000);
  // فحص أوّلي بعد 20 ثانية من الإقلاع
  setTimeout(tick, 20_000);

  // 2) عند كل تغيير مهم
  const importantTables = [
    db.invoices, db.products, db.debts, db.customers,
    db.expenses, db.suppliers, db.repairDevices, db.workers,
  ];
  for (const tbl of importantTables) {
    tbl.hook("creating", () => scheduleOnChange());
    tbl.hook("updating", () => scheduleOnChange());
    tbl.hook("deleting", () => scheduleOnChange());
  }
}

export function stopCloudSyncWatcher() {
  if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
  if (changeDebounce) { clearTimeout(changeDebounce); changeDebounce = null; }
  watcherStarted = false;
}
