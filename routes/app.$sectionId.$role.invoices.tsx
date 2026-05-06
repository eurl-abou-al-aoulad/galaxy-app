import { useState, useMemo, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, Receipt, Printer, FileText, Search, Eye, Truck, ClipboardList, Ticket, AlertCircle, Pencil, UserPlus, RotateCcw, Trash, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  db,
  nextInvoiceNumber,
  type InvoiceType,
  type InvoiceItem,
  type InvoiceStatus,
  type CustomerRecord,
} from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { InvoiceDetailsModal } from "@/components/galaxy/InvoiceDetailsModal";
import { EditInvoiceModal } from "@/components/galaxy/EditInvoiceModal";
import { CustomerAutocomplete } from "@/components/galaxy/CustomerAutocomplete";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, TextInput, TextArea } from "@/components/galaxy/FormField";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import {
  formatDZD,
  printInvoiceHtml,
  thermalReceiptHtml,
  a4InvoiceHtml,
  exportInvoicePDF,
} from "@/lib/printing";
import type { InvoiceRecord } from "@/lib/db";

export const Route = createFileRoute("/app/$sectionId/$role/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { t } = useTranslation();
  const { sectionId, role, workerCode } = useSection();
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);

  const invoices = useLiveQuery(
    () => db.invoices.where("section").equals(sectionId).reverse().sortBy("createdAt"),
    [sectionId],
  );
  const settings = useLiveQuery(() => db.settings.get(1), []);

  // اختصارات لوحة المفاتيح: Ctrl+N فاتورة جديدة، Esc إغلاق النوافذ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        if (!showNew && !viewing && !editing) {
          e.preventDefault();
          setShowNew(true);
        }
      } else if (e.key === "Escape" && !isTyping) {
        if (showNew) setShowNew(false);
        else if (viewing) setViewing(null);
        else if (editing) setEditing(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNew, viewing, editing]);

  const handlePrint = (inv: NonNullable<typeof invoices>[number]) => {
    if (!settings) return;
    const html = inv.printSize === "thermal" ? thermalReceiptHtml(inv, settings) : a4InvoiceHtml(inv, settings);
    printInvoiceHtml(html, inv.printSize);
  };

  const handlePDF = (inv: NonNullable<typeof invoices>[number]) => {
    if (!settings) return;
    exportInvoicePDF(inv, settings);
  };

  const performDelete = async (inv: NonNullable<typeof invoices>[number]) => {
    try {
      // إرجاع البنود إلى المخزن (نستخدم originalItems إن وُجدت لتغطية حالات التعديل)
      const itemsToRestore = inv.originalItems ?? inv.items;
      for (const it of itemsToRestore) {
        const p = await db.products.get(it.productId);
        if (p) {
          await db.products.update(it.productId, { quantity: p.quantity + it.quantity });
        }
      }
      // حذف الدين المرتبط
      const linkedDebts = await db.debts.where("invoiceId").equals(inv.id!).toArray();
      for (const d of linkedDebts) {
        await db.debts.delete(d.id!);
      }
      // حذف الفاتورة
      await db.invoices.delete(inv.id!);
      toast.success(t("i18n_extra.invoices_deleted_ok", { number: inv.invoiceNumber, count: itemsToRestore.length }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("i18n_extra.invoices_unexpected_error");
      toast.error(t("i18n_extra.invoices_delete_failed", { msg }));
    }
  };

  const handleDelete = (inv: NonNullable<typeof invoices>[number]) => {
    toast(t("i18n_extra.invoices_delete_confirm", { number: inv.invoiceNumber }), {
      action: {
        label: t("i18n_extra.invoices_delete_permanent"),
        onClick: () => void performDelete(inv),
      },
      duration: 8000,
    });
  };

  const isAdmin = role === "admin";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <Receipt className="h-7 w-7 text-primary" /> {t("invoices.title")}
        </h1>
        <NeonButton variant="primary" onClick={() => setShowNew(true)}>
          <Plus className="h-5 w-5" /> {t("invoices.new_invoice")}
        </NeonButton>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 text-start">{t("invoices.invoice_number")}</th>
                <th className="px-3 py-3 text-start">{t("invoices.type")}</th>
                <th className="px-3 py-3 text-start">{t("invoices.customer")}</th>
                <th className="px-3 py-3 text-end">{t("invoices.total")}</th>
                <th className="px-3 py-3 text-center">{t("invoices.status")}</th>
                <th className="px-3 py-3 text-center">{t("actions.print")}</th>
              </tr>
            </thead>
            <tbody>
              {!invoices || invoices.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-3 font-mono text-xs">
                      {inv.invoiceNumber}
                      {inv.editedAt && (
                        <span className="ms-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/40" title={t("invoices.modified")}>
                          <RotateCcw className="h-2.5 w-2.5" />×{inv.editCount ?? 1}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">{t(`invoices.${inv.type}`)}</td>
                    <td className="px-3 py-3">{inv.customerName || "—"}</td>
                    <td className="px-3 py-3 text-end font-bold">{formatDZD(inv.total)}</td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewing(inv)} className="p-2 rounded-lg hover:bg-accent/20 text-accent cursor-pointer" title={t("actions.view")}><Eye className="h-4 w-4" /></button>
                        {isAdmin && (
                          <button onClick={() => setEditing(inv)} className="p-2 rounded-lg hover:bg-warning/20 text-warning cursor-pointer" title={t("invoices.edit_invoice")}><Pencil className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => handlePrint(inv)} className="p-2 rounded-lg hover:bg-primary/20 text-primary cursor-pointer" title={t("actions.print")}><Printer className="h-4 w-4" /></button>
                        <button onClick={() => handlePDF(inv)} className="p-2 rounded-lg hover:bg-accent/20 text-accent cursor-pointer" title={t("actions.export_pdf")}><FileText className="h-4 w-4" /></button>
                        {isAdmin && (
                          <button onClick={() => handleDelete(inv)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive cursor-pointer" title={t("actions.delete")}><Trash className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && settings && (
        <NewInvoiceModal
          sectionId={sectionId}
          createdBy={role === "admin" ? "admin" : workerCode ?? "worker"}
          onClose={() => setShowNew(false)}
          tvaRate={settings.tvaRate}
          tvaEnabled={settings.tvaEnabled === 1}
          stampEnabled={settings.stampEnabled === 1}
        />
      )}

      {viewing && settings && (
        <InvoiceDetailsModal invoice={viewing} settings={settings} onClose={() => setViewing(null)} />
      )}

      {editing && settings && (
        <EditInvoiceModal invoice={editing} settings={settings} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  const map: Record<InvoiceStatus, string> = {
    paid: "bg-success/20 text-success border-success/40",
    partial: "bg-warning/20 text-warning border-warning/40",
    debt: "bg-destructive/20 text-destructive border-destructive/40",
    suspended: "bg-muted text-muted-foreground border-border",
    returned: "bg-accent/20 text-accent border-accent/40",
  };
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold border ${map[status]}`}>
      {t(`invoices.status_${status}`)}
    </span>
  );
}

function NewInvoiceModal({
  sectionId,
  createdBy,
  onClose,
  tvaRate,
  tvaEnabled,
  stampEnabled,
}: {
  sectionId: ReturnType<typeof useSection>["sectionId"];
  createdBy: string;
  onClose: () => void;
  tvaRate: number;
  tvaEnabled: boolean;
  stampEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<InvoiceType>("facture");
  const [customerKind, setCustomerKind] = useState<"individual" | "company">("individual");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerRc, setCustomerRc] = useState("");
  const [customerNif, setCustomerNif] = useState("");
  const [customerNis, setCustomerNis] = useState("");
  const [customerAr, setCustomerAr] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const handleSelectCustomer = (c: CustomerRecord) => {
    setCustomerId(c.id ?? null);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setCustomerRc(c.rc || "");
    setCustomerNif(c.nif || "");
    setCustomerNis(c.nic || "");
    setCustomerAr(c.ai || "");
    if (c.rc || c.nif || c.nic || c.ai) setCustomerKind("company");
  };

  const handleUnlinkCustomer = () => {
    setCustomerId(null);
  };

  const handleSaveCustomerToFiles = async () => {
    if (savingCustomer) return;
    if (!customerName.trim()) {
      toast.error(t("invoices.errors.customer_required_for_debt"));
      return;
    }
    setSavingCustomer(true);
    try {
      // ابحث عن تكرار باسم+هاتف داخل نفس القسم
      const existing = await db.customers
        .where("[section+name]")
        .equals([sectionId, customerName.trim()])
        .first();
      const payload = {
        section: sectionId,
        name: customerName.trim(),
        phone: customerPhone.trim(),
        address: "",
        rc: customerKind === "company" ? customerRc.trim() : "",
        nif: customerKind === "company" ? customerNif.trim() : "",
        nic: customerKind === "company" ? customerNis.trim() : "",
        ai: customerKind === "company" ? customerAr.trim() : "",
        totalPurchases: 0,
        totalDebt: 0,
        totalReturns: 0,
        notes: "",
        createdAt: Date.now(),
      };
      if (existing && existing.id !== undefined) {
        await db.customers.update(existing.id, {
          phone: payload.phone || existing.phone,
          rc: payload.rc || existing.rc,
          nif: payload.nif || existing.nif,
          nic: payload.nic || existing.nic,
          ai: payload.ai || existing.ai,
        });
        setCustomerId(existing.id);
      } else {
        const newId = await db.customers.add(payload);
        setCustomerId(newId as number);
      }
      toast.success(t("invoices.customer_saved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("i18n_extra.invoices_error");
      toast.error(msg);
    } finally {
      setSavingCustomer(false);
    }
  };
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [labor, setLabor] = useState(0);
  const [paid, setPaid] = useState(0);
  const [printSize, setPrintSize] = useState<"thermal" | "a4">(
    sectionId === "supermarket" || sectionId === "clothing" ? "thermal" : "a4",
  );
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState(0);

  const products = useLiveQuery(
    () => db.products.where("section").equals(sectionId).toArray(),
    [sectionId],
  );

  // عرض الرقم التلقائي المتوقع للفاتورة الجديدة (شارة اطلاعية)
  const counter = useLiveQuery(
    () => db.invoiceCounters.get([sectionId, type]),
    [sectionId, type],
  );
  const expectedNumber = useMemo(() => {
    const prefix: Record<InvoiceType, string> = { facture: "FAC", bon_livraison: "BL", bon_commande: "BC", ticket: "TKT" };
    const sectionPrefix: Record<typeof sectionId, string> = {
      clothing: "CL", supermarket: "SM", hardware: "HW", repair: "RP", factory: "FC",
    };
    const next = (counter?.lastNumber ?? 0) + 1;
    return `${prefix[type]}-${sectionPrefix[sectionId]}-${new Date().getFullYear()}-${next.toString().padStart(5, "0")}`;
  }, [counter, type, sectionId]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 10);
    return products.filter((p) => p.barcode.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 10);
  }, [products, search]);

  const addItem = (p: NonNullable<typeof products>[number]) => {
    const existing = items.find((it) => it.productId === p.id);
    if (existing) {
      setItems(items.map((it) =>
        it.productId === p.id ? { ...it, quantity: it.quantity + 1, total: (it.quantity + 1) * it.sellingPrice } : it,
      ));
    } else {
      setItems([...items, {
        productId: p.id!,
        barcode: p.barcode,
        name: p.name,
        unit: p.unit,
        quantity: 1,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        discount: 0,
        total: p.sellingPrice,
      }]);
    }
    setSearch("");
    // امسح خطأ البنود إن وُجد
    if (errors._items) {
      setErrors((e) => { const { _items, ...rest } = e; return rest; });
    }
  };

  const updateQty = (idx: number, qty: number) => {
    const next = [...items];
    next[idx].quantity = Math.max(0, qty);
    next[idx].total = next[idx].quantity * next[idx].sellingPrice;
    setItems(next);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // ─── الماسح الضوئي (USB HID): يلتقط الباركود ويضيف المنتج تلقائياً ───
  useBarcodeScanner((code) => {
    const p = products?.find((x) => x.barcode === code);
    if (p) {
      addItem(p);
      toast.success(t("invoices.scan_added", { name: p.name }));
    } else {
      toast.error(t("invoices.scan_not_found", { code }));
    }
  }, true);

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const taxBase = subtotal - discount + shipping + labor;
  const tvaApplies = tvaEnabled;
  const tva = tvaApplies ? (taxBase * tvaRate) / 100 : 0;
  const stampApplies = stampEnabled && printSize === "a4";
  const totalBeforeStamp = taxBase + tva;
  // طابع جبائي جزائري: 1% من الإجمالي، أدنى 5 DZD، أقصى 2500 DZD، يُطبّق على الفواتير المدفوعة نقداً
  const stamp = stampApplies ? Math.min(2500, Math.max(5, Math.round(totalBeforeStamp * 0.01))) : 0;
  const total = totalBeforeStamp + stamp;
  const remaining = Math.max(0, total - paid);

  // افتراضياً تسديد كامل
  useEffect(() => { setPaid(total); }, [total]);

  const validate = (status: InvoiceStatus, paidValue: number = paid): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (items.length === 0) {
      errs._items = t("invoices.errors.no_items");
    } else {
      // تحقق كميات البنود
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.quantity <= 0) {
          errs[`item_${i}`] = t("invoices.errors.qty_must_be_positive", { name: it.name });
          continue;
        }
        const stockProd = products?.find((p) => p.id === it.productId);
        if (stockProd && it.quantity > stockProd.quantity) {
          errs[`item_${i}`] = t("invoices.errors.qty_exceeds_stock", {
            name: it.name,
            stock: stockProd.quantity,
          });
        }
      }
    }

    if (discount < 0) errs.discount = t("invoices.errors.negative_value");
    else if (discount > subtotal) errs.discount = t("invoices.errors.discount_exceeds_subtotal");
    if (shipping < 0) errs.shipping = t("invoices.errors.negative_value");
    if (labor < 0) errs.labor = t("invoices.errors.negative_value");

    if ((status === "debt" || status === "partial") && !customerName.trim()) {
      errs.customerName = t("invoices.errors.customer_required_for_debt");
    }

    if (status === "partial" && (paidValue <= 0 || paidValue >= total)) {
      errs.paid = t("invoices.errors.partial_amount_invalid");
    }

    return errs;
  };

  const save = async (status: InvoiceStatus, overridePaid?: number) => {
    if (submitting) return;
    const effectivePaid = overridePaid !== undefined ? overridePaid : paid;
    const effectiveRemaining = Math.max(0, total - effectivePaid);
    const errs = validate(status, effectivePaid);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error(t("invoices.errors.summary", { n: Object.keys(errs).length }));
      return;
    }

    setSubmitting(true);
    try {
      const number = await nextInvoiceNumber(sectionId, type);
      const now = Date.now();

      // ─── ترحيل الزبون تلقائياً إلى ملفات الزبائن ───
      // إذا أُدخل اسم زبون ولم يكن مرتبطاً، نبحث عنه ونحدّث أو نُنشئه
      let resolvedCustomerId = customerId;
      if (customerName.trim() && status !== "suspended") {
        if (resolvedCustomerId == null) {
          const existing = await db.customers
            .where("[section+name]")
            .equals([sectionId, customerName.trim()])
            .first();
          if (existing && existing.id !== undefined) {
            resolvedCustomerId = existing.id;
            // تحديث البيانات الجبائية الفارغة عند الزبون
            await db.customers.update(existing.id, {
              phone: customerPhone || existing.phone,
              rc: customerKind === "company" ? (customerRc || existing.rc) : existing.rc,
              nif: customerKind === "company" ? (customerNif || existing.nif) : existing.nif,
              nic: customerKind === "company" ? (customerNis || existing.nic) : existing.nic,
              ai: customerKind === "company" ? (customerAr || existing.ai) : existing.ai,
            });
          } else {
            const newId = await db.customers.add({
              section: sectionId,
              name: customerName.trim(),
              phone: customerPhone.trim(),
              address: "",
              rc: customerKind === "company" ? customerRc.trim() : "",
              nif: customerKind === "company" ? customerNif.trim() : "",
              nic: customerKind === "company" ? customerNis.trim() : "",
              ai: customerKind === "company" ? customerAr.trim() : "",
              totalPurchases: 0,
              totalDebt: 0,
              totalReturns: 0,
              notes: "",
              createdAt: now,
            });
            resolvedCustomerId = newId as number;
            toast.success(t("customers.auto_created"));
          }
        }
        // تحديث إجمالي المشتريات والديون للزبون
        const cust = resolvedCustomerId != null ? await db.customers.get(resolvedCustomerId) : null;
        if (cust && cust.id !== undefined) {
          await db.customers.update(cust.id, {
            totalPurchases: cust.totalPurchases + total,
            totalDebt: cust.totalDebt + (status === "debt" || status === "partial" ? Math.max(0, total - effectivePaid) : 0),
          });
        }
      }

      const inv = {
        section: sectionId,
        invoiceNumber: number,
        type,
        customerId: resolvedCustomerId,
        customerName,
        customerPhone,
        customerRc: customerKind === "company" ? customerRc : "",
        customerNif: customerKind === "company" ? customerNif : "",
        customerNic: customerKind === "company" ? customerNis : "",
        customerAi: customerKind === "company" ? customerAr : "",
        items,
        subtotal,
        discount,
        tva,
        stamp,
        shipping,
        labor,
        total,
        paid: status === "suspended" ? 0 : effectivePaid,
        remaining: status === "suspended" ? total : effectiveRemaining,
        status,
        paymentMethod: "cash",
        notes,
        printSize,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };
      const id = await db.invoices.add(inv);

      // تحديث المخزن
      for (const it of items) {
        const p = await db.products.get(it.productId);
        if (p) await db.products.update(it.productId, { quantity: Math.max(0, p.quantity - it.quantity) });
      }

      // إنشاء دين — يُرحَّل تلقائياً إلى إدارة الديون
      if (status === "debt" || status === "partial") {
        await db.debts.add({
          section: sectionId,
          invoiceId: id as number,
          customerId: resolvedCustomerId,
          customerName,
          customerPhone,
          totalAmount: total,
          paidAmount: effectivePaid,
          remainingAmount: effectiveRemaining,
          payments: effectivePaid > 0 ? [{ date: now, amount: effectivePaid, note: t("i18n_extra.invoices_first_payment_note") }] : [],
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        toast.success(t("i18n_extra.invoices_debt_transferred", { amount: formatDZD(effectiveRemaining) }));
      } else {
        toast.success(t("common.saved"));
      }

      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("i18n_extra.invoices_unexpected_error");
      toast.error(t("i18n_extra.invoices_save_failed", { msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const invoiceTypes: { id: InvoiceType; icon: typeof Receipt }[] = [
    { id: "facture", icon: Receipt },
    { id: "bon_livraison", icon: Truck },
    { id: "bon_commande", icon: ClipboardList },
    { id: "ticket", icon: Ticket },
  ];


  return (
    <>
    <FormModal
      title={t("invoices.new_invoice")}
      onClose={onClose}
      size="full"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="ghost" onClick={() => save("suspended")} disabled={submitting}>
            {t("invoices.suspend")}
          </NeonButton>
          <NeonButton
            variant="accent"
            onClick={() => {
              if (items.length === 0) {
                toast.error(t("invoices.errors.no_items"));
                return;
              }
              if (!customerName.trim()) {
                setErrors((e) => ({ ...e, customerName: t("invoices.errors.customer_required_for_debt") }));
                toast.error(t("invoices.errors.customer_required_for_debt"));
                return;
              }
              setPartialAmount(Math.floor(total / 2));
              setPartialOpen(true);
            }}
            disabled={submitting}
          >
            {t("invoices.pay_partial")}
          </NeonButton>
          <NeonButton
            variant="primary"
            onClick={() => save("debt", 0)}
            disabled={submitting}
          >
            {t("invoices.pay_debt")}
          </NeonButton>
          <NeonButton
            variant="primary"
            onClick={() => save("paid", total)}
            disabled={submitting}
          >
            {t("invoices.pay_full")}
          </NeonButton>
        </>
      }
    >
      {/* أنواع الفاتورة */}
      <FormSection title={t("invoices.type")}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {invoiceTypes.map(({ id: tp, icon: Icon }) => {
            const active = type === tp;
            return (
              <button
                key={tp}
                type="button"
                onClick={() => setType(tp)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl h-20 p-2 text-xs md:text-sm font-bold transition-all border-2 ${
                  active
                    ? "bg-primary/20 border-primary text-primary neon-glow scale-[1.03]"
                    : "border-border hover:border-primary/60 hover:bg-primary/5 text-muted-foreground"
                }`}
              >
                <Icon className={`h-6 w-6 md:h-7 md:w-7 ${active ? "text-primary" : ""}`} />
                <span className="leading-tight text-center">{t(`invoices.${tp}`)}</span>
              </button>
            );
          })}
        </div>
      </FormSection>

      {/* بيانات الزبون */}
      <FormSection title={t("invoices.customer")}>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setCustomerKind("individual")}
            className={`flex-1 rounded-xl p-3 text-sm font-bold border-2 transition-all ${
              customerKind === "individual"
                ? "bg-primary/20 border-primary text-primary neon-glow"
                : "border-border hover:border-primary/50 text-muted-foreground"
            }`}
          >
            {t("invoices.customer_individual")}
          </button>
          <button
            type="button"
            onClick={() => setCustomerKind("company")}
            className={`flex-1 rounded-xl p-3 text-sm font-bold border-2 transition-all ${
              customerKind === "company"
                ? "bg-accent/20 border-accent text-accent neon-glow"
                : "border-border hover:border-accent/50 text-muted-foreground"
            }`}
          >
            {t("invoices.customer_company")}
          </button>
        </div>

        {/* بحث عن زبون مسجّل (Autocomplete) */}
        <div className="mb-4">
          <CustomerAutocomplete
            sectionId={sectionId}
            selectedCustomerId={customerId}
            customerName={customerName}
            onChangeName={(n) => setCustomerName(n)}
            onSelectCustomer={handleSelectCustomer}
            onUnlink={handleUnlinkCustomer}
            error={errors.customerName}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t("customers.phone")}>
            <TextInput
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="06xxxxxxxx"
              inputMode="tel"
            />
          </FormField>
          <div className="flex items-end">
            <NeonButton
              variant="ghost"
              onClick={handleSaveCustomerToFiles}
              disabled={savingCustomer || !customerName.trim() || customerId !== null}
              className="w-full"
            >
              <UserPlus className="h-4 w-4" />
              {customerId !== null ? t("invoices.customer_linked") : t("invoices.save_customer_to_files")}
            </NeonButton>
          </div>
        </div>
        {customerKind === "company" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 rounded-xl border-2 border-accent/30 bg-accent/5">
            <FormField label={t("i18n_extra.invoices_field_rc")}>
              <TextInput
                value={customerRc}
                onChange={(e) => setCustomerRc(e.target.value)}
                placeholder="RC"
              />
            </FormField>
            <FormField label={t("i18n_extra.invoices_field_nif")}>
              <TextInput
                value={customerNif}
                onChange={(e) => setCustomerNif(e.target.value)}
                placeholder="NIF"
              />
            </FormField>
            <FormField label={t("i18n_extra.invoices_field_nis")}>
              <TextInput
                value={customerNis}
                onChange={(e) => setCustomerNis(e.target.value)}
                placeholder="NIS"
              />
            </FormField>
            <FormField label={t("i18n_extra.invoices_field_ar")}>
              <TextInput
                value={customerAr}
                onChange={(e) => setCustomerAr(e.target.value)}
                placeholder="AR"
              />
            </FormField>
          </div>
        )}
      </FormSection>

      {/* البنود */}
      <FormSection title={t("invoices.items")}>
        {/* شارة رقم الفاتورة المتوقع + مؤشر الماسح الضوئي */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-mono font-bold">
            {t("invoices.next_number")}: {expectedNumber}
          </span>
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-success/15 border border-success/40 text-success" title={t("invoices.scanner_active")}>
            <ScanLine className="h-4 w-4" />
          </span>
        </div>
        <div className="relative mb-3">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <TextInput
            placeholder={t("inventory.search_placeholder") + " — " + t("i18n_extra.inventory_search_placeholder_extra")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
          {search && filtered.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 glass-card rounded-xl max-h-60 overflow-y-auto border border-primary/30">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-primary/20 text-start border-b border-border/30 last:border-0"
                >
                  <span>
                    <b>{p.name}</b>
                    <span className="text-xs text-muted-foreground ms-2">({p.barcode})</span>
                    <span className="text-[10px] text-muted-foreground ms-2">[{p.quantity}]</span>
                  </span>
                  <span className="text-accent font-semibold">{formatDZD(p.sellingPrice)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {errors._items && (
          <div className="flex items-center gap-2 text-sm text-destructive font-medium mb-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errors._items}</span>
          </div>
        )}

        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-2 text-start">{t("inventory.name")}</th>
                <th className="p-2">{t("inventory.quantity")}</th>
                <th className="p-2 text-end">{t("inventory.selling_price")}</th>
                <th className="p-2 text-end">{t("invoices.total")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-muted-foreground">
                    {t("common.no_data")}
                  </td>
                </tr>
              ) : (
                items.map((it, i) => {
                  const itemErr = errors[`item_${i}`];
                  return (
                    <>
                      <tr key={i} className="border-t border-border/40">
                        <td className="p-2">{it.name}</td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateQty(i, +e.target.value)}
                            className={`w-20 h-9 text-center rounded bg-input border ${
                              itemErr ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                            }`}
                          />
                        </td>
                        <td className="p-2 text-end">{formatDZD(it.sellingPrice)}</td>
                        <td className="p-2 text-end font-bold">{formatDZD(it.total)}</td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="text-destructive p-1 hover:bg-destructive/10 rounded"
                            title={t("actions.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {itemErr && (
                        <tr key={`${i}-err`} className="bg-destructive/5">
                          <td colSpan={5} className="px-3 py-1.5 text-xs text-destructive font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {itemErr}
                            </span>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </FormSection>

      {/* الحسابات */}
      <FormSection title={t("invoices.subtotal")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <FormField label={t("invoices.discount")} error={errors.discount}>
            <TextInput
              type="number"
              value={discount}
              onChange={(e) => setDiscount(+e.target.value)}
              error={!!errors.discount}
              min={0}
            />
          </FormField>
          {(sectionId === "factory" || sectionId === "hardware") && (
            <>
              <FormField label={t("invoices.shipping")} error={errors.shipping}>
                <TextInput
                  type="number"
                  value={shipping}
                  onChange={(e) => setShipping(+e.target.value)}
                  error={!!errors.shipping}
                  min={0}
                />
              </FormField>
              <FormField label={t("invoices.labor")} error={errors.labor}>
                <TextInput
                  type="number"
                  value={labor}
                  onChange={(e) => setLabor(+e.target.value)}
                  error={!!errors.labor}
                  min={0}
                />
              </FormField>
            </>
          )}
          <FormField label={t("invoices.paid")} error={errors.paid}>
            <TextInput
              type="number"
              value={paid}
              onChange={(e) => setPaid(+e.target.value)}
              error={!!errors.paid}
              min={0}
            />
          </FormField>
        </div>

        {/* بطاقة الإجمالي */}
        <div className="glass-card rounded-xl p-4 mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span>{t("invoices.subtotal")}</span>
            <b>{formatDZD(subtotal)}</b>
          </div>
          {tvaEnabled ? (
            <div className="flex justify-between">
              <span>{t("invoices.tva")} ({tvaRate}%)</span>
              <b>{formatDZD(tva)}</b>
            </div>
          ) : (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>{t("invoices.tva")} ({tvaRate}%)</span>
              <span className="italic">— {t("settings.tva_enabled") || "désactivée"}</span>
            </div>
          )}
          {stampApplies && stamp > 0 && (
            <div className="flex justify-between">
              <span>{t("invoices.stamp")} (1%)</span>
              <b>{formatDZD(stamp)}</b>
            </div>
          )}
          <div className="flex justify-between text-lg pt-2 border-t border-border">
            <span className="font-bold">{t("invoices.total")}</span>
            <b className="text-gradient-galaxy">{formatDZD(total)}</b>
          </div>
          <div className="flex justify-between text-success">
            <span>{t("invoices.paid")}</span>
            <b>{formatDZD(paid)}</b>
          </div>
          <div className={`flex justify-between ${remaining > 0 ? "text-warning font-bold" : "text-muted-foreground"}`}>
            <span>{t("invoices.remaining")}</span>
            <b>{formatDZD(remaining)}</b>
          </div>
        </div>
      </FormSection>

      {/* خيارات الطباعة + ملاحظات */}
      <FormSection title={t("actions.print")}>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPrintSize("thermal")}
            className={`flex-1 rounded-xl p-3 text-sm font-semibold border-2 transition-all ${
              printSize === "thermal"
                ? "bg-accent/20 border-accent text-accent"
                : "border-border hover:border-accent/50"
            }`}
          >
            {t("invoices.print_thermal")} (80mm)
          </button>
          <button
            type="button"
            onClick={() => setPrintSize("a4")}
            className={`flex-1 rounded-xl p-3 text-sm font-semibold border-2 transition-all ${
              printSize === "a4"
                ? "bg-accent/20 border-accent text-accent"
                : "border-border hover:border-accent/50"
            }`}
          >
            {t("invoices.print_a4")} (TVA)
          </button>
        </div>
        <FormField label={t("expenses.description")}>
          <TextArea
            placeholder={t("i18n_extra.invoices_notes_placeholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </FormSection>
    </FormModal>

    {partialOpen && (
      <FormModal
        title={t("invoices.pay_partial")}
        onClose={() => setPartialOpen(false)}
        size="md"
        footer={
          <>
            <NeonButton variant="ghost" onClick={() => setPartialOpen(false)}>
              {t("actions.cancel")}
            </NeonButton>
            <NeonButton
              variant="primary"
              disabled={submitting}
              onClick={async () => {
                if (partialAmount <= 0 || partialAmount >= total) {
                  toast.error(t("invoices.errors.partial_amount_invalid"));
                  return;
                }
                setPartialOpen(false);
                await save("partial", partialAmount);
              }}
            >
              {t("actions.save")} — {formatDZD(partialAmount)}
            </NeonButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="glass-card p-3 rounded-xl text-sm space-y-1">
            <div className="flex justify-between"><span>{t("invoices.total")}</span><b>{formatDZD(total)}</b></div>
            <div className="flex justify-between text-success">
              <span>{t("invoices.paid")}</span>
              <b>{formatDZD(partialAmount)}</b>
            </div>
            <div className="flex justify-between text-warning font-bold">
              <span>{t("invoices.remaining")}</span>
              <b>{formatDZD(Math.max(0, total - partialAmount))}</b>
            </div>
          </div>
          <FormField label={t("debts.payment_amount") || t("i18n_extra.invoices_payment_now_label")} required>
            <TextInput
              type="number"
              autoFocus
              value={partialAmount}
              onChange={(e) => setPartialAmount(Math.max(0, +e.target.value))}
              min={0.01}
              max={total - 0.01}
            />
          </FormField>
          <p
            className="text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: t("i18n_extra.invoices_remaining_to_debts", { name: customerName || "—" }),
            }}
          />
        </div>
      </FormModal>
    )}
    </>
  );
}
