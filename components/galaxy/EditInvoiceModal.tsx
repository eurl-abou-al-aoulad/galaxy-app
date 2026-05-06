import { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, AlertCircle, RotateCcw, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  db,
  type InvoiceRecord,
  type InvoiceItem,
  type SettingsRecord,
  type ReturnLogEntry,
} from "@/lib/db";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, TextInput, TextArea } from "@/components/galaxy/FormField";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { formatDZD, printInvoiceHtml, thermalReceiptHtml, a4InvoiceHtml } from "@/lib/printing";

interface Props {
  invoice: InvoiceRecord;
  settings: SettingsRecord;
  onClose: () => void;
}

/**
 * تعديل فاتورة محفوظة + معالجة الإرجاع تلقائياً:
 * - تقليل كمية بند = إرجاع جزئي → تعاد الفروقات للمخزن
 * - حذف بند كامل = إرجاع كامل لذلك الصنف
 * - زيادة كمية = خصم إضافي من المخزن (مع التحقق)
 * - يُحدّث جدول الديون والإجمالي ويحفظ سجل الإرجاع داخل الفاتورة
 * - زر إعادة الطباعة بنفس رقم الفاتورة (مع شارة "معدّلة")
 */
export function EditInvoiceModal({ invoice, settings, onClose }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<InvoiceItem[]>(() =>
    invoice.items.map((it) => ({ ...it })),
  );
  const [discount, setDiscount] = useState(invoice.discount);
  const [shipping, setShipping] = useState(invoice.shipping);
  const [labor, setLabor] = useState(invoice.labor);
  const [paid, setPaid] = useState(invoice.paid);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const products = useLiveQuery(
    () => db.products.where("section").equals(invoice.section).toArray(),
    [invoice.section],
  );

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.barcode.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  const addItem = (p: NonNullable<typeof products>[number]) => {
    const existing = items.find((it) => it.productId === p.id);
    if (existing) {
      setItems(items.map((it) =>
        it.productId === p.id
          ? { ...it, quantity: it.quantity + 1, total: (it.quantity + 1) * it.sellingPrice }
          : it,
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
  };

  const updateQty = (idx: number, qty: number) => {
    const next = [...items];
    next[idx].quantity = Math.max(0, qty);
    next[idx].total = next[idx].quantity * next[idx].sellingPrice;
    setItems(next);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // حساب الإجمالي الجديد بنفس قواعد الفاتورة الأصلية
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const taxBase = subtotal - discount + shipping + labor;
  const tvaApplies = settings.tvaEnabled === 1;
  const tva = tvaApplies ? (taxBase * settings.tvaRate) / 100 : 0;
  const stampApplies = settings.stampEnabled === 1 && invoice.printSize === "a4";
  const totalBeforeStamp = taxBase + tva;
  const stamp = stampApplies ? Math.min(2500, Math.max(5, Math.round(totalBeforeStamp * 0.01))) : 0;
  const total = totalBeforeStamp + stamp;
  const remaining = Math.max(0, total - paid);

  // حساب الفروقات (إرجاع/إضافة) لكل منتج
  const diffs = useMemo(() => {
    const map = new Map<number, { name: string; oldQty: number; newQty: number; sellingPrice: number }>();
    for (const it of invoice.items) {
      map.set(it.productId, { name: it.name, oldQty: it.quantity, newQty: 0, sellingPrice: it.sellingPrice });
    }
    for (const it of items) {
      const existing = map.get(it.productId);
      if (existing) existing.newQty = it.quantity;
      else map.set(it.productId, { name: it.name, oldQty: 0, newQty: it.quantity, sellingPrice: it.sellingPrice });
    }
    return Array.from(map.entries()).map(([productId, v]) => ({
      productId,
      ...v,
      diff: v.newQty - v.oldQty, // موجب = إضافة (خصم من المخزن)، سالب = إرجاع (إضافة للمخزن)
    }));
  }, [invoice.items, items]);

  const returnedItems = diffs.filter((d) => d.diff < 0);
  const addedItems = diffs.filter((d) => d.diff > 0);
  const refundTotal = returnedItems.reduce((s, d) => s + Math.abs(d.diff) * d.sellingPrice, 0);

  // ضبط المدفوع تلقائياً عند تغيّر الإجمالي (لتجنب remaining سالب غريب)
  useEffect(() => {
    setPaid((p) => Math.min(p, total));
  }, [total]);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (items.length === 0) {
      errs._items = t("invoices.errors.no_items");
    }
    if (addedItems.length > 0 && !products) {
      errs._items = "Stock data not loaded";
    } else {
      // تحقق من توفّر المخزون للزيادات الجديدة فقط
      for (const d of addedItems) {
        const p = products?.find((pp) => pp.id === d.productId);
        if (p && d.diff > p.quantity) {
          errs[`item_${d.productId}`] = t("invoices.errors.qty_exceeds_stock", {
            name: d.name,
            stock: p.quantity,
          });
        }
      }
    }
    if (discount < 0 || shipping < 0 || labor < 0) errs._neg = t("invoices.errors.negative_value");
    if (paid < 0) errs.paid = t("invoices.errors.negative_value");
    if (returnedItems.length > 0 && !reason.trim()) {
      errs.reason = t("invoices.errors.return_reason_required");
    }
    return errs;
  };

  const save = async (action: "save" | "save_print") => {
    if (submitting) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error(t("invoices.errors.summary", { n: Object.keys(errs).length }));
      return;
    }
    setSubmitting(true);
    try {
      const now = Date.now();
      const newStatus =
        items.length === 0
          ? "returned"
          : remaining > 0
          ? paid > 0
            ? "partial"
            : "debt"
          : "paid";

      await db.transaction("rw", [db.invoices, db.products, db.debts], async () => {
        // 1) تحديث المخزن وفق الفروقات
        for (const d of diffs) {
          if (d.diff === 0) continue;
          const p = await db.products.get(d.productId);
          if (!p) continue;
          // diff موجب = خصم إضافي، diff سالب = إعادة للمخزن
          const newQty = Math.max(0, p.quantity - d.diff);
          await db.products.update(d.productId, { quantity: newQty, updatedAt: now });
        }

        // 2) سجل الإرجاع
        const returnLog: ReturnLogEntry[] = invoice.returnLog ? [...invoice.returnLog] : [];
        if (returnedItems.length > 0) {
          returnLog.push({
            date: now,
            reason: reason.trim(),
            refundTotal,
            items: returnedItems.map((d) => ({
              productId: d.productId,
              name: d.name,
              qtyReturned: Math.abs(d.diff),
              refundAmount: Math.abs(d.diff) * d.sellingPrice,
            })),
          });
        }

        // 3) تحديث الفاتورة
        const editCount = (invoice.editCount ?? 0) + 1;
        const updated: Partial<InvoiceRecord> = {
          items,
          originalItems: invoice.originalItems ?? invoice.items,
          subtotal,
          discount,
          tva,
          stamp,
          shipping,
          labor,
          total,
          paid,
          remaining,
          status: newStatus,
          updatedAt: now,
          editedAt: now,
          editCount,
          returnLog,
        };
        await db.invoices.update(invoice.id!, updated);

        // 4) تحديث جدول الديون المرتبط بالفاتورة (إن وجد)
        const linkedDebt = await db.debts.where("invoiceId").equals(invoice.id!).first();
        if (linkedDebt) {
          if (newStatus === "paid" || newStatus === "returned") {
            // الدين مغلق
            await db.debts.update(linkedDebt.id!, {
              totalAmount: total,
              paidAmount: paid,
              remainingAmount: 0,
              status: "paid",
              updatedAt: now,
            });
          } else {
            await db.debts.update(linkedDebt.id!, {
              totalAmount: total,
              paidAmount: paid,
              remainingAmount: remaining,
              status: "active",
              updatedAt: now,
            });
          }
        } else if (newStatus === "debt" || newStatus === "partial") {
          // إنشاء دين جديد إن لم يكن موجوداً
          await db.debts.add({
            section: invoice.section,
            invoiceId: invoice.id!,
            customerId: invoice.customerId,
            customerName: invoice.customerName,
            customerPhone: invoice.customerPhone,
            totalAmount: total,
            paidAmount: paid,
            remainingAmount: remaining,
            payments: paid > 0 ? [{ date: now, amount: paid, note: t("invoices.edit_payment") }] : [],
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      // 5) تحديث totals الزبون إن كان مرتبطاً
      if (invoice.customerId) {
        const c = await db.customers.get(invoice.customerId);
        if (c) {
          await db.customers.update(invoice.customerId, {
            totalReturns: (c.totalReturns ?? 0) + refundTotal,
          });
        }
      }

      toast.success(
        returnedItems.length > 0
          ? t("invoices.return_saved", { count: returnedItems.length })
          : t("common.saved"),
      );

      // إعادة الطباعة إن طُلبت
      if (action === "save_print") {
        const fresh = await db.invoices.get(invoice.id!);
        if (fresh) {
          const html = fresh.printSize === "thermal"
            ? thermalReceiptHtml(fresh, settings)
            : a4InvoiceHtml(fresh, settings);
          printInvoiceHtml(html, fresh.printSize);
        }
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
      toast.error(`${t("invoices.edit_failed")} — ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      title={`${t("invoices.edit_invoice")} — ${invoice.invoiceNumber}`}
      onClose={onClose}
      size="full"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="accent" loading={submitting} onClick={() => save("save")}>
            {t("actions.save")}
          </NeonButton>
          <NeonButton variant="primary" loading={submitting} onClick={() => save("save_print")}>
            {t("invoices.save_and_reprint")}
          </NeonButton>
        </>
      }
    >
      {/* ملخص التعديل */}
      {(returnedItems.length > 0 || addedItems.length > 0) && (
        <div className="mb-5 p-4 rounded-xl border-2 border-warning/40 bg-warning/10">
          <div className="flex items-center gap-2 mb-2 text-warning font-bold">
            <RotateCcw className="h-5 w-5" />
            {t("invoices.changes_summary")}
          </div>
          <div className="space-y-1 text-sm">
            {returnedItems.map((d) => (
              <div key={`r-${d.productId}`} className="flex justify-between">
                <span>↩️ {t("invoices.return")} — {d.name}</span>
                <b className="text-success">+{Math.abs(d.diff)} ({formatDZD(Math.abs(d.diff) * d.sellingPrice)})</b>
              </div>
            ))}
            {addedItems.map((d) => (
              <div key={`a-${d.productId}`} className="flex justify-between">
                <span>➕ {t("invoices.added")} — {d.name}</span>
                <b className="text-warning">+{d.diff}</b>
              </div>
            ))}
            {refundTotal > 0 && (
              <div className="flex justify-between pt-2 mt-2 border-t border-warning/30 text-base">
                <b>{t("invoices.refund_total")}</b>
                <b className="text-success">{formatDZD(refundTotal)}</b>
              </div>
            )}
          </div>
        </div>
      )}

      {/* بحث وإضافة منتج جديد */}
      <FormSection title={t("invoices.items")}>
        <div className="relative mb-3">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <TextInput
            placeholder={t("inventory.search_placeholder")}
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
                  className="w-full flex items-center justify-between p-2.5 hover:bg-primary/20 text-start border-b border-border/30 last:border-0 cursor-pointer"
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
                <th className="p-2 text-center">{t("invoices.original_qty")}</th>
                <th className="p-2">{t("inventory.quantity")}</th>
                <th className="p-2 text-end">{t("inventory.selling_price")}</th>
                <th className="p-2 text-end">{t("invoices.total")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted-foreground">
                    {t("invoices.all_returned")}
                  </td>
                </tr>
              ) : (
                items.map((it, i) => {
                  const original = invoice.items.find((o) => o.productId === it.productId);
                  const itemErr = errors[`item_${it.productId}`];
                  return (
                    <tr key={`${it.productId}-${i}`} className={`border-t border-border/40 ${
                      original && it.quantity < original.quantity ? "bg-success/5" : ""
                    }`}>
                      <td className="p-2 font-semibold">{it.name}</td>
                      <td className="p-2 text-center text-muted-foreground">
                        {original?.quantity ?? <span className="text-warning">{t("invoices.new")}</span>}
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateQty(i, +e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
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
                          className="text-destructive p-1 hover:bg-destructive/10 rounded cursor-pointer"
                          title={t("invoices.return_full")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
              {/* صفوف المنتجات التي حُذفت كلياً (إرجاع كامل) */}
              {invoice.items
                .filter((o) => !items.find((it) => it.productId === o.productId))
                .map((o) => (
                  <tr key={`removed-${o.productId}`} className="border-t border-border/40 bg-success/10 line-through opacity-60">
                    <td className="p-2 font-semibold">{o.name}</td>
                    <td className="p-2 text-center">{o.quantity}</td>
                    <td className="p-2 text-center text-success font-bold">0 (↩️)</td>
                    <td className="p-2 text-end">{formatDZD(o.sellingPrice)}</td>
                    <td className="p-2 text-end">{formatDZD(o.total)}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => setItems([...items, { ...o }])}
                        className="text-primary p-1 hover:bg-primary/10 rounded cursor-pointer"
                        title={t("invoices.restore_item")}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </FormSection>

      {/* سبب الإرجاع — إلزامي عند وجود إرجاعات */}
      {returnedItems.length > 0 && (
        <FormSection title={t("invoices.return_reason")}>
          <FormField label={t("invoices.return_reason_label")} required error={errors.reason}>
            <TextArea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={!!errors.reason}
              placeholder={t("invoices.return_reason_placeholder")}
            />
          </FormField>
        </FormSection>
      )}

      {/* الحسابات */}
      <FormSection title={t("invoices.subtotal")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <FormField label={t("invoices.discount")}>
            <TextInput type="number" value={discount} onChange={(e) => setDiscount(+e.target.value)} min={0} />
          </FormField>
          {(invoice.section === "factory" || invoice.section === "hardware") && (
            <>
              <FormField label={t("invoices.shipping")}>
                <TextInput type="number" value={shipping} onChange={(e) => setShipping(+e.target.value)} min={0} />
              </FormField>
              <FormField label={t("invoices.labor")}>
                <TextInput type="number" value={labor} onChange={(e) => setLabor(+e.target.value)} min={0} />
              </FormField>
            </>
          )}
          <FormField label={t("invoices.paid")} error={errors.paid}>
            <TextInput type="number" value={paid} onChange={(e) => setPaid(+e.target.value)} min={0} />
          </FormField>
        </div>

        <div className="glass-card rounded-xl p-4 mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>{t("invoices.subtotal")}</span><b>{formatDZD(subtotal)}</b></div>
          {tvaApplies && (
            <div className="flex justify-between">
              <span>{t("invoices.tva")} ({settings.tvaRate}%)</span>
              <b>{formatDZD(tva)}</b>
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
          {remaining > 0 && (
            <div className="flex justify-between text-warning">
              <span>{t("invoices.remaining")}</span>
              <b>{formatDZD(remaining)}</b>
            </div>
          )}
        </div>
      </FormSection>
    </FormModal>
  );
}
