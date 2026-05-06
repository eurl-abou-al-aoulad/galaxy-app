/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * ============================================================================
 * 🛡️  ضمانة حفظ البيانات — DATA SAFETY GUARANTEE  🛡️
 * ============================================================================
 *
 * هذا الملف يمثل تعهداً مُلزماً لكل مطور (إنسان أو AI) يعدّل هذا المشروع:
 *
 *   ⚠️  لا يجوز — تحت أي ظرف — حذف بيانات المستخدم (الفواتير، المنتجات،
 *       الزبائن، الديون، المصاريف، الموردين...) عند:
 *
 *         1. انتهاء فترة التجربة (Trial expired)
 *         2. انتهاء مدة الاشتراك (License expired)
 *         3. إلغاء الترخيص من طرف المالك (Revoked)
 *         4. حذف الترخيص من قاعدة بيانات السيرفر (Invalid code)
 *         5. أي تغيير في حالة التفعيل
 *
 *   ✅  السلوك الصحيح: قفل العمليات الكتابية فقط (Read-Only Mode)
 *       مع إتاحة عرض البيانات وتصديرها كاملة.
 *
 *   البيانات ملك المستخدم وحده. حذفها يعتبر خرقاً جسيماً للثقة وقد يعرّض
 *   المشروع لمسؤولية قانونية.
 *
 *   إذا احتاج المستخدم فعلياً لمسح بياناته فيجب أن يكون ذلك:
 *     - بطلب صريح وواعٍ منه شخصياً (ليس من السيرفر ولا تلقائياً)
 *     - عبر زر "حذف كل البيانات" في الإعدادات مع تأكيد مزدوج
 *
 * ============================================================================
 */

import { db, exportAllData } from "./db";

/** الجداول المحظور حذفها تلقائياً تحت أي ظرف */
export const PROTECTED_TABLES = [
  "settings",
  "workers",
  "products",
  "invoices",
  "debts",
  "customers",
  "expenses",
  "suppliers",
  "invoiceCounters",
  "repairDevices",
  "tasks",
  "auditLog",
] as const;

/**
 * يُستدعى من أي مسار قد يحاول مسح بيانات بسبب تغيير حالة الترخيص.
 * يطلق خطأ يمنع التنفيذ ويسجل الحادث.
 */
export function assertNoDestructiveOpOnLicenseChange(context: string): never {
  const msg =
    `🚨 [DATA-SAFETY] محاولة حذف بيانات المستخدم بسبب تغيير حالة الترخيص: ${context}. ` +
    `هذه العملية محظورة تماماً. راجع src/lib/data-safety.ts.`;
  console.error(msg);
  throw new Error(msg);
}

/** ينزّل ملف JSON بكل بيانات المستخدم (نسخة احتياطية شاملة). */
export async function downloadFullBackup(): Promise<void> {
  const json = await exportAllData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `galaxy-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** يُرجع إحصاءات سريعة لطمأنة المستخدم بأن بياناته سليمة. */
export async function getDataSafetyReport(): Promise<{
  invoices: number;
  products: number;
  customers: number;
  debts: number;
  expenses: number;
  suppliers: number;
  total: number;
}> {
  const [invoices, products, customers, debts, expenses, suppliers] =
    await Promise.all([
      db.invoices.count(),
      db.products.count(),
      db.customers.count(),
      db.debts.count(),
      db.expenses.count(),
      db.suppliers.count(),
    ]);
  return {
    invoices,
    products,
    customers,
    debts,
    expenses,
    suppliers,
    total: invoices + products + customers + debts + expenses + suppliers,
  };
}
