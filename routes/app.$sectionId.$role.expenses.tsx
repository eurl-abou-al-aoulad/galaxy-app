import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Wallet, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, type ExpenseCategory } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { formatDZD, formatDate } from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/expenses")({
  component: ExpensesPage,
});

const CATEGORIES: ExpenseCategory[] = ["suppliers", "rent", "utilities", "equipment", "workers", "taxes", "repairs", "other"];

function ExpensesPage() {
  const { t } = useTranslation();
  const { sectionId } = useSection();
  const expenses = useLiveQuery(() => db.expenses.where("section").equals(sectionId).reverse().sortBy("date"), [sectionId]);

  const [category, setCategory] = useState<ExpenseCategory>("suppliers");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [paid, setPaid] = useState<0 | 1>(1);

  if (!expenses) return null;

  const totalPaid = expenses.filter((e) => e.paid === 1).reduce((s, e) => s + e.amount, 0);
  const totalDue = expenses.filter((e) => e.paid === 0).reduce((s, e) => s + e.amount, 0);

  const save = async () => {
    if (!description.trim()) { toast.error(t("expenses.description") + ": " + t("validation.required")); return; }
    if (amount <= 0) { toast.error(t("expenses.amount") + ": " + t("validation.must_be_positive")); return; }
    await db.expenses.add({ section: sectionId, category, description, amount, paid, date: Date.now(), notes: "" });
    setDescription(""); setAmount(0);
    toast.success(t("common.saved"));
  };

  const remove = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete", { defaultValue: "حذف" }),
        onClick: async () => {
          await db.expenses.delete(id);
          toast.success(t("common.deleted"));
        },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
        <Wallet className="h-7 w-7 text-primary" /> {t("expenses.title")}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5 border-success/40 bg-gradient-to-br from-success/15 to-transparent">
          <div className="text-xs text-muted-foreground uppercase">{t("expenses.total_paid")}</div>
          <div className="text-3xl font-black text-success">{formatDZD(totalPaid)}</div>
        </div>
        <div className="glass-card rounded-2xl p-5 border-destructive/40 bg-gradient-to-br from-destructive/15 to-transparent">
          <div className="text-xs text-muted-foreground uppercase">{t("expenses.total_due")}</div>
          <div className="text-3xl font-black text-destructive">{formatDZD(totalDue)}</div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-3">{t("expenses.add_expense")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="h-11 px-3 rounded-xl bg-input border border-border focus:border-primary outline-none">
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.${c}`)}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("expenses.description")} className="md:col-span-2 h-11 px-3 rounded-xl bg-input border border-border focus:border-primary outline-none" />
          <input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} placeholder={t("expenses.amount")} className="h-11 px-3 rounded-xl bg-input border border-border focus:border-primary outline-none" />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={paid === 1} onChange={() => setPaid(1)} className="accent-success" />
            <span className="text-success font-semibold">💵 {t("expenses.paid_cash")}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={paid === 0} onChange={() => setPaid(0)} className="accent-destructive" />
            <span className="text-destructive font-semibold">📋 {t("expenses.due_debt")}</span>
          </label>
          <NeonButton variant="primary" className="ms-auto" onClick={save}><Plus className="h-5 w-5" /> {t("actions.add")}</NeonButton>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-start">{t("expenses.date")}</th>
                <th className="px-3 py-3 text-start">{t("expenses.category")}</th>
                <th className="px-3 py-3 text-start">{t("expenses.description")}</th>
                <th className="px-3 py-3 text-end">{t("expenses.amount")}</th>
                <th className="px-3 py-3 text-center">{t("invoices.status")}</th>
                <th className="px-3 py-3 text-center">{t("actions.delete")}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : expenses.map((e) => (
                <tr key={e.id} className="border-t border-border/40">
                  <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(e.date)}</td>
                  <td className="px-3 py-3 text-accent">{t(`expenses.${e.category}`)}</td>
                  <td className="px-3 py-3 font-semibold">{e.description}</td>
                  <td className="px-3 py-3 text-end font-bold">{formatDZD(e.amount)}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${e.paid === 1 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                      {e.paid === 1 ? t("expenses.paid_cash") : t("expenses.due_debt")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => remove(e.id!)} className="text-destructive p-1.5 hover:bg-destructive/20 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
