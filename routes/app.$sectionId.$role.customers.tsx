import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Users, Plus, Search, Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, type CustomerRecord } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, FieldGrid, TextInput, TextArea } from "@/components/galaxy/FormField";
import { formatDZD } from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { t } = useTranslation();
  const { sectionId } = useSection();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  const customers = useLiveQuery(() => db.customers.where("section").equals(sectionId).reverse().sortBy("createdAt"), [sectionId]);
  const allInvoices = useLiveQuery(() => db.invoices.where("section").equals(sectionId).toArray(), [sectionId]);
  const allDebts = useLiveQuery(() => db.debts.where("section").equals(sectionId).toArray(), [sectionId]);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, search]);

  const stats = (c: CustomerRecord) => {
    const debts = (allDebts ?? []).filter((d) => d.customerName === c.name && d.status === "active").reduce((s, d) => s + d.remainingAmount, 0);
    const purchases = (allInvoices ?? []).filter((i) => i.customerName === c.name).reduce((s, i) => s + i.total, 0);
    return { debts, purchases };
  };

  const handleDelete = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete", { defaultValue: "حذف" }),
        onClick: async () => {
          await db.customers.delete(id);
          toast.success(t("common.deleted"));
        },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" /> {t("customers.title")}
        </h1>
        <NeonButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-5 w-5" /> {t("actions.add")}
        </NeonButton>
      </div>

      <div className="glass-card rounded-2xl p-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("inventory.search_placeholder")} className="w-full h-12 ps-10 rounded-xl bg-input border border-border focus:border-primary outline-none" />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-start">{t("customers.name")}</th>
                <th className="px-3 py-3 text-start">{t("customers.phone")}</th>
                <th className="px-3 py-3 text-start hidden md:table-cell">{t("customers.address")}</th>
                <th className="px-3 py-3 text-end">{t("customers.total_purchases")}</th>
                <th className="px-3 py-3 text-end">{t("debts.total_debts")}</th>
                <th className="px-3 py-3 text-center">{t("actions.edit")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : filtered.map((c) => {
                const { debts, purchases } = stats(c);
                return (
                  <tr key={c.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-3 font-semibold">{c.name}</td>
                    <td className="px-3 py-3">{c.phone}</td>
                    <td className="px-3 py-3 hidden md:table-cell text-muted-foreground text-xs">{c.address}</td>
                    <td className="px-3 py-3 text-end text-success">{formatDZD(purchases)}</td>
                    <td className="px-3 py-3 text-end text-warning">{formatDZD(debts)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-primary/20 text-primary"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(c.id!)} className="p-1.5 rounded-lg hover:bg-destructive/20 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <CustomerForm sectionId={sectionId} customer={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function CustomerForm({ sectionId, customer, onClose }: { sectionId: ReturnType<typeof useSection>["sectionId"]; customer: CustomerRecord | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    rc: customer?.rc ?? "",
    nif: customer?.nif ?? "",
    nic: customer?.nic ?? "",
    ai: customer?.ai ?? "",
    notes: customer?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t("validation.required");
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t("validation.fields_missing_one"));
      return;
    }
    if (customer) {
      await db.customers.update(customer.id!, form);
    } else {
      await db.customers.add({ ...form, section: sectionId, totalPurchases: 0, totalDebt: 0, totalReturns: 0, createdAt: Date.now() });
    }
    toast.success(t("common.saved"));
    onClose();
  };

  const update = (k: keyof typeof form, v: string) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: "" });
  };

  return (
    <FormModal
      title={customer ? t("actions.edit") : t("actions.add")}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="primary" onClick={save}>{t("actions.save")}</NeonButton>
        </>
      }
    >
      <FormSection title={t("form_sections.basic_info")}>
        <FieldGrid cols={2}>
          <FormField label={t("customers.name")} required error={errors.name}>
            <TextInput value={form.name} onChange={(e) => update("name", e.target.value)} error={!!errors.name} />
          </FormField>
          <FormField label={t("customers.phone")}>
            <TextInput type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </FormField>
          <FormField label={t("customers.address")} className="md:col-span-2">
            <TextInput value={form.address} onChange={(e) => update("address", e.target.value)} />
          </FormField>
        </FieldGrid>
      </FormSection>

      <FormSection title={t("form_sections.tax_info")}>
        <FieldGrid cols={2}>
          {(["rc", "nif", "nic", "ai"] as const).map((k) => (
            <FormField key={k} label={t(`customers.${k}`, { defaultValue: k.toUpperCase() })}>
              <TextInput value={form[k]} onChange={(e) => update(k, e.target.value)} />
            </FormField>
          ))}
        </FieldGrid>
      </FormSection>

      <FormSection title={t("form_sections.additional_notes")}>
        <FormField label={t("expenses.description")}>
          <TextArea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </FormField>
      </FormSection>
    </FormModal>
  );
}
