/**
 * تصدير شامل لكل بيانات GalaxyDB إلى ملف Excel (.xlsx)
 * كل جدول في ورقة منفصلة. التواريخ تحوّل لقراءة بشرية.
 * يستخدم SheetJS (xlsx) — يعمل بالكامل في المتصفح بدون شبكة.
 */
import * as XLSX from "xlsx";
import { db, ALL_SECTIONS, type SectionId } from "@/lib/db";

const SECTION_LABEL: Record<SectionId, string> = {
  clothing: "ملابس",
  supermarket: "سوبر ماركت",
  hardware: "عتاد",
  repair: "إصلاح",
  factory: "مصنع",
};

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function sectionLabel(s: SectionId): string {
  return SECTION_LABEL[s] ?? s;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function autoFitCols(rows: Record<string, unknown>[]): XLSX.ColInfo[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((k) => {
    const max = Math.max(
      k.length,
      ...rows.map((r) => String(r[k] ?? "").length),
    );
    return { wch: Math.min(Math.max(max + 2, 10), 50) };
  });
}

function appendSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const safeName = name.slice(0, 31).replace(/[\\/?*[\]:]/g, "_");
  const ws =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["(فارغ)"]]);
  if (rows.length > 0) ws["!cols"] = autoFitCols(rows);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
}

export async function exportAllToExcel(): Promise<{ ok: boolean; filename?: string; error?: string }> {
  try {
    const wb = XLSX.utils.book_new();

    // ============== ملخص ==============
    const [
      products,
      invoices,
      debts,
      customers,
      expenses,
      suppliers,
      repairs,
      tasks,
      workers,
      settings,
      auditLog,
    ] = await Promise.all([
      db.products.toArray(),
      db.invoices.toArray(),
      db.debts.toArray(),
      db.customers.toArray(),
      db.expenses.toArray(),
      db.suppliers.toArray(),
      db.repairDevices.toArray(),
      db.tasks.toArray(),
      db.workers.toArray(),
      db.settings.get(1),
      db.auditLog.orderBy("createdAt").reverse().limit(2000).toArray(),
    ]);

    const summary = ALL_SECTIONS.map((s) => {
      const sInvoices = invoices.filter((x) => x.section === s);
      const sDebts = debts.filter((x) => x.section === s && x.status === "active");
      const sExpenses = expenses.filter((x) => x.section === s);
      const totalSales = sInvoices.reduce((a, x) => a + n(x.total), 0);
      const totalPaid = sInvoices.reduce((a, x) => a + n(x.paid), 0);
      const totalRemaining = sDebts.reduce((a, x) => a + n(x.remainingAmount), 0);
      const totalExpenses = sExpenses.reduce((a, x) => a + n(x.amount), 0);
      return {
        "القسم": sectionLabel(s),
        "عدد المنتجات": products.filter((p) => p.section === s).length,
        "عدد الفواتير": sInvoices.length,
        "إجمالي المبيعات": totalSales,
        "المدفوع": totalPaid,
        "ديون نشطة": totalRemaining,
        "إجمالي المصاريف": totalExpenses,
        "صافي (مبيعات - مصاريف)": totalSales - totalExpenses,
        "عدد الزبائن": customers.filter((c) => c.section === s).length,
        "عدد الموردين": suppliers.filter((x) => x.section === s).length,
        "عدد العمال": workers.filter((w) => w.section === s).length,
      };
    });
    appendSheet(wb, "ملخص", summary);

    // ============== الفواتير ==============
    appendSheet(
      wb,
      "الفواتير",
      invoices.map((inv) => ({
        "رقم الفاتورة": inv.invoiceNumber,
        "القسم": sectionLabel(inv.section),
        "النوع": inv.type,
        "الحالة": inv.status,
        "الزبون": inv.customerName,
        "هاتف الزبون": inv.customerPhone,
        "عدد الأصناف": inv.items.length,
        "المجموع الفرعي": n(inv.subtotal),
        "الخصم": n(inv.discount),
        "ض.ق.م": n(inv.tva),
        "الطابع": n(inv.stamp),
        "الشحن": n(inv.shipping),
        "اليد العاملة": n(inv.labor),
        "الإجمالي": n(inv.total),
        "المدفوع": n(inv.paid),
        "المتبقي": n(inv.remaining),
        "طريقة الدفع": inv.paymentMethod,
        "ملاحظات": inv.notes,
        "أنشئ بواسطة": inv.createdBy,
        "تاريخ الإنشاء": fmtDate(inv.createdAt),
        "آخر تعديل": fmtDate(inv.updatedAt),
      })),
    );

    // ============== أسطر الفواتير (تفاصيل) ==============
    const invoiceLines: Record<string, unknown>[] = [];
    for (const inv of invoices) {
      for (const it of inv.items) {
        invoiceLines.push({
          "رقم الفاتورة": inv.invoiceNumber,
          "القسم": sectionLabel(inv.section),
          "تاريخ": fmtDate(inv.createdAt),
          "الباركود": it.barcode,
          "المنتج": it.name,
          "الوحدة": it.unit,
          "الكمية": n(it.quantity),
          "سعر الشراء": n(it.purchasePrice),
          "سعر البيع": n(it.sellingPrice),
          "الخصم": n(it.discount),
          "الإجمالي": n(it.total),
          "الربح/الخسارة": (n(it.sellingPrice) - n(it.purchasePrice)) * n(it.quantity) - n(it.discount),
        });
      }
    }
    appendSheet(wb, "أسطر الفواتير", invoiceLines);

    // ============== المخزون ==============
    appendSheet(
      wb,
      "المخزون",
      products.map((p) => ({
        "القسم": sectionLabel(p.section),
        "الباركود": p.barcode,
        "الاسم": p.name,
        "الفئة": p.category,
        "الوحدة": p.unit,
        "الحجم": p.size ?? "",
        "اللون": p.color ?? "",
        "الماركة": p.brand ?? "",
        "سعر الشراء": n(p.purchasePrice),
        "سعر البيع": n(p.sellingPrice),
        "الكمية": n(p.quantity),
        "الحد الأدنى": n(p.minStock),
        "قيمة الشراء (مخزون)": n(p.purchasePrice) * n(p.quantity),
        "قيمة البيع المتوقعة": n(p.sellingPrice) * n(p.quantity),
        "الربح المتوقع": (n(p.sellingPrice) - n(p.purchasePrice)) * n(p.quantity),
        "تاريخ الصلاحية": fmtDate(p.expiryDate ?? null),
        "أُضيف في": fmtDate(p.createdAt),
        "آخر تحديث": fmtDate(p.updatedAt),
      })),
    );

    // ============== الديون ==============
    appendSheet(
      wb,
      "الديون",
      debts.map((d) => ({
        "القسم": sectionLabel(d.section),
        "رقم الفاتورة (ID)": d.invoiceId,
        "الزبون": d.customerName,
        "الهاتف": d.customerPhone,
        "الإجمالي": n(d.totalAmount),
        "المدفوع": n(d.paidAmount),
        "المتبقي": n(d.remainingAmount),
        "عدد الدفعات": d.payments.length,
        "الحالة": d.status,
        "أنشئ في": fmtDate(d.createdAt),
        "آخر تحديث": fmtDate(d.updatedAt),
      })),
    );

    // ============== دفعات الديون (تفاصيل) ==============
    const debtPayments: Record<string, unknown>[] = [];
    for (const d of debts) {
      for (const pay of d.payments) {
        debtPayments.push({
          "القسم": sectionLabel(d.section),
          "الزبون": d.customerName,
          "تاريخ الدفع": fmtDate(pay.date),
          "المبلغ": n(pay.amount),
          "ملاحظة": pay.note,
        });
      }
    }
    appendSheet(wb, "دفعات الديون", debtPayments);

    // ============== الزبائن ==============
    appendSheet(
      wb,
      "الزبائن",
      customers.map((c) => ({
        "القسم": sectionLabel(c.section),
        "الاسم": c.name,
        "الهاتف": c.phone,
        "العنوان": c.address,
        "RC": c.rc ?? "",
        "NIF": c.nif ?? "",
        "NIC": c.nic ?? "",
        "AI": c.ai ?? "",
        "إجمالي المشتريات": n(c.totalPurchases),
        "إجمالي الديون": n(c.totalDebt),
        "إجمالي الإرجاعات": n(c.totalReturns),
        "ملاحظات": c.notes,
        "أُضيف في": fmtDate(c.createdAt),
      })),
    );

    // ============== المصاريف ==============
    appendSheet(
      wb,
      "المصاريف",
      expenses.map((e) => ({
        "القسم": sectionLabel(e.section),
        "التصنيف": e.category,
        "الوصف": e.description,
        "المبلغ": n(e.amount),
        "مدفوع": e.paid ? "نعم" : "لا",
        "التاريخ": fmtDate(e.date),
        "ملاحظات": e.notes,
      })),
    );

    // ============== الموردون ==============
    appendSheet(
      wb,
      "الموردون",
      suppliers.map((s) => ({
        "القسم": sectionLabel(s.section),
        "الاسم": s.name,
        "الهاتف": s.phone,
        "البريد": s.email,
        "العنوان": s.address,
        "الفئة": s.category,
        "ملاحظات": s.notes,
        "أُضيف في": fmtDate(s.createdAt),
      })),
    );

    // ============== الإصلاح ==============
    appendSheet(
      wb,
      "الإصلاح",
      repairs.map((r) => ({
        "القسم": sectionLabel(r.section),
        "رقم التذكرة": r.ticketNumber,
        "الزبون": r.customerName,
        "الهاتف": r.customerPhone,
        "نوع الجهاز": r.deviceType,
        "الماركة": r.brand,
        "الموديل": r.model,
        "IMEI": r.imei,
        "وصف العطل": r.problemDescription,
        "ملاحظات التشخيص": r.diagnosisNotes,
        "التكلفة المقدّرة": n(r.estimatedCost),
        "التكلفة النهائية": n(r.finalCost),
        "الحالة": r.status,
        "تاريخ الاستلام": fmtDate(r.receivedAt),
        "تاريخ الإكمال": fmtDate(r.completedAt),
        "تاريخ التسليم": fmtDate(r.deliveredAt),
      })),
    );

    // ============== المهام ==============
    appendSheet(
      wb,
      "المهام",
      tasks.map((tk) => ({
        "القسم": sectionLabel(tk.section),
        "العنوان": tk.title,
        "الوصف": tk.description,
        "الزبون": tk.customerName,
        "أُسندت إلى": tk.assignedTo,
        "تاريخ الاستحقاق": fmtDate(tk.dueDate),
        "تاريخ الإكمال": fmtDate(tk.completedAt),
        "الحالة": tk.status,
        "الأولوية": tk.priority,
        "أنشئت في": fmtDate(tk.createdAt),
      })),
    );

    // ============== العمال ==============
    appendSheet(
      wb,
      "العمال",
      workers.map((w) => ({
        "القسم": sectionLabel(w.section),
        "الاسم": w.name,
        "الكود": w.code,
        "الصلاحيات": (w.permissions ?? []).join(", "),
        "نشط": w.active ? "نعم" : "لا",
        "أُضيف في": fmtDate(w.createdAt),
      })),
    );

    // ============== سجل العمليات ==============
    appendSheet(
      wb,
      "سجل العمليات",
      auditLog.map((a) => ({
        "القسم": sectionLabel(a.section),
        "العملية": a.action,
        "الوحدة": a.module,
        "المستخدم": a.user,
        "التفاصيل": a.details,
        "التاريخ": fmtDate(a.createdAt),
      })),
    );

    // ============== الإعدادات ==============
    if (settings) {
      const settingsRows = Object.entries(settings)
        .filter(([k]) => k !== "companyLogo" && k !== "adminPassword")
        .map(([k, v]) => ({
          "المفتاح": k,
          "القيمة": typeof v === "object" ? JSON.stringify(v) : String(v ?? ""),
        }));
      appendSheet(wb, "الإعدادات", settingsRows);
    }

    // ============== حفظ ==============
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 16);
    const filename = `galaxy-export-${stamp}.xlsx`;
    XLSX.writeFile(wb, filename);
    return { ok: true, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
