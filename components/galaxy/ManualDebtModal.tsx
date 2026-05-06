import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, type SectionId } from "@/lib/db";
import { FormModal } from "./FormModal";
import { FormField, TextInput } from "./FormField";
import { NeonButton } from "./NeonButton";
import { CustomerAutocomplete } from "./CustomerAutocomplete";

interface Props {
  sectionId: SectionId;
  onClose: () => void;
}

/**
 * نافذة لإدراج دين خارج نطاق السلعة/الفاتورة.
 * - invoiceId = 0 يدل على دين يدوي.
 * - يربط/ينشئ سجل الزبون تلقائياً ويحدّث totalDebt.
 */
export function ManualDebtModal({ sectionId, onClose }: Props) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const e: Record<string, string> = {};
    if (!customerName.trim()) e.name = t("validation.required");
    if (totalAmount <= 0) e.amount = t("validation.must_be_positive");
    if (paidAmount < 0) e.paid = t("validation.must_be_positive");
    if (paidAmount > totalAmount) e.paid = t("validation.amount_exceeds");
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t("validation.fields_missing_one"));
      return;
    }

    const now = Date.now();
    const remaining = totalAmount - paidAmount;

    // ربط/إنشاء الزبون
    let resolvedId = customerId;
    if (!resolvedId) {
      const existing = await db.customers
        .where("[section+name]")
        .equals([sectionId, customerName.trim()])
        .first();
      if (existing) {
        resolvedId = existing.id!;
      } else {
        resolvedId = (await db.customers.add({
          section: sectionId,
          name: customerName.trim(),
          phone: customerPhone,
          address: "",
          totalPurchases: 0,
          totalDebt: 0,
          totalReturns: 0,
          notes: reason ? `[Manual debt] ${reason}` : "",
          createdAt: now,
        })) as number;
      }
    }

    // تحديث totalDebt للزبون
    if (resolvedId) {
      const cust = await db.customers.get(resolvedId);
      if (cust) {
        await db.customers.update(resolvedId, {
          totalDebt: (cust.totalDebt || 0) + remaining,
        });
      }
    }

    await db.debts.add({
      section: sectionId,
      invoiceId: 0,
      customerId: resolvedId,
      customerName: customerName.trim(),
      customerPhone,
      totalAmount,
      paidAmount,
      remainingAmount: remaining,
      payments: paidAmount > 0 ? [{ date: now, amount: paidAmount, note: reason }] : [],
      status: remaining <= 0 ? "paid" : "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.auditLog.add({
      section: sectionId,
      action: "manual_debt_added",
      module: "debts",
      user: "admin",
      details: `Manual debt for ${customerName}: ${totalAmount}`,
      createdAt: now,
    });

    toast.success(t("debts.manual_debt_saved"));
    onClose();
  };

  return (
    <FormModal
      title={t("debts.manual_debt_title")}
      onClose={onClose}
      size="md"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="primary" onClick={save}>{t("actions.save")}</NeonButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label={t("customers.name")} required error={errors.name}>
          <CustomerAutocomplete
            sectionId={sectionId}
            selectedCustomerId={customerId}
            customerName={customerName}
            onChangeName={(n) => { setCustomerName(n); if (errors.name) setErrors({ ...errors, name: "" }); }}
            onSelectCustomer={(c) => {
              setCustomerId(c.id!);
              setCustomerName(c.name);
              setCustomerPhone(c.phone || "");
            }}
            onUnlink={() => { setCustomerId(null); setCustomerName(""); setCustomerPhone(""); }}
            error={errors.name}
          />
        </FormField>

        <FormField label={t("customers.phone")}>
          <TextInput value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("debts.manual_debt_amount")} required error={errors.amount}>
            <TextInput
              type="number"
              value={totalAmount}
              onChange={(e) => { setTotalAmount(+e.target.value); if (errors.amount) setErrors({ ...errors, amount: "" }); }}
              min={0}
              error={!!errors.amount}
            />
          </FormField>
          <FormField label={t("debts.manual_debt_paid")} error={errors.paid}>
            <TextInput
              type="number"
              value={paidAmount}
              onChange={(e) => { setPaidAmount(+e.target.value); if (errors.paid) setErrors({ ...errors, paid: "" }); }}
              min={0}
              error={!!errors.paid}
            />
          </FormField>
        </div>

        <FormField label={t("debts.manual_debt_reason")}>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </FormModal>
  );
}
