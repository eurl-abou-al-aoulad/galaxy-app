import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { PauseCircle, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { formatDZD, formatDate } from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/suspended")({
  component: SuspendedPage,
});

function SuspendedPage() {
  const { t } = useTranslation();
  const { sectionId, role } = useSection();
  const navigate = useNavigate();
  const list = useLiveQuery(() => db.invoices.where("[section+status]").equals([sectionId, "suspended"]).reverse().sortBy("createdAt"), [sectionId]);

  const resume = async (id: number) => {
    // mark as paid (default complete) — user can edit through new invoice flow later
    const inv = await db.invoices.get(id);
    if (!inv) return;
    await db.invoices.update(id, { status: "paid", paid: inv.total, remaining: 0, updatedAt: Date.now() });
    toast.success(t("common.saved"));
    navigate({ to: "/app/$sectionId/$role/invoices", params: { sectionId, role } });
  };

  const remove = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete", { defaultValue: "حذف" }),
        onClick: async () => {
          await db.invoices.delete(id);
          toast.success(t("common.deleted"));
        },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
        <PauseCircle className="h-7 w-7 text-primary" /> {t("suspended.title")}
      </h1>

      <div className="glass-card rounded-2xl overflow-hidden">
        {!list || list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{t("suspended.no_suspended")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-3 text-start">{t("invoices.invoice_number")}</th>
                  <th className="px-3 py-3 text-start">{t("invoices.customer")}</th>
                  <th className="px-3 py-3 text-end">{t("invoices.total")}</th>
                  <th className="px-3 py-3 text-center">{t("expenses.date")}</th>
                  <th className="px-3 py-3 text-center">{t("suspended.resume")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="px-3 py-3">{inv.customerName || "—"}</td>
                    <td className="px-3 py-3 text-end font-bold">{formatDZD(inv.total)}</td>
                    <td className="px-3 py-3 text-center text-xs text-muted-foreground">{formatDate(inv.createdAt)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => resume(inv.id!)} className="px-3 py-1 rounded-lg bg-success/20 text-success border border-success/40 text-xs font-semibold hover:bg-success/30 inline-flex items-center gap-1">
                        <Play className="h-3 w-3" /> {t("suspended.resume")}
                      </button>
                      <button onClick={() => remove(inv.id!)} className="ms-2 p-1 rounded text-destructive hover:bg-destructive/20"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
