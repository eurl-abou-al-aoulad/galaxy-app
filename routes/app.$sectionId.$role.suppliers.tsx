import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Truck, Plus, Search, Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, type SupplierRecord } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, FieldGrid, TextInput, TextArea } from "@/components/galaxy/FormField";

export const Route = createFileRoute("/app/$sectionId/$role/suppliers")({
  component: SuppliersPage,
});

function SuppliersPage() {
  const { t } = useTranslation();
  const { sectionId } = useSection();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const suppliers = useLiveQuery(() => db.suppliers.where("section").equals(sectionId).reverse().sortBy("createdAt"), [sectionId]);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.category.toLowerCase().includes(q));
  }, [suppliers, search]);

  const handleDelete = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete", { defaultValue: "حذف" }),
        onClick: async () => {
          await db.suppliers.delete(id);
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
          <Truck className="h-7 w-7 text-primary" /> {t("suppliers.title")}
        </h1>
        <NeonButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-5 w-5" /> {t("suppliers.add")}</NeonButton>
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
                <th className="px-3 py-3 text-start">{t("suppliers.name")}</th>
                <th className="px-3 py-3 text-start">{t("suppliers.phone")}</th>
                <th className="px-3 py-3 text-start hidden md:table-cell">{t("suppliers.category")}</th>
                <th className="px-3 py-3 text-start hidden lg:table-cell">{t("suppliers.address")}</th>
                <th className="px-3 py-3 text-center">{t("actions.edit")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="px-3 py-3 font-semibold">{s.name}<div className="text-xs text-muted-foreground">{s.email}</div></td>
                  <td className="px-3 py-3 font-mono">{s.phone}</td>
                  <td className="px-3 py-3 hidden md:table-cell text-accent">{s.category}</td>
                  <td className="px-3 py-3 hidden lg:table-cell text-xs text-muted-foreground">{s.address}</td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => { setEditing(s); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-primary/20 text-primary"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(s.id!)} className="p-1.5 rounded-lg hover:bg-destructive/20 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <SupplierForm sectionId={sectionId} supplier={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function SupplierForm({ sectionId, supplier, onClose }: { sectionId: ReturnType<typeof useSection>["sectionId"]; supplier: SupplierRecord | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: supplier?.name ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "",
    address: supplier?.address ?? "", category: supplier?.category ?? "", notes: supplier?.notes ?? "",
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
    if (supplier) await db.suppliers.update(supplier.id!, form);
    else await db.suppliers.add({ ...form, section: sectionId, createdAt: Date.now() });
    toast.success(t("common.saved")); onClose();
  };

  const update = (k: keyof typeof form, v: string) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: "" });
  };

  return (
    <FormModal
      title={supplier ? t("actions.edit") : t("suppliers.add")}
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
          <FormField label={t("suppliers.name")} required error={errors.name}>
            <TextInput value={form.name} onChange={(e) => update("name", e.target.value)} error={!!errors.name} />
          </FormField>
          <FormField label={t("suppliers.phone")}>
            <TextInput type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </FormField>
          <FormField label={t("settings.email")}>
            <TextInput type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </FormField>
          <FormField label={t("suppliers.category")}>
            <TextInput value={form.category} onChange={(e) => update("category", e.target.value)} />
          </FormField>
          <FormField label={t("suppliers.address")} className="md:col-span-2">
            <TextInput value={form.address} onChange={(e) => update("address", e.target.value)} />
          </FormField>
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
