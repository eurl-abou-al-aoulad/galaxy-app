import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  HandCoins,
  Package,
  Receipt,
  AlertTriangle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { db } from "@/lib/db";
import { useSection, canAccess } from "@/contexts/AppContext";
import { formatDZD } from "@/lib/printing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState, lazy, Suspense } from "react";

const ZakatDetailsModal = lazy(() =>
  import("@/components/galaxy/ZakatDetailsModal").then((m) => ({ default: m.ZakatDetailsModal })),
);

export const Route = createFileRoute("/app/$sectionId/$role/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const { sectionId, role } = useSection();
  const [zakatOpen, setZakatOpen] = useState(false);

  const settings = useLiveQuery(() => db.settings.get(1), []);
  const products = useLiveQuery(() => db.products.where("section").equals(sectionId).toArray(), [sectionId]);
  const invoices = useLiveQuery(() => db.invoices.where("section").equals(sectionId).toArray(), [sectionId]);
  const debts = useLiveQuery(() => db.debts.where("section").equals(sectionId).toArray(), [sectionId]);
  const expenses = useLiveQuery(() => db.expenses.where("section").equals(sectionId).toArray(), [sectionId]);

  // الحسابات (مذكّرة لتفادي إعادة العمل)
  const stats = useMemo(() => {
    const safeProducts = products ?? [];
    const safeInvoices = invoices ?? [];
    const safeDebts = debts ?? [];
    const safeExpenses = expenses ?? [];

    const inventoryValue = safeProducts.reduce((s, p) => s + p.purchasePrice * p.quantity, 0);
    const capital = (settings?.capital || 0) + inventoryValue;

    // الربح المتوقع: الفرق بين سعر البيع وسعر الشراء × الكمية المتاحة في المخزن
    const expectedProfit = safeProducts.reduce(
      (s, p) => s + Math.max(0, p.sellingPrice - p.purchasePrice) * p.quantity,
      0,
    );

    // الربح المحقق فعلياً: من الفواتير المسددة كاملاً فقط (status === "paid")
    const paidInvoices = safeInvoices.filter((inv) => inv.status === "paid");
    const realizedRevenue = paidInvoices.reduce((s, inv) => s + (inv.paid || 0), 0);
    const realizedCost = paidInvoices.reduce(
      (s, inv) => s + inv.items.reduce((a, it) => a + it.purchasePrice * it.quantity, 0),
      0,
    );
    const totalExpenses = safeExpenses.filter((e) => e.paid === 1).reduce((s, e) => s + e.amount, 0);
    const realizedProfit = realizedRevenue - realizedCost - totalExpenses;

    const totalDebts = safeDebts.filter((d) => d.status === "active").reduce((s, d) => s + d.remainingAmount, 0);
    const zakatBase = capital - totalDebts;
    const zakat = Math.max(0, zakatBase * 0.025);
    const lowStock = safeProducts.filter((p) => p.quantity <= (p.minStock || 5));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const invoicesToday = safeInvoices.filter((inv) => inv.createdAt >= today.getTime()).length;

    const monthlyData = buildMonthlyData(safeInvoices, safeDebts, safeExpenses);

    return { capital, expectedProfit, realizedProfit, totalDebts, zakat, lowStock, invoicesToday, monthlyData };
  }, [products, invoices, debts, expenses, settings]);

  if (!products || !invoices || !debts || !expenses || !settings) {
    return <DashboardSkeleton />;
  }

  const {
    capital,
    expectedProfit,
    realizedProfit,
    totalDebts,
    zakat,
    lowStock,
    invoicesToday,
    monthlyData,
  } = stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy">
          {t("modules.dashboard")}
        </h1>
        <span className="text-sm text-muted-foreground">{t(`sections.${sectionId}`)}</span>
      </div>

      {canAccess(role, "dashboard") && (
        <>
          {/* صف 1 — رأس المال + ربحان + ديون + زكاة */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard icon={Wallet} label={t("dashboard.capital")} value={formatDZD(capital)} color="primary" />
            <StatCard
              icon={Sparkles}
              label={t("dashboard.expected_profit")}
              value={formatDZD(expectedProfit)}
              color="accent"
              hint={t("dashboard.expected_profit_hint")}
            />
            <StatCard
              icon={TrendingUp}
              label={t("dashboard.realized_profit")}
              value={formatDZD(realizedProfit)}
              color={realizedProfit >= 0 ? "success" : "destructive"}
              hint={t("dashboard.realized_profit_hint")}
            />
            <StatCard icon={CreditCard} label={t("dashboard.debts")} value={formatDZD(totalDebts)} color="warning" />
            <StatCard
              icon={HandCoins}
              label={t("dashboard.zakat")}
              value={formatDZD(zakat)}
              color="accent"
              onClick={() => setZakatOpen(true)}
            />
          </div>

          {zakatOpen && (
            <Suspense fallback={null}>
              <ZakatDetailsModal sectionId={sectionId} onClose={() => setZakatOpen(false)} />
            </Suspense>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={Package} label={t("dashboard.products_count")} value={products.length.toString()} color="primary" small />
            <StatCard icon={Receipt} label={t("dashboard.invoices_today")} value={invoicesToday.toString()} color="accent" small />
            <StatCard icon={AlertTriangle} label={t("dashboard.low_stock")} value={lowStock.length.toString()} color={lowStock.length > 0 ? "warning" : "muted"} small />
          </div>

          {/* الرسم البياني متعدد العناصر */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-4">{t("dashboard.monthly_overview")}</h3>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0.05 280 / 0.2)" />
                  <XAxis dataKey="month" stroke="oklch(0.7 0.03 280)" fontSize={12} />
                  <YAxis stroke="oklch(0.7 0.03 280)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.05 280)",
                      border: "1px solid oklch(0.65 0.25 295 / 0.4)",
                      borderRadius: 12,
                    }}
                    formatter={(v) => formatDZD(Number(v) || 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name={t("dashboard.chart_sales")}
                    stroke="oklch(0.78 0.22 295)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name={t("dashboard.chart_realized_profit")}
                    stroke="oklch(0.75 0.20 145)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name={t("dashboard.chart_expenses")}
                    stroke="oklch(0.70 0.22 25)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="newDebts"
                    name={t("dashboard.chart_new_debts")}
                    stroke="oklch(0.78 0.18 60)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="collections"
                    name={t("dashboard.chart_collections")}
                    stroke="oklch(0.78 0.18 200)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {role === "worker" && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Receipt className="h-16 w-16 mx-auto text-accent mb-4" />
          <h2 className="text-xl font-bold mb-2">{t("invoices.new_invoice")}</h2>
          <p className="text-muted-foreground">{t("role.worker_desc")}</p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  small,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: "primary" | "accent" | "success" | "warning" | "destructive" | "muted";
  small?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    primary: "from-primary/30 to-primary/5 border-primary/40 text-primary",
    accent: "from-accent/30 to-accent/5 border-accent/40 text-accent",
    success: "from-success/30 to-success/5 border-success/40 text-success",
    warning: "from-warning/30 to-warning/5 border-warning/40 text-warning",
    destructive: "from-destructive/30 to-destructive/5 border-destructive/40 text-destructive",
    muted: "from-muted/40 to-muted/10 border-border text-muted-foreground",
  };
  const [open, setOpen] = useState(false);

  const cardBody = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</span>
        <Icon className={`h-5 w-5 shrink-0 ${colorMap[color].split(" ").pop()}`} />
      </div>
      <div className={`${small ? "text-2xl" : "text-2xl md:text-3xl"} font-black truncate`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{hint}</div>}
    </>
  );

  const btnClass = `text-start w-full glass-card card-3d rounded-2xl p-5 bg-gradient-to-br ${colorMap[color]} cursor-pointer hover:scale-[1.02] active:scale-[0.99] transition-transform focus:outline-none focus:ring-2 focus:ring-primary/50`;

  if (onClick) {
    return (
      <button type="button" title={value} onClick={onClick} className={btnClass}>
        {cardBody}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" title={value} className={btnClass}>{cardBody}</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{label}</DialogTitle>
          {hint && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>
        <div className="py-6 px-2 text-center">
          <div
            className="text-3xl md:text-4xl font-black text-gradient-galaxy whitespace-nowrap overflow-x-auto"
            style={{ direction: "ltr" }}
          >
            {value}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 bg-muted/40 rounded-xl animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 h-28 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

interface MinimalInvoice {
  createdAt: number;
  status: string;
  total: number;
  paid: number;
  items: { purchasePrice: number; quantity: number }[];
}
interface MinimalDebt {
  createdAt: number;
  totalAmount: number;
  payments: { date: number; amount: number; note: string }[];
}
interface MinimalExpense {
  date: number;
  amount: number;
  paid: 0 | 1;
}

function buildMonthlyData(
  invoices: MinimalInvoice[],
  debts: MinimalDebt[],
  expenses: MinimalExpense[],
) {
  const months: {
    month: string;
    sales: number;
    profit: number;
    expenses: number;
    newDebts: number;
    collections: number;
  }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();

    const monthInvoices = invoices.filter((inv) => inv.createdAt >= start && inv.createdAt < end);
    const sales = monthInvoices.reduce((s, inv) => s + inv.total, 0);
    const paidInvs = monthInvoices.filter((inv) => inv.status === "paid");
    const monthExpensesTotal = expenses
      .filter((e) => e.paid === 1 && e.date >= start && e.date < end)
      .reduce((s, e) => s + e.amount, 0);
    const realizedRevenue = paidInvs.reduce((s, inv) => s + (inv.paid || 0), 0);
    const realizedCost = paidInvs.reduce(
      (s, inv) => s + inv.items.reduce((a, it) => a + it.purchasePrice * it.quantity, 0),
      0,
    );
    const profit = realizedRevenue - realizedCost - monthExpensesTotal;

    const newDebts = debts
      .filter((d) => d.createdAt >= start && d.createdAt < end)
      .reduce((s, d) => s + d.totalAmount, 0);
    const collections = debts.reduce(
      (s, d) =>
        s + d.payments.filter((p) => p.date >= start && p.date < end).reduce((a, p) => a + p.amount, 0),
      0,
    );

    months.push({
      month: new Date(start).toLocaleDateString("en", { month: "short" }),
      sales: Math.round(sales),
      profit: Math.round(profit),
      expenses: Math.round(monthExpensesTotal),
      newDebts: Math.round(newDebts),
      collections: Math.round(collections),
    });
  }
  return months;
}
