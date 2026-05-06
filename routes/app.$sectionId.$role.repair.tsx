import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Wrench, Plus, Printer, Edit2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, nextRepairTicket, type RepairStatus, type RepairDeviceRecord } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, FieldGrid, TextInput, TextArea } from "@/components/galaxy/FormField";
import { formatDZD, formatDate, printInvoiceHtml } from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/repair")({
  component: RepairPage,
});

const STATUS_COLORS: Record<RepairStatus, string> = {
  waiting: "bg-destructive/20 text-destructive border-destructive/40",
  working: "bg-warning/20 text-warning border-warning/40",
  parts: "bg-accent/20 text-accent border-accent/40",
  ready: "bg-success/20 text-success border-success/40",
  delivered: "bg-muted text-muted-foreground border-border",
};

function RepairPage() {
  const { t } = useTranslation();
  const { sectionId } = useSection();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const devices = useLiveQuery(() => db.repairDevices.where("section").equals(sectionId).reverse().sortBy("receivedAt"), [sectionId]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RepairDeviceRecord | null>(null);

  const printReceipt = (d: RepairDeviceRecord) => {
    if (!settings) return;
    const html = `
      <div class="center bold" style="font-size:14px">${settings.companyName}</div>
      ${settings.companyPhone ? `<div class="center">${settings.companyPhone}</div>` : ""}
      <hr/>
      <div class="center bold">${t("i18n_extra.repair_receipt_title")}</div>
      <hr/>
      <div>N°: <b>${d.ticketNumber}</b></div>
      <div>${t("i18n_extra.repair_receipt_date")}: ${formatDate(d.receivedAt)}</div>
      <hr/>
      <div>${t("i18n_extra.repair_receipt_customer")}: <b>${d.customerName}</b></div>
      <div>${t("i18n_extra.repair_receipt_phone")}: ${d.customerPhone}</div>
      <hr/>
      <div>${t("i18n_extra.repair_receipt_device")}: <b>${d.deviceType} ${d.brand} ${d.model}</b></div>
      <div>IMEI: ${d.imei}</div>
      <hr/>
      <div>${t("i18n_extra.repair_receipt_issue")}:</div>
      <div>${d.problemDescription}</div>
      <hr/>
      <div class="right">${t("i18n_extra.repair_receipt_estimated_cost")}: <b>${formatDZD(d.estimatedCost)}</b></div>
      <hr/>
      <div class="center" style="font-size:9px">${t("i18n_extra.repair_receipt_keep_warning")}</div>
    `;
    printInvoiceHtml(html, "thermal");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <Wrench className="h-7 w-7 text-primary" /> {t("repair.title")}
        </h1>
        <NeonButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-5 w-5" /> {t("repair.new_device")}</NeonButton>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-start">{t("repair.ticket_number")}</th>
                <th className="px-3 py-3 text-start">{t("customers.name")}</th>
                <th className="px-3 py-3 text-start">{t("repair.device_type")}</th>
                <th className="px-3 py-3 text-start hidden lg:table-cell">IMEI</th>
                <th className="px-3 py-3 text-end">{t("repair.estimated_cost")}</th>
                <th className="px-3 py-3 text-center">{t("repair.status")}</th>
                <th className="px-3 py-3 text-center">{t("actions.print")}</th>
              </tr>
            </thead>
            <tbody>
              {!devices || devices.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : devices.map((d) => (
                <tr key={d.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="px-3 py-3 font-mono text-xs">{d.ticketNumber}</td>
                  <td className="px-3 py-3 font-semibold">{d.customerName}<div className="text-xs text-muted-foreground">{d.customerPhone}</div></td>
                  <td className="px-3 py-3">{d.deviceType} {d.brand} {d.model}</td>
                  <td className="px-3 py-3 hidden lg:table-cell text-xs font-mono">{d.imei}</td>
                  <td className="px-3 py-3 text-end font-bold">{formatDZD(d.finalCost || d.estimatedCost)}</td>
                  <td className="px-3 py-3 text-center">
                    <select value={d.status} onChange={async (e) => { await db.repairDevices.update(d.id!, { status: e.target.value as RepairStatus }); toast.success(t("common.saved")); }} className={`text-xs px-2 py-1 rounded-full border font-semibold ${STATUS_COLORS[d.status]}`}>
                      {(["waiting", "working", "parts", "ready", "delivered"] as RepairStatus[]).map((s) => <option key={s} value={s}>{t(`repair.${s}`)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => printReceipt(d)} className="p-1.5 rounded-lg hover:bg-primary/20 text-primary"><Printer className="h-4 w-4" /></button>
                    <button onClick={() => { setEditing(d); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-accent/20 text-accent"><Edit2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <RepairForm sectionId={sectionId} device={editing} onClose={() => { setShowForm(false); setEditing(null); }} onPrint={printReceipt} />}
    </div>
  );
}

function RepairForm({ sectionId, device, onClose, onPrint }: { sectionId: ReturnType<typeof useSection>["sectionId"]; device: RepairDeviceRecord | null; onClose: () => void; onPrint: (d: RepairDeviceRecord) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    customerName: device?.customerName ?? "", customerPhone: device?.customerPhone ?? "",
    deviceType: device?.deviceType ?? t("i18n_extra.repair_default_device_phone"), brand: device?.brand ?? "", model: device?.model ?? "",
    imei: device?.imei ?? "", secretCode: device?.secretCode ?? "",
    problemDescription: device?.problemDescription ?? "", diagnosisNotes: device?.diagnosisNotes ?? "",
    estimatedCost: device?.estimatedCost ?? 0, finalCost: device?.finalCost ?? 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (alsoPrint: boolean) => {
    const e: Record<string, string> = {};
    if (!form.customerName.trim()) e.customerName = t("validation.required");
    if (!form.deviceType.trim()) e.deviceType = t("validation.required");
    if (!form.problemDescription.trim()) e.problemDescription = t("validation.required");
    setErrors(e);
    const errCount = Object.keys(e).length;
    if (errCount > 0) {
      toast.error(errCount === 1 ? t("validation.fields_missing_one") : t("validation.fields_missing_other", { count: errCount }));
      return;
    }
    if (device) {
      await db.repairDevices.update(device.id!, form);
      toast.success(t("common.saved"));
      if (alsoPrint) onPrint({ ...device, ...form });
    } else {
      const tk = await nextRepairTicket(sectionId);
      const now = Date.now();
      const newDev: RepairDeviceRecord = {
        ...form, ticketNumber: tk, section: sectionId,
        customerId: null, status: "waiting", receivedAt: now,
        completedAt: null, deliveredAt: null, invoiceId: null,
      };
      const id = await db.repairDevices.add(newDev);
      toast.success(t("common.saved"));
      if (alsoPrint) onPrint({ ...newDev, id });
    }
    onClose();
  };

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm({ ...form, [k]: v });
    if (errors[k as string]) setErrors({ ...errors, [k as string]: "" });
  };

  return (
    <FormModal
      title={device ? t("actions.edit") : t("repair.new_device")}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="accent" onClick={() => save(false)}>{t("actions.save")}</NeonButton>
          <NeonButton variant="primary" onClick={() => save(true)}>
            <Printer className="h-4 w-4" /> {t("repair.print_receipt")}
          </NeonButton>
        </>
      }
    >
      <FormSection title={t("form_sections.basic_info")}>
        <FieldGrid cols={2}>
          <FormField label={t("customers.name")} required error={errors.customerName}>
            <TextInput value={form.customerName} onChange={(e) => update("customerName", e.target.value)} error={!!errors.customerName} />
          </FormField>
          <FormField label={t("customers.phone")}>
            <TextInput type="tel" value={form.customerPhone} onChange={(e) => update("customerPhone", e.target.value)} />
          </FormField>
        </FieldGrid>
      </FormSection>

      <FormSection title={t("form_sections.device_info")}>
        <FieldGrid cols={2}>
          <FormField label={t("repair.device_type")} required error={errors.deviceType}>
            <TextInput value={form.deviceType} onChange={(e) => update("deviceType", e.target.value)} error={!!errors.deviceType} />
          </FormField>
          <FormField label={t("repair.brand")}>
            <TextInput value={form.brand} onChange={(e) => update("brand", e.target.value)} />
          </FormField>
          <FormField label={t("repair.model")}>
            <TextInput value={form.model} onChange={(e) => update("model", e.target.value)} />
          </FormField>
          <FormField label={t("repair.imei")}>
            <TextInput value={form.imei} onChange={(e) => update("imei", e.target.value)} className="font-mono" />
          </FormField>
          <FormField label={t("i18n_extra.repair_secret_label")} hint={t("i18n_extra.repair_secret_hint")}>
            <TextInput value={form.secretCode} onChange={(e) => update("secretCode", e.target.value)} className="font-mono" />
          </FormField>
          <FormField label={t("repair.estimated_cost")}>
            <TextInput type="number" min={0} value={form.estimatedCost} onChange={(e) => update("estimatedCost", +e.target.value)} />
          </FormField>
          {device && (
            <FormField label={t("repair.final_cost")} className="md:col-span-2">
              <TextInput type="number" min={0} value={form.finalCost} onChange={(e) => update("finalCost", +e.target.value)} />
            </FormField>
          )}
        </FieldGrid>
      </FormSection>

      <FormSection title={t("form_sections.additional_notes")}>
        <FormField label={t("repair.problem")} required error={errors.problemDescription}>
          <TextArea value={form.problemDescription} onChange={(e) => update("problemDescription", e.target.value)} error={!!errors.problemDescription} />
        </FormField>
        <div className="mt-3">
          <FormField label={t("repair.diagnosis")}>
            <TextArea value={form.diagnosisNotes} onChange={(e) => update("diagnosisNotes", e.target.value)} />
          </FormField>
        </div>
      </FormSection>
    </FormModal>
  );
}
// Helper functions removed — now using FormField from shared components
