import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { CreditCard, Plus, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { db, type DebtRecord } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { formatDZD, formatDate, debtPaymentReceiptHtml, printInvoiceHtml } from "@/lib/printing";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, TextInput } from "@/components/galaxy/FormField";
import { ManualDebtModal } from "@/components/galaxy/ManualDebtModal";

export const Route = createFileRoute("/app/$sectionId/$role/debts")({
  component: DebtsPage,
});

function DebtsPage() {
  const { t, i18n } = useTranslation();
  const { sectionId } = useSection();
  const debts = useLiveQuery(() => db.debts.where("section").equals(sectionId).reverse().sortBy("updatedAt"), [sectionId]);
  const [paying, setPaying] = useState<DebtRecord | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  if (!debts) return null;

  const totalActive = debts.filter((d) => d.status === "active").reduce((s, d) => s + d.remainingAmount, 0);

  // أعمار الديون (Aging Report) — تصنيف الديون النشطة حسب القدم
  const now0 = Date.now();
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  for (const d of debts) {
    if (d.status !== "active") continue;
    const days = Math.floor((now0 - d.createdAt) / 86400000);
    if (days <= 0) aging.current += d.remainingAmount;
    else if (days <= 30) aging.d30 += d.remainingAmount;
    else if (days <= 60) aging.d60 += d.remainingAmount;
    else if (days <= 90) aging.d90 += d.remainingAmount;
    else aging.over90 += d.remainingAmount;
  }

  // monthly chart of remaining debts
  const months: { m: string; amount: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const amount = debts
      .filter((x) => x.createdAt >= d.getTime() && x.createdAt < next.getTime())
      .reduce((s, x) => s + x.remainingAmount, 0);
    months.push({ m: d.toLocaleDateString(i18n.language || "ar", { month: "short" }), amount: Math.round(amount) });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" /> {t("debts.title")}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <NeonButton variant="accent" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> {t("debts.manual_debt")}
          </NeonButton>
          <div className="glass-card rounded-2xl px-5 py-3 border-warning/40">
            <div className="text-xs text-muted-foreground">{t("debts.total_debts")}</div>
            <div className="text-2xl font-black text-warning">{formatDZD(totalActive)}</div>
          </div>
        </div>
      </div>

      {/* تقرير أعمار الديون */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">{t("debts.aging_report")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { l: t("debts.aging_current"), v: aging.current, cls: "text-success border-success/40" },
            { l: t("debts.aging_1_30"), v: aging.d30, cls: "text-foreground border-border" },
            { l: t("debts.aging_31_60"), v: aging.d60, cls: "text-warning border-warning/40" },
            { l: t("debts.aging_61_90"), v: aging.d90, cls: "text-warning border-warning/60" },
            { l: t("debts.aging_over90"), v: aging.over90, cls: "text-destructive border-destructive/50" },
          ].map((s) => (
            <div key={s.l} className={`rounded-xl border bg-background/40 p-3 ${s.cls}`}>
              <div className="text-[11px] text-muted-foreground">{s.l}</div>
              <div className="font-black text-lg">{formatDZD(s.v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-2">{t("debts.monthly_chart")}</h3>
        <div className="h-44 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0.05 280 / 0.2)" />
              <XAxis dataKey="m" stroke="oklch(0.7 0.03 280)" />
              <YAxis stroke="oklch(0.7 0.03 280)" />
              <Tooltip contentStyle={{ background: "oklch(0.18 0.05 280)", border: "1px solid oklch(0.7 0.2 200 / 0.4)", borderRadius: 12 }} />
              <Bar dataKey="amount" fill="oklch(0.78 0.18 35)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-start">{t("customers.name")}</th>
                <th className="px-3 py-3 text-end">{t("invoices.total")}</th>
                <th className="px-3 py-3 text-end">{t("invoices.paid")}</th>
                <th className="px-3 py-3 text-end">{t("invoices.remaining")}</th>
                <th className="px-3 py-3 text-center">{t("expenses.date")}</th>
                <th className="px-3 py-3 text-center">{t("debts.add_payment")}</th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : debts.map((d) => (
                <tr key={d.id} className={`border-t border-border/40 ${d.status === "paid" ? "opacity-50" : ""}`}>
                  <td className="px-3 py-3 font-semibold">{d.customerName || "—"}<div className="text-xs text-muted-foreground">{d.customerPhone}</div></td>
                  <td className="px-3 py-3 text-end">{formatDZD(d.totalAmount)}</td>
                  <td className="px-3 py-3 text-end text-success">{formatDZD(d.paidAmount)}</td>
                  <td className="px-3 py-3 text-end font-bold text-warning">{formatDZD(d.remainingAmount)}</td>
                  <td className="px-3 py-3 text-center text-xs text-muted-foreground">{formatDate(d.updatedAt)}</td>
                  <td className="px-3 py-3 text-center">
                    {d.status === "active" && (
                      <button onClick={() => setPaying(d)} className="px-3 py-1 rounded-lg bg-success/20 text-success border border-success/40 text-xs font-semibold hover:bg-success/30">
                        <Plus className="h-3 w-3 inline" /> {t("debts.add_payment")}
                      </button>
                    )}
                    {d.status === "paid" && <span className="text-success text-xs">✅ {t("invoices.status_paid")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {paying && <PaymentModal debt={paying} onClose={() => setPaying(null)} />}
      {manualOpen && <ManualDebtModal sectionId={sectionId} onClose={() => setManualOpen(false)} />}
    </div>
  );
}

function PaymentModal({ debt, onClose }: { debt: DebtRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(debt.remainingAmount);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedPayment, setSavedPayment] = useState<{
    amount: number;
    date: number;
    note: string;
    newPaid: number;
    newRemaining: number;
    receiptNumber: string;
  } | null>(null);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  const save = async () => {
    const e: Record<string, string> = {};
    if (amount <= 0) e.amount = t("validation.must_be_positive");
    else if (amount > debt.remainingAmount) e.amount = t("validation.amount_exceeds");
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t("validation.fields_missing_one"));
      return;
    }
    const now = Date.now();
    const newPaid = debt.paidAmount + amount;
    const newRemaining = debt.totalAmount - newPaid;
    const fullyPaid = newRemaining <= 0;
    await db.debts.update(debt.id!, {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      payments: [...debt.payments, { date: now, amount, note }],
      status: fullyPaid ? "paid" : "active",
      updatedAt: now,
    });

    // مزامنة الفاتورة المرتبطة (إن وُجدت)
    if (debt.invoiceId && debt.invoiceId > 0) {
      const inv = await db.invoices.get(debt.invoiceId);
      if (inv) {
        const invNewPaid = (inv.paid || 0) + amount;
        const invNewRemaining = Math.max(0, inv.total - invNewPaid);
        const invFullyPaid = invNewRemaining <= 0;
        await db.invoices.update(debt.invoiceId, {
          paid: invFullyPaid ? inv.total : invNewPaid,
          remaining: invNewRemaining,
          status: invFullyPaid ? "paid" : "partial",
          updatedAt: now,
        });
        if (invFullyPaid) {
          await db.auditLog.add({
            section: debt.section,
            action: "auto_close_invoice",
            module: "invoices",
            user: "system",
            details: `Invoice ${inv.invoiceNumber} auto-closed via debt payoff`,
            createdAt: now,
          });
        }
      }
    }

    // مزامنة سجل الزبون
    if (debt.customerId) {
      const cust = await db.customers.get(debt.customerId);
      if (cust) {
        await db.customers.update(debt.customerId, {
          totalDebt: Math.max(0, (cust.totalDebt || 0) - amount),
        });
      }
    }

    toast.success(fullyPaid ? t("invoice_extra.auto_status_updated") : t("common.saved"));
    setSavedPayment({
      amount,
      date: now,
      note,
      newPaid,
      newRemaining,
      receiptNumber: `RCP-${debt.id}-${(debt.payments.length + 1).toString().padStart(3, "0")}`,
    });
  };

  const handlePrintReceipt = () => {
    if (!savedPayment || !settings) return;
    const html = debtPaymentReceiptHtml({
      settings,
      customerName: debt.customerName || "—",
      customerPhone: debt.customerPhone,
      paymentAmount: savedPayment.amount,
      paymentDate: savedPayment.date,
      paymentNote: savedPayment.note,
      totalDebt: debt.totalAmount,
      totalPaid: savedPayment.newPaid,
      remaining: savedPayment.newRemaining,
      receiptNumber: savedPayment.receiptNumber,
    });
    printInvoiceHtml(html, "thermal");
  };

  return (
    <FormModal
      title={t("debts.add_payment")}
      onClose={onClose}
      size="md"
      footer={
        savedPayment ? (
          <>
            <NeonButton variant="ghost" onClick={onClose}>{t("actions.close")}</NeonButton>
            <NeonButton variant="primary" onClick={handlePrintReceipt}>
              <Printer className="h-4 w-4" /> {t("i18n_extra.debts_print_receipt")}
            </NeonButton>
          </>
        ) : (
          <>
            <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
            <NeonButton variant="primary" onClick={save}>{t("actions.save")}</NeonButton>
          </>
        )
      }
    >
      <div className="text-sm mb-4 glass-card p-3 rounded-xl">
        <div className="font-bold">{debt.customerName}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {t("invoices.remaining")}: <b className="text-warning">{formatDZD(debt.remainingAmount)}</b>
        </div>
      </div>

      {savedPayment ? (
        <div className="space-y-3">
          <div className="glass-card rounded-xl p-4 border-success/40 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-success font-bold">
              ✅ {t("i18n_extra.debts_payment_recorded")}
            </div>
            <div className="flex justify-between"><span>{t("i18n_extra.debts_paid_now")}</span><b className="text-success">{formatDZD(savedPayment.amount)}</b></div>
            <div className="flex justify-between"><span>{t("i18n_extra.debts_total_paid")}</span><b>{formatDZD(savedPayment.newPaid)}</b></div>
            <div className="flex justify-between"><span>{t("i18n_extra.debts_remaining")}</span><b className={savedPayment.newRemaining > 0 ? "text-warning" : "text-success"}>{formatDZD(savedPayment.newRemaining)}</b></div>
          </div>
          <p
            className="text-xs text-muted-foreground text-center"
            dangerouslySetInnerHTML={{ __html: t("i18n_extra.debts_print_receipt_hint") }}
          />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <FormField label={t("debts.payment_amount")} required error={errors.amount}>
              <TextInput
                type="number"
                value={amount}
                onChange={(e) => { setAmount(+e.target.value); if (errors.amount) setErrors({}); }}
                max={debt.remainingAmount}
                min={0.01}
                error={!!errors.amount}
              />
            </FormField>
            <FormField label={t("expenses.description")}>
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
          </div>

          {debt.payments.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-bold text-muted-foreground mb-2">{t("customers.history")}</h4>
              <div className="max-h-40 overflow-y-auto rounded-xl bg-card/40 p-2">
                {debt.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                    <span>{formatDate(p.date)}</span>
                    <b className="text-success">{formatDZD(p.amount)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </FormModal>
  );
}
