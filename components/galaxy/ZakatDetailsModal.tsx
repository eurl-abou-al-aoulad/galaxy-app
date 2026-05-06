import { useMemo, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import {
  HandCoins,
  Calculator,
  PieChart as PieIcon,
  CalendarClock,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { db, type SectionId } from "@/lib/db";
import { calculateZakat, NISAB_GOLD_GRAMS, ZAKAT_RATE, HIJRI_YEAR_DAYS } from "@/lib/zakat";
import { formatDZD, formatDate } from "@/lib/printing";
import { FormModal } from "./FormModal";
import { NeonButton } from "./NeonButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const ZakatModal = lazy(() => import("./ZakatModal").then((m) => ({ default: m.ZakatModal })));

interface Props {
  sectionId: SectionId;
  onClose: () => void;
}

const PIE_COLORS = [
  "oklch(0.72 0.18 295)",
  "oklch(0.78 0.16 200)",
  "oklch(0.80 0.18 80)",
  "oklch(0.70 0.18 150)",
  "oklch(0.72 0.18 25)",
  "oklch(0.65 0.15 320)",
];

export function ZakatDetailsModal({ sectionId, onClose }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("summary");
  const [openCalc, setOpenCalc] = useState(false);

  const settings = useLiveQuery(() => db.settings.get(1), []);
  const products = useLiveQuery(() => db.products.where("section").equals(sectionId).toArray(), [sectionId]);
  const debts = useLiveQuery(() => db.debts.where("section").equals(sectionId).toArray(), [sectionId]);
  const expenses = useLiveQuery(() => db.expenses.where("section").equals(sectionId).toArray(), [sectionId]);

  const data = useMemo(() => {
    if (!settings || !products || !debts || !expenses) return null;
    const inventorySaleValue = products.reduce((s, p) => s + p.sellingPrice * p.quantity, 0);
    const receivableDebts = debts
      .filter((d) => d.status === "active")
      .reduce((s, d) => s + d.remainingAmount, 0);
    const pendingExpenses = expenses.filter((e) => e.paid === 0).reduce((s, e) => s + e.amount, 0);

    const result = calculateZakat({
      cashOnHand: settings.cashOnHand ?? 0,
      bankBalance: settings.bankBalance ?? 0,
      goldGrams: settings.goldGrams ?? 0,
      silverGrams: settings.silverGrams ?? 0,
      goldGramPrice: settings.goldGramPrice ?? 0,
      silverGramPrice: settings.silverGramPrice ?? 0,
      inventorySaleValue,
      receivableDebts,
      payableDebts: 0,
      pendingExpenses,
      yearStartDate: settings.zakatYearStartDate ?? null,
    });

    const pieData = [
      { name: t("zakat.cash"), value: settings.cashOnHand ?? 0 },
      { name: t("zakat.bank"), value: settings.bankBalance ?? 0 },
      { name: t("zakat.gold_value"), value: result.goldValue },
      { name: t("zakat.silver_value"), value: result.silverValue },
      { name: t("zakat.inventory"), value: inventorySaleValue },
      { name: t("zakat.receivables"), value: receivableDebts },
    ].filter((d) => d.value > 0);

    const nisabPct = result.nisabValue > 0
      ? Math.min(100, (result.zakatBase / result.nisabValue) * 100)
      : 0;
    const hawlPct = settings.zakatYearStartDate
      ? Math.min(100, ((HIJRI_YEAR_DAYS - result.daysUntilHawl) / HIJRI_YEAR_DAYS) * 100)
      : 0;

    return { result, pieData, nisabPct, hawlPct, inventorySaleValue, receivableDebts, pendingExpenses };
  }, [settings, products, debts, expenses, t]);

  if (!data || !settings) {
    return (
      <FormModal title={t("zakat.details_title")} onClose={onClose} size="lg" footer={<NeonButton variant="ghost" onClick={onClose}>{t("actions.close")}</NeonButton>}>
        <div className="h-64 animate-pulse bg-muted/30 rounded-xl" />
      </FormModal>
    );
  }

  const { result, pieData, nisabPct, hawlPct } = data;

  return (
    <>
      <FormModal
        title={t("zakat.details_title")}
        onClose={onClose}
        size="lg"
        footer={
          <>
            <NeonButton variant="ghost" onClick={onClose}>{t("actions.close")}</NeonButton>
            <NeonButton variant="primary" onClick={() => setOpenCalc(true)}>
              <Calculator className="h-4 w-4" /> {t("zakat.open_calculator_btn")}
            </NeonButton>
          </>
        }
      >
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full mb-4">
            <TabsTrigger value="summary" className="text-xs gap-1">
              <HandCoins className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("zakat.tab_summary")}</span>
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="text-xs gap-1">
              <PieIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("zakat.tab_breakdown")}</span>
            </TabsTrigger>
            <TabsTrigger value="hawl" className="text-xs gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("zakat.tab_hawl")}</span>
            </TabsTrigger>
            <TabsTrigger value="guide" className="text-xs gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("zakat.tab_guide")}</span>
            </TabsTrigger>
          </TabsList>

          {/* === SUMMARY === */}
          <TabsContent value="summary" className="space-y-4 mt-0">
            <p className="text-xs text-muted-foreground leading-relaxed">{t("zakat.summary_intro")}</p>

            <div className={`glass-card rounded-2xl p-5 border-2 ${result.isObligatory ? "border-success/60" : "border-warning/40"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("zakat.zakat_due")}
                </span>
                {result.isObligatory ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                )}
              </div>
              <div className="text-3xl md:text-4xl font-black text-gradient-galaxy" style={{ direction: "ltr" }}>
                {formatDZD(result.zakatDue)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                {t("zakat.rate")} • {t("zakat.base")}: {formatDZD(result.zakatBase)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label={t("zakat.total_assets")} value={formatDZD(result.totalAssets)} />
              <MiniStat label={t("zakat.total_liabilities")} value={`− ${formatDZD(result.totalLiabilities)}`} negative />
              <MiniStat label={t("zakat.nisab")} value={formatDZD(result.nisabValue)} />
              <MiniStat
                label={t("zakat.reaches_nisab")}
                value={result.reachesNisab ? "✓" : "✗"}
                positive={result.reachesNisab}
                negative={!result.reachesNisab}
              />
            </div>
          </TabsContent>

          {/* === BREAKDOWN === */}
          <TabsContent value="breakdown" className="space-y-4 mt-0">
            <h4 className="text-sm font-bold text-center">{t("zakat.chart_legend")}</h4>
            {pieData.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">—</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      contentStyle={{
                        background: "oklch(0.18 0.05 280)",
                        border: "1px solid oklch(0.65 0.25 295 / 0.4)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v) => formatDZD(Number(v) || 0)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="glass-card rounded-xl p-3 space-y-1.5 text-xs">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name}
                  </span>
                  <span className="font-semibold">{formatDZD(d.value)}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* === HAWL === */}
          <TabsContent value="hawl" className="space-y-5 mt-0">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{t("zakat.nisab_progress")}</span>
                <span className="text-muted-foreground">{nisabPct.toFixed(0)}%</span>
              </div>
              <Progress value={nisabPct} className="h-2" />
              <p className="text-[11px] text-muted-foreground">{t("zakat.nisab_progress_desc")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{t("zakat.hawl_progress")}</span>
                <span className="text-muted-foreground">{hawlPct.toFixed(0)}%</span>
              </div>
              <Progress value={hawlPct} className="h-2" />
              <p className="text-[11px] text-muted-foreground">{t("zakat.hawl_progress_desc")}</p>
            </div>

            <div className="glass-card rounded-xl p-4 text-xs space-y-2">
              {settings.zakatYearStartDate ? (
                <>
                  <Row label={t("zakat.haul_start")} value={formatDate(settings.zakatYearStartDate)} />
                  {result.hawlEndDate && <Row label={t("zakat.hawl_end")} value={formatDate(result.hawlEndDate)} />}
                  <Row
                    label={t("zakat.hawl_completed")}
                    value={result.hawlCompleted ? "✓" : `${result.daysUntilHawl} ${t("zakat.days_left")}`}
                  />
                </>
              ) : (
                <p className="text-warning">{t("zakat.no_hawl_set")}</p>
              )}
            </div>
          </TabsContent>

          {/* === GUIDE === */}
          <TabsContent value="guide" className="space-y-3 mt-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass-card rounded-xl p-3">
                <h4 className="text-xs font-bold text-accent mb-1">
                  {t(`zakat.guide_q${i}`)}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(`zakat.guide_a${i}`)}
                </p>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground text-center italic mt-4">
              {t("zakat.guide_disclaimer")} • {NISAB_GOLD_GRAMS}g • {(ZAKAT_RATE * 100).toFixed(1)}%
            </p>
          </TabsContent>
        </Tabs>
      </FormModal>

      {openCalc && (
        <Suspense fallback={null}>
          <ZakatModal sectionId={sectionId} onClose={() => setOpenCalc(false)} />
        </Suspense>
      )}
    </>
  );
}

function MiniStat({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const cls = positive ? "text-success" : negative ? "text-warning" : "";
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
