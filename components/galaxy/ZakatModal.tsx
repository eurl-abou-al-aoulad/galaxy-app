import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { HandCoins, Printer, RotateCcw } from "lucide-react";
import { db, type SectionId } from "@/lib/db";
import { calculateZakat, NISAB_GOLD_GRAMS } from "@/lib/zakat";
import { formatDZD, formatDate, printInvoiceHtml } from "@/lib/printing";
import { FormModal } from "./FormModal";
import { FormField, TextInput } from "./FormField";
import { NeonButton } from "./NeonButton";

interface Props {
  sectionId: SectionId;
  onClose: () => void;
}

export function ZakatModal({ sectionId, onClose }: Props) {
  const { t } = useTranslation();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const products = useLiveQuery(() => db.products.where("section").equals(sectionId).toArray(), [sectionId]);
  const debts = useLiveQuery(() => db.debts.where("section").equals(sectionId).toArray(), [sectionId]);
  const expenses = useLiveQuery(() => db.expenses.where("section").equals(sectionId).toArray(), [sectionId]);

  const [cash, setCash] = useState(0);
  const [bank, setBank] = useState(0);
  const [goldGrams, setGoldGrams] = useState(0);
  const [silverGrams, setSilverGrams] = useState(0);
  const [goldPrice, setGoldPrice] = useState(0);
  const [silverPrice, setSilverPrice] = useState(0);

  // تحميل قيم محفوظة من الإعدادات
  useEffect(() => {
    if (!settings) return;
    setCash(settings.cashOnHand ?? 0);
    setBank(settings.bankBalance ?? 0);
    setGoldGrams(settings.goldGrams ?? 0);
    setSilverGrams(settings.silverGrams ?? 0);
    setGoldPrice(settings.goldGramPrice ?? 0);
    setSilverPrice(settings.silverGramPrice ?? 0);
  }, [settings]);

  // قيم محسوبة من قاعدة البيانات
  const inventorySaleValue = useMemo(
    () => (products ?? []).reduce((s, p) => s + p.sellingPrice * p.quantity, 0),
    [products],
  );
  const receivableDebts = useMemo(
    () => (debts ?? []).filter((d) => d.status === "active").reduce((s, d) => s + d.remainingAmount, 0),
    [debts],
  );
  const pendingExpenses = useMemo(
    () => (expenses ?? []).filter((e) => e.paid === 0).reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  const result = useMemo(
    () =>
      calculateZakat({
        cashOnHand: cash,
        bankBalance: bank,
        goldGrams,
        silverGrams,
        goldGramPrice: goldPrice,
        silverGramPrice: silverPrice,
        inventorySaleValue,
        receivableDebts,
        payableDebts: 0,
        pendingExpenses,
        yearStartDate: settings?.zakatYearStartDate ?? null,
      }),
    [cash, bank, goldGrams, silverGrams, goldPrice, silverPrice, inventorySaleValue, receivableDebts, pendingExpenses, settings],
  );

  const saveSettings = async () => {
    await db.settings.update(1, {
      cashOnHand: cash,
      bankBalance: bank,
      goldGrams,
      silverGrams,
      goldGramPrice: goldPrice,
      silverGramPrice: silverPrice,
    });
    toast.success(t("common.saved"));
  };

  const startNewHawl = async () => {
    await db.settings.update(1, { zakatYearStartDate: Date.now() });
    toast.success(t("zakat.hawl_started"));
  };

  const printCertificate = () => {
    if (!settings) return;
    const html = `
      <h2 style="text-align:center">${t("zakat.certificate_title")}</h2>
      <p style="text-align:center"><b>${settings.companyName}</b></p>
      <hr/>
      <table style="width:100%">
        <tr><td>${t("zakat.cash")}</td><td style="text-align:end">${formatDZD(cash)}</td></tr>
        <tr><td>${t("zakat.bank")}</td><td style="text-align:end">${formatDZD(bank)}</td></tr>
        <tr><td>${t("zakat.gold_value")}</td><td style="text-align:end">${formatDZD(result.goldValue)}</td></tr>
        <tr><td>${t("zakat.silver_value")}</td><td style="text-align:end">${formatDZD(result.silverValue)}</td></tr>
        <tr><td>${t("zakat.inventory")}</td><td style="text-align:end">${formatDZD(inventorySaleValue)}</td></tr>
        <tr><td>${t("zakat.receivables")}</td><td style="text-align:end">${formatDZD(receivableDebts)}</td></tr>
        <tr><td>${t("zakat.pending_expenses")}</td><td style="text-align:end">−${formatDZD(pendingExpenses)}</td></tr>
        <tr style="font-weight:bold;border-top:2px solid #000"><td>${t("zakat.base")}</td><td style="text-align:end">${formatDZD(result.zakatBase)}</td></tr>
        <tr><td>${t("zakat.nisab")}</td><td style="text-align:end">${formatDZD(result.nisabValue)}</td></tr>
        <tr style="font-weight:bold;color:#0a0"><td>${t("zakat.zakat_due")}</td><td style="text-align:end">${formatDZD(result.zakatDue)}</td></tr>
      </table>
      <hr/>
      <p style="text-align:center;font-size:11px">${formatDate(Date.now())}</p>
    `;
    printInvoiceHtml(html, "a4");
  };

  if (!settings) return null;

  return (
    <FormModal
      title={t("zakat.title")}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.close")}</NeonButton>
          <NeonButton variant="accent" onClick={saveSettings}>{t("actions.save")}</NeonButton>
          <NeonButton variant="primary" onClick={printCertificate}>
            <Printer className="h-4 w-4" /> {t("zakat.print_certificate")}
          </NeonButton>
        </>
      }
    >
      <div className="space-y-5">
        {/* مدخلات يدوية */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-accent" /> {t("zakat.manual_inputs")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FormField label={t("zakat.cash")}>
              <TextInput type="number" value={cash} onChange={(e) => setCash(+e.target.value)} />
            </FormField>
            <FormField label={t("zakat.bank")}>
              <TextInput type="number" value={bank} onChange={(e) => setBank(+e.target.value)} />
            </FormField>
            <FormField label={t("zakat.gold_grams")}>
              <TextInput type="number" value={goldGrams} onChange={(e) => setGoldGrams(+e.target.value)} />
            </FormField>
            <FormField label={t("zakat.silver_grams")}>
              <TextInput type="number" value={silverGrams} onChange={(e) => setSilverGrams(+e.target.value)} />
            </FormField>
            <FormField label={t("zakat.gold_price")}>
              <TextInput type="number" value={goldPrice} onChange={(e) => setGoldPrice(+e.target.value)} />
            </FormField>
            <FormField label={t("zakat.silver_price")}>
              <TextInput type="number" value={silverPrice} onChange={(e) => setSilverPrice(+e.target.value)} />
            </FormField>
          </div>
        </div>

        {/* قيم تلقائية */}
        <div className="glass-card rounded-xl p-4 space-y-1.5 text-sm">
          <h3 className="text-sm font-bold mb-2">{t("zakat.auto_calculated")}</h3>
          <Row label={t("zakat.inventory")} value={formatDZD(inventorySaleValue)} />
          <Row label={t("zakat.receivables")} value={formatDZD(receivableDebts)} />
          <Row label={t("zakat.pending_expenses")} value={`− ${formatDZD(pendingExpenses)}`} negative />
        </div>

        {/* النتيجة */}
        <div className={`glass-card rounded-xl p-4 border-2 ${result.isObligatory ? "border-success/60" : "border-warning/40"}`}>
          <h3 className="text-sm font-bold mb-3">{t("zakat.result")}</h3>
          <div className="space-y-1.5 text-sm">
            <Row label={t("zakat.total_assets")} value={formatDZD(result.totalAssets)} />
            <Row label={t("zakat.total_liabilities")} value={`− ${formatDZD(result.totalLiabilities)}`} negative />
            <Row label={t("zakat.base")} value={formatDZD(result.zakatBase)} bold />
            <Row label={`${t("zakat.nisab")} (${NISAB_GOLD_GRAMS}g)`} value={formatDZD(result.nisabValue)} />
            <Row
              label={t("zakat.reaches_nisab")}
              value={result.reachesNisab ? "✓" : "✗"}
              positive={result.reachesNisab}
              negative={!result.reachesNisab}
            />
            <Row
              label={t("zakat.hawl_completed")}
              value={result.hawlCompleted ? "✓" : `${result.daysUntilHawl} ${t("zakat.days_left")}`}
              positive={result.hawlCompleted}
            />
            {result.hawlEndDate && (
              <Row label={t("zakat.hawl_end")} value={formatDate(result.hawlEndDate)} />
            )}
            <div className="border-t border-border pt-2 mt-2">
              <Row
                label={t("zakat.zakat_due")}
                value={formatDZD(result.zakatDue)}
                bold
                positive={result.isObligatory}
              />
            </div>
          </div>

          <div className="mt-4">
            <NeonButton variant="ghost" onClick={startNewHawl}>
              <RotateCcw className="h-4 w-4" /> {t("zakat.start_new_hawl")}
            </NeonButton>
          </div>
        </div>
      </div>
    </FormModal>
  );
}

function Row({
  label,
  value,
  bold,
  positive,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  const cls = positive ? "text-success" : negative ? "text-warning" : "";
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-bold text-base" : "font-semibold"} ${cls}`}>{value}</span>
    </div>
  );
}
