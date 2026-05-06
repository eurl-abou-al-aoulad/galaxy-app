/**
 * مكتبة عميلة للمزامنة مع Supabase الخارجي
 * تجمع كل البيانات المحلية من Dexie وترفعها دفعة واحدة
 */
import { db } from "./db";
import {
  pushBatchToExternal,
  verifyMobileLogin,
  fetchMobileData,
  upsertMobileItem,
} from "@/server/external-sync.functions";
import { loadLicense } from "./license/storage";
import { getDeviceId } from "./license/device";

const LS_KEY_LAST_PUSH = "galaxy_external_sync_last_push";
const LS_KEY_CONTROL_CODE = "galaxy_external_control_code";

export const DEFAULT_CONTROL_CODE = "admin";

export function getControlCode(): string {
  let code = localStorage.getItem(LS_KEY_CONTROL_CODE);
  if (!code) {
    code = DEFAULT_CONTROL_CODE;
    localStorage.setItem(LS_KEY_CONTROL_CODE, code);
  }
  return code;
}

export function setControlCode(code: string): void {
  localStorage.setItem(LS_KEY_CONTROL_CODE, code);
}

export function getLastPushAt(): number | null {
  const v = localStorage.getItem(LS_KEY_LAST_PUSH);
  return v ? +v : null;
}

export interface PushResult {
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * ارفع كل البيانات المحلية إلى Supabase الخارجي
 */
export async function pushAllToExternal(): Promise<PushResult> {
  try {
    const license = await loadLicense();
    if (!license?.payload?.code) {
      return { ok: false, count: 0, error: "البرنامج غير مفعّل" };
    }
    const licenseCode = license.payload.code;

    const settings = await db.settings.get(1);
    const controlCode = getControlCode();
    const deviceId = getDeviceId();

    // collect all data
    const [products, invoices, debts, expenses, customers, suppliers, workers] =
      await Promise.all([
        db.products.toArray(),
        db.invoices.toArray(),
        db.debts.toArray(),
        db.expenses.toArray(),
        db.customers.toArray(),
        db.suppliers.toArray(),
        db.workers.toArray(),
      ]);

    const items: { dataType: string; payload: unknown }[] = [];
    products.forEach((p) => items.push({ dataType: "products", payload: p }));
    invoices.forEach((p) => items.push({ dataType: "invoices", payload: p }));
    debts.forEach((p) => items.push({ dataType: "debts", payload: p }));
    expenses.forEach((p) => items.push({ dataType: "expenses", payload: p }));
    customers.forEach((p) => items.push({ dataType: "customers", payload: p }));
    suppliers.forEach((p) => items.push({ dataType: "suppliers", payload: p }));
    workers.forEach((p) => items.push({ dataType: "workers", payload: p }));

    if (items.length === 0) {
      return { ok: false, count: 0, error: "لا توجد بيانات للرفع" };
    }

    const result = await pushBatchToExternal({
      data: {
        licenseCode,
        controlCode,
        shopName: settings?.companyName ?? "",
        shopAddress: settings?.companyAddress ?? "",
        shopPhone: settings?.companyPhone ?? "",
        ownerName: "",
        deviceId,
        items: items as { dataType: any; payload: any }[],
      },
    });

    localStorage.setItem(LS_KEY_LAST_PUSH, Date.now().toString());
    return { ok: true, count: result.count };
  } catch (e) {
    return {
      ok: false,
      count: 0,
      error: e instanceof Error ? e.message : "خطأ غير معروف",
    };
  }
}

// ============== مساعدات للهاتف ==============

const MOBILE_SESSION_KEY = "galaxy_mobile_session";

export interface MobileSession {
  licenseCode: string;
  controlCode: string;
  shopName: string | null;
  loggedAt: number;
}

export function getMobileSession(): MobileSession | null {
  try {
    const raw = localStorage.getItem(MOBILE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearMobileSession(): void {
  localStorage.removeItem(MOBILE_SESSION_KEY);
}

export async function loginToMobile(
  licenseCode: string,
  controlCode: string
): Promise<{ ok: boolean; error?: string; shopName?: string | null }> {
  try {
    const result = await verifyMobileLogin({
      data: { licenseCode: licenseCode.trim(), controlCode: controlCode.trim() },
    });
    if (!result.ok) {
      const reason =
        result.reason === "license_not_found"
          ? "كود التفعيل غير موجود في السحابة"
          : "كود المتحكم غير صحيح";
      return { ok: false, error: reason };
    }
    const session: MobileSession = {
      licenseCode: licenseCode.trim(),
      controlCode: controlCode.trim(),
      shopName: result.shop.shopName,
      loggedAt: Date.now(),
    };
    localStorage.setItem(MOBILE_SESSION_KEY, JSON.stringify(session));
    return { ok: true, shopName: result.shop.shopName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "فشل الاتصال" };
  }
}

export type MobileDataType =
  | "products"
  | "invoices"
  | "debts"
  | "expenses"
  | "customers"
  | "suppliers"
  | "workers";

export async function loadMobileData(
  types: MobileDataType[]
): Promise<Record<string, any[]>> {
  const session = getMobileSession();
  if (!session) throw new Error("غير مسجّل الدخول");

  const result = await fetchMobileData({
    data: {
      licenseCode: session.licenseCode,
      controlCode: session.controlCode,
      dataTypes: types,
    },
  });
  return result.data;
}

export async function saveMobileItem(
  dataType: MobileDataType,
  payload: unknown
): Promise<void> {
  const session = getMobileSession();
  if (!session) throw new Error("غير مسجّل الدخول");

  await upsertMobileItem({
    data: {
      licenseCode: session.licenseCode,
      controlCode: session.controlCode,
      dataType,
      payload: payload as any,
      deviceId: "mobile",
    },
  });
}
