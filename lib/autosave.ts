/**
 * نظام الحفظ التلقائي + استعادة في حال فقد IndexedDB
 * - يخزّن نسخة كاملة من البيانات في localStorage (سعة ~5MB في معظم المتصفحات)
 * - debounce 30 ثانية بعد آخر تغيير
 * - عند الإقلاع: إذا IndexedDB فارغ والنسخة موجودة → استعادة تلقائية
 */
import { db, exportAllData, importAllData } from "@/lib/db";

const KEY_DATA = "galaxy_autosave_latest";
const KEY_AT = "galaxy_autosave_at";
const DEBOUNCE_MS = 30 * 1000;

let timer: ReturnType<typeof setTimeout> | null = null;

export async function saveSnapshotNow(): Promise<{ ok: boolean; bytes: number; error?: string }> {
  try {
    const json = await exportAllData();
    const bytes = new Blob([json]).size;
    try {
      localStorage.setItem(KEY_DATA, json);
      localStorage.setItem(KEY_AT, String(Date.now()));
      return { ok: true, bytes };
    } catch (e) {
      return { ok: false, bytes, error: e instanceof Error ? e.message : "storage_full" };
    }
  } catch (e) {
    return { ok: false, bytes: 0, error: e instanceof Error ? e.message : "export_failed" };
  }
}

export function getLastSavedAt(): number | null {
  const v = localStorage.getItem(KEY_AT);
  return v ? +v : null;
}

export function scheduleAutosave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void saveSnapshotNow();
  }, DEBOUNCE_MS);
}

/**
 * يبدأ مراقبة التغييرات على الجداول الرئيسية ويُحفظ Snapshot بعد debounce.
 */
export function startAutosaveWatcher() {
  const tables = [
    db.products,
    db.invoices,
    db.debts,
    db.customers,
    db.expenses,
    db.suppliers,
    db.repairDevices,
    db.tasks,
    db.settings,
    db.workers,
  ];
  for (const tbl of tables) {
    tbl.hook("creating", () => scheduleAutosave());
    tbl.hook("updating", () => scheduleAutosave());
    tbl.hook("deleting", () => scheduleAutosave());
  }
}

/**
 * عند الإقلاع: إذا IndexedDB فارغ تماماً (لا منتجات ولا فواتير) لكن
 * هناك نسخة محفوظة في localStorage → استعادة تلقائية.
 * يُرجع true إذا تمت الاستعادة.
 */
export async function restoreSnapshotIfEmpty(): Promise<boolean> {
  const json = localStorage.getItem(KEY_DATA);
  if (!json) return false;

  const productsCount = await db.products.count();
  const invoicesCount = await db.invoices.count();
  if (productsCount > 0 || invoicesCount > 0) return false;

  try {
    await importAllData(json);
    return true;
  } catch {
    return false;
  }
}

export function clearAutosave() {
  localStorage.removeItem(KEY_DATA);
  localStorage.removeItem(KEY_AT);
}
