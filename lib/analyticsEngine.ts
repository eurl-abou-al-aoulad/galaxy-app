/**
 * المحرك التحليلي المحلي — يعمل بالكامل على بيانات Dexie (IndexedDB)
 * بدون أي اتصال خارجي وبدون استهلاك أي رصيد ذكاء اصطناعي.
 *
 * يقوم بـ:
 *  1) جمع لقطة شاملة من البيانات (snapshot)
 *  2) توليد تنبيهات استباقية (مخزون، ديون، أرباح، زكاة...)
 *  3) فهم سؤال المستخدم بقواعد كلمات مفتاحية (AR/EN) وإعطاء جواب رقمي دقيق
 */

import { db, type SectionId } from "@/lib/db";

export type Lang = "ar" | "en" | "fr";

export interface Snapshot {
  section: SectionId;
  now: number;
  // مالي
  capital: number;
  totalSales: number;          // إجمالي المبيعات (كل الفواتير المدفوعة/الجزئية/المعلقة بحالة بيع)
  totalSalesMonth: number;     // مبيعات الشهر الجاري
  totalSalesToday: number;
  totalProfit: number;
  totalProfitMonth: number;
  // ديون
  totalDebts: number;
  activeDebtsCount: number;
  topDebtors: { name: string; amount: number }[];
  // مخزون
  productsCount: number;
  inventoryValue: number;      // قيمة المخزون بسعر الشراء
  inventorySaleValue: number;  // قيمته بسعر البيع
  lowStock: { name: string; qty: number; min: number }[];
  outOfStock: { name: string }[];
  topSellers: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number }[]; // مخزون مرتفع وبيع منعدم
  // مصروفات
  totalExpensesMonth: number;
  expensesByCategoryMonth: Record<string, number>;
  // زبائن
  customersCount: number;
  topCustomers: { name: string; total: number }[];
  // فواتير
  invoicesCount: number;
  invoicesMonth: number;
  suspendedCount: number;
  // زكاة (تقريبية: 2.5% من رأس المال + المخزون - الديون السلبية)
  zakatBase: number;
  zakatDue: number;
}


function startOfMonth(ts: number) {
  const d = new Date(ts);
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function buildSnapshot(section: SectionId): Promise<Snapshot> {
  const now = Date.now();
  const monthStart = startOfMonth(now);
  const dayStart = startOfDay(now);

  const [settings, products, invoices, debts, customers, expenses] = await Promise.all([
    db.settings.get(1),
    db.products.where("section").equals(section).toArray(),
    db.invoices.where("section").equals(section).toArray(),
    db.debts.where("section").equals(section).toArray(),
    db.customers.where("section").equals(section).toArray(),
    db.expenses.where("section").equals(section).toArray(),
  ]);

  // المبيعات والأرباح
  let totalSales = 0, totalSalesMonth = 0, totalSalesToday = 0;
  let totalProfit = 0, totalProfitMonth = 0;
  let invoicesMonth = 0, suspendedCount = 0;

  // إحصاءات المنتجات المباعة
  const productSales = new Map<number, { name: string; qty: number; revenue: number }>();

  for (const inv of invoices) {
    if (inv.status === "suspended") { suspendedCount++; continue; }
    const isReturned = inv.status === "returned";
    const sign = isReturned ? -1 : 1;
    totalSales += sign * inv.total;
    if (inv.createdAt >= monthStart) { totalSalesMonth += sign * inv.total; invoicesMonth++; }
    if (inv.createdAt >= dayStart) totalSalesToday += sign * inv.total;

    for (const item of inv.items) {
      const profit = (item.sellingPrice - item.purchasePrice) * item.quantity * sign;
      totalProfit += profit;
      if (inv.createdAt >= monthStart) totalProfitMonth += profit;
      if (!isReturned) {
        const prev = productSales.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0 };
        prev.qty += item.quantity;
        prev.revenue += item.total;
        productSales.set(item.productId, prev);
      }
    }
  }

  // الديون
  const activeDebts = debts.filter((d) => d.status === "active");
  const totalDebts = activeDebts.reduce((s, d) => s + d.remainingAmount, 0);
  const topDebtors = [...activeDebts]
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
    .slice(0, 5)
    .map((d) => ({ name: d.customerName || "—", amount: d.remainingAmount }));

  // المخزون
  const inventoryValue = products.reduce((s, p) => s + p.purchasePrice * p.quantity, 0);
  const inventorySaleValue = products.reduce((s, p) => s + p.sellingPrice * p.quantity, 0);
  const lowStock = products
    .filter((p) => p.quantity > 0 && p.quantity <= (p.minStock || 5))
    .map((p) => ({ name: p.name, qty: p.quantity, min: p.minStock || 5 }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 10);
  const outOfStock = products
    .filter((p) => p.quantity <= 0)
    .map((p) => ({ name: p.name }))
    .slice(0, 10);

  const topSellers = [...productSales.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // المنتجات الراكدة: موجودة بكمية > 5 ولم تُبَع أبداً
  const slowMovers = products
    .filter((p) => p.quantity > 5 && !productSales.has(p.id!))
    .map((p) => ({ name: p.name, qty: p.quantity }))
    .slice(0, 5);

  // المصروفات
  const expensesMonth = expenses.filter((e) => e.date >= monthStart);
  const totalExpensesMonth = expensesMonth.reduce((s, e) => s + e.amount, 0);
  const expensesByCategoryMonth: Record<string, number> = {};
  for (const e of expensesMonth) {
    expensesByCategoryMonth[e.category] = (expensesByCategoryMonth[e.category] ?? 0) + e.amount;
  }

  // الزبائن
  const topCustomers = [...customers]
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, 5)
    .map((c) => ({ name: c.name, total: c.totalPurchases }));

  // الزكاة (مبسّطة: قاعدة = رأس المال + قيمة المخزون - الديون السلبية النشطة)
  const capital = settings?.capital ?? 0;
  const zakatBase = Math.max(0, capital + inventoryValue - totalDebts);
  const zakatDue = zakatBase * 0.025;

  return {
    section,
    now,
    capital,
    totalSales,
    totalSalesMonth,
    totalSalesToday,
    totalProfit,
    totalProfitMonth,
    totalDebts,
    activeDebtsCount: activeDebts.length,
    topDebtors,
    productsCount: products.length,
    inventoryValue,
    inventorySaleValue,
    lowStock,
    outOfStock,
    topSellers,
    slowMovers,
    totalExpensesMonth,
    expensesByCategoryMonth,
    customersCount: customers.length,
    topCustomers,
    invoicesCount: invoices.length,
    invoicesMonth,
    suspendedCount,
    zakatBase,
    zakatDue,
  };
}

// ====================== التنبيهات الاستباقية ======================

export interface Alert {
  level: "info" | "warning" | "danger" | "success";
  icon: string;
  text: string;
}

export function generateAlerts(s: Snapshot, lang: Lang): Alert[] {
  const ar = lang === "ar";
  const a: Alert[] = [];
  const fmt = (n: number) => formatMoney(n, lang);

  // مخزون نافد
  if (s.outOfStock.length > 0) {
    a.push({
      level: "danger",
      icon: "🚫",
      text: ar
        ? `${s.outOfStock.length} منتج نفد كلياً من المخزن (مثل: ${s.outOfStock.slice(0, 3).map((p) => p.name).join("، ")})`
        : `${s.outOfStock.length} products are completely out of stock (e.g.: ${s.outOfStock.slice(0, 3).map((p) => p.name).join(", ")})`,
    });
  }
  // مخزون منخفض
  if (s.lowStock.length > 0) {
    a.push({
      level: "warning",
      icon: "⚠️",
      text: ar
        ? `${s.lowStock.length} منتج بمخزون منخفض — يُستحسن إعادة التموين قريباً`
        : `${s.lowStock.length} products are running low — restock soon`,
    });
  }
  // ديون كبيرة
  if (s.totalDebts > 0 && s.activeDebtsCount > 0) {
    a.push({
      level: s.totalDebts > s.totalSalesMonth ? "danger" : "warning",
      icon: "💳",
      text: ar
        ? `لديك ${s.activeDebtsCount} دين نشط بمجموع ${fmt(s.totalDebts)} — تابع التحصيل`
        : `${s.activeDebtsCount} active debts totaling ${fmt(s.totalDebts)} — follow up on collection`,
    });
  }
  // فواتير معلقة
  if (s.suspendedCount > 0) {
    a.push({
      level: "info",
      icon: "⏳",
      text: ar
        ? `${s.suspendedCount} فاتورة معلّقة بانتظار الإكمال`
        : `${s.suspendedCount} suspended invoices waiting to be completed`,
    });
  }
  // ربح ممتاز
  if (s.totalProfitMonth > 0 && s.totalSalesMonth > 0) {
    const margin = (s.totalProfitMonth / s.totalSalesMonth) * 100;
    if (margin >= 25) {
      a.push({
        level: "success",
        icon: "📈",
        text: ar
          ? `هامش ربح ممتاز هذا الشهر: ${margin.toFixed(1)}%`
          : `Excellent profit margin this month: ${margin.toFixed(1)}%`,
      });
    } else if (margin < 10 && margin > 0) {
      a.push({
        level: "warning",
        icon: "📉",
        text: ar
          ? `هامش ربح منخفض هذا الشهر: ${margin.toFixed(1)}% — راجع أسعار البيع`
          : `Low profit margin this month: ${margin.toFixed(1)}% — review your selling prices`,
      });
    }
  }
  // مصروفات تتجاوز المبيعات
  if (s.totalExpensesMonth > s.totalSalesMonth && s.totalSalesMonth > 0) {
    a.push({
      level: "danger",
      icon: "🔥",
      text: ar
        ? `مصروفات الشهر (${fmt(s.totalExpensesMonth)}) تجاوزت المبيعات (${fmt(s.totalSalesMonth)})`
        : `This month's expenses (${fmt(s.totalExpensesMonth)}) exceeded sales (${fmt(s.totalSalesMonth)})`,
    });
  }
  // منتجات راكدة
  if (s.slowMovers.length > 0) {
    a.push({
      level: "info",
      icon: "🐌",
      text: ar
        ? `${s.slowMovers.length} منتج راكد بدون مبيعات — فكّر في تخفيض السعر`
        : `${s.slowMovers.length} slow-moving products — consider a price cut`,
    });
  }
  // زكاة
  if (s.zakatDue > 0) {
    a.push({
      level: "info",
      icon: "🕌",
      text: ar
        ? `الزكاة المستحقة تقريباً: ${fmt(s.zakatDue)} (2.5% من قاعدة ${fmt(s.zakatBase)})`
        : `Estimated zakat due: ${fmt(s.zakatDue)} (2.5% of base ${fmt(s.zakatBase)})`,
    });
  }
  // لا توجد بيانات
  if (s.invoicesCount === 0 && s.productsCount === 0) {
    a.push({
      level: "info",
      icon: "👋",
      text: ar
        ? "لم تبدأ بإدخال بيانات بعد. أضف منتجاتك أولاً ثم أنشئ أول فاتورة."
        : "No data yet. Add products first, then create your first invoice.",
    });
  }
  return a;
}

// ====================== الأسئلة المقترحة ======================

export function getSuggestions(lang: Lang): string[] {
  return lang === "ar"
    ? [
        "كم بلغت مبيعاتي اليوم؟",
        "كم ربحت هذا الشهر؟",
        "ما هي أكثر المنتجات مبيعاً؟",
        "من أكبر المدينين لي؟",
        "ما هي المنتجات التي قارب نفاد مخزونها؟",
        "كم تبلغ زكاتي؟",
        "أعطني تحليلاً شاملاً لمحلي",
      ]
    : [
        "How much did I sell today?",
        "What is my profit this month?",
        "What are my best-selling products?",
        "Who are my biggest debtors?",
        "Which products are running low?",
        "How much zakat do I owe?",
        "Give me a full overview of my shop",
      ];
}

// ====================== الإجابة على سؤال المستخدم ======================

const KW = {
  salesToday: { ar: ["مبيعات اليوم", "بعت اليوم", "مبيعاتي اليوم"], en: ["sales today", "sold today", "today sales"] },
  salesMonth: { ar: ["مبيعات الشهر", "هذا الشهر", "مبيعاتي الشهر"], en: ["this month", "monthly sales", "sales month"] },
  sales: { ar: ["مبيعات", "بيع", "مبلغ المبيعات"], en: ["sales", "revenue", "turnover"] },
  profitMonth: { ar: ["ربح الشهر", "أرباح الشهر", "ربحت الشهر"], en: ["profit this month", "monthly profit"] },
  profit: { ar: ["ربح", "أرباح", "هامش"], en: ["profit", "earnings", "margin"] },
  debts: { ar: ["دين", "ديون", "مدين", "مدينين"], en: ["debt", "debts", "owed", "debtors"] },
  inventoryLow: { ar: ["مخزون منخفض", "قارب", "نافد", "نفد", "نقص"], en: ["low stock", "running low", "out of stock", "restock"] },
  inventoryValue: { ar: ["قيمة المخزون", "قيمة المخزن", "كم يساوي مخزني"], en: ["inventory value", "stock value"] },
  topProducts: { ar: ["أكثر مبيعاً", "أفضل منتج", "أحسن منتج", "بست سيلر"], en: ["best seller", "top product", "best selling"] },
  slowMovers: { ar: ["راكد", "منتج لا يباع", "بطيء"], en: ["slow", "not selling", "stale"] },
  topCustomers: { ar: ["أفضل زبون", "أكبر زبون", "أفضل عميل"], en: ["best customer", "top customer"] },
  expenses: { ar: ["مصروف", "مصاريف", "صرفت"], en: ["expense", "expenses", "spent"] },
  zakat: { ar: ["زكاة", "زكاتي"], en: ["zakat", "zakah"] },
  capital: { ar: ["رأس المال", "رأسمال"], en: ["capital"] },
  overview: { ar: ["تحليل شامل", "ملخص", "نظرة عامة", "وضعية المحل", "كيف حال محلي"], en: ["overview", "summary", "full report", "how is my shop"] },
  help: { ar: ["مساعدة", "ماذا تفعل", "كيف"], en: ["help", "what can you do"] },
};

function matches(q: string, set: { ar: string[]; en: string[] }, lang: Lang): boolean {
  const lower = q.toLowerCase();
  const list = lang === "ar" ? [...set.ar, ...set.en] : [...set.en, ...set.ar];
  return list.some((kw) => lower.includes(kw.toLowerCase()));
}

export function formatMoney(n: number, lang: Lang): string {
  const rounded = Math.round(n);
  const formatted = rounded.toLocaleString(lang === "ar" ? "ar-DZ" : "en-US");
  return lang === "ar" ? `${formatted} دج` : `${formatted} DZD`;
}

export function answer(question: string, s: Snapshot, lang: Lang): string {
  const q = question.trim();
  const ar = lang === "ar";
  const fmt = (n: number) => formatMoney(n, lang);

  if (!q) return ar ? "اكتب سؤالك أو اختر من المقترحات." : "Type your question or pick a suggestion.";

  if (matches(q, KW.help, lang)) {
    return ar
      ? "أنا مساعدك التحليلي المحلي 🌌 — أحلل بيانات محلك مباشرة (مبيعات، أرباح، ديون، مخزون، زبائن، مصروفات، زكاة) وأعطيك إجابات فورية بدون اتصال بالإنترنت. جرّب الأسئلة المقترحة أو اكتب سؤالك."
      : "I am your local analytics assistant 🌌 — I analyze your shop's data directly (sales, profit, debts, inventory, customers, expenses, zakat) and give instant offline answers. Try a suggestion or type your question.";
  }

  if (matches(q, KW.overview, lang)) {
    const margin = s.totalSalesMonth > 0 ? (s.totalProfitMonth / s.totalSalesMonth) * 100 : 0;
    return ar
      ? `📊 **نظرة شاملة على محلك**

• مبيعات اليوم: ${fmt(s.totalSalesToday)}
• مبيعات الشهر: ${fmt(s.totalSalesMonth)} (${s.invoicesMonth} فاتورة)
• ربح الشهر: ${fmt(s.totalProfitMonth)} — هامش ${margin.toFixed(1)}%
• قيمة المخزون: ${fmt(s.inventoryValue)} (${s.productsCount} منتج)
• ديون نشطة: ${fmt(s.totalDebts)} على ${s.activeDebtsCount} زبون
• مصروفات الشهر: ${fmt(s.totalExpensesMonth)}
• الزكاة التقريبية: ${fmt(s.zakatDue)}`
      : `📊 **Full overview of your shop**

• Sales today: ${fmt(s.totalSalesToday)}
• Sales this month: ${fmt(s.totalSalesMonth)} (${s.invoicesMonth} invoices)
• Profit this month: ${fmt(s.totalProfitMonth)} — margin ${margin.toFixed(1)}%
• Inventory value: ${fmt(s.inventoryValue)} (${s.productsCount} products)
• Active debts: ${fmt(s.totalDebts)} from ${s.activeDebtsCount} customers
• Monthly expenses: ${fmt(s.totalExpensesMonth)}
• Estimated zakat: ${fmt(s.zakatDue)}`;
  }

  if (matches(q, KW.salesToday, lang)) {
    return ar
      ? `💰 مبيعات اليوم: ${fmt(s.totalSalesToday)}.`
      : `💰 Today's sales: ${fmt(s.totalSalesToday)}.`;
  }
  if (matches(q, KW.salesMonth, lang)) {
    return ar
      ? `📅 مبيعات الشهر الجاري: ${fmt(s.totalSalesMonth)} موزّعة على ${s.invoicesMonth} فاتورة.`
      : `📅 Sales this month: ${fmt(s.totalSalesMonth)} across ${s.invoicesMonth} invoices.`;
  }
  if (matches(q, KW.profitMonth, lang)) {
    const margin = s.totalSalesMonth > 0 ? (s.totalProfitMonth / s.totalSalesMonth) * 100 : 0;
    return ar
      ? `📈 ربح الشهر: ${fmt(s.totalProfitMonth)} — أي هامش ${margin.toFixed(1)}% من المبيعات.`
      : `📈 Monthly profit: ${fmt(s.totalProfitMonth)} — that's a ${margin.toFixed(1)}% margin.`;
  }
  if (matches(q, KW.profit, lang)) {
    return ar
      ? `💵 إجمالي الأرباح منذ البداية: ${fmt(s.totalProfit)}، منها ${fmt(s.totalProfitMonth)} هذا الشهر.`
      : `💵 Total profit ever: ${fmt(s.totalProfit)}, of which ${fmt(s.totalProfitMonth)} this month.`;
  }
  if (matches(q, KW.sales, lang)) {
    return ar
      ? `🧾 إجمالي المبيعات منذ البداية: ${fmt(s.totalSales)} (${s.invoicesCount} فاتورة).`
      : `🧾 Total sales ever: ${fmt(s.totalSales)} (${s.invoicesCount} invoices).`;
  }
  if (matches(q, KW.debts, lang)) {
    if (s.activeDebtsCount === 0) {
      return ar ? "✅ ممتاز! لا توجد ديون نشطة حالياً." : "✅ Great! No active debts right now.";
    }
    const list = s.topDebtors.map((d, i) => `${i + 1}. ${d.name}: ${fmt(d.amount)}`).join("\n");
    return ar
      ? `💳 لديك ${s.activeDebtsCount} دين نشط بمجموع ${fmt(s.totalDebts)}.\n\nأكبر المدينين:\n${list}`
      : `💳 You have ${s.activeDebtsCount} active debts totaling ${fmt(s.totalDebts)}.\n\nTop debtors:\n${list}`;
  }
  if (matches(q, KW.inventoryLow, lang)) {
    if (s.lowStock.length === 0 && s.outOfStock.length === 0) {
      return ar ? "✅ المخزون في حالة جيدة، لا منتجات منخفضة." : "✅ Inventory is healthy, nothing is running low.";
    }
    const low = s.lowStock.slice(0, 8).map((p) => `• ${p.name}: ${p.qty} (الحد ${p.min})`).join("\n");
    const out = s.outOfStock.slice(0, 8).map((p) => `• ${p.name}`).join("\n");
    let r = "";
    if (s.outOfStock.length) r += (ar ? `🚫 منتجات نافدة كلياً (${s.outOfStock.length}):\n${out}\n\n` : `🚫 Out of stock (${s.outOfStock.length}):\n${out}\n\n`);
    if (s.lowStock.length) r += (ar ? `⚠️ مخزون منخفض (${s.lowStock.length}):\n${low}` : `⚠️ Low stock (${s.lowStock.length}):\n${low}`);
    return r.trim();
  }
  if (matches(q, KW.inventoryValue, lang)) {
    return ar
      ? `📦 قيمة مخزونك: ${fmt(s.inventoryValue)} (بسعر الشراء)، أو ${fmt(s.inventorySaleValue)} (بسعر البيع). إجمالي ${s.productsCount} منتج.`
      : `📦 Inventory value: ${fmt(s.inventoryValue)} (cost), or ${fmt(s.inventorySaleValue)} (retail). Total ${s.productsCount} products.`;
  }
  if (matches(q, KW.topProducts, lang)) {
    if (s.topSellers.length === 0) {
      return ar ? "لا توجد مبيعات بعد." : "No sales yet.";
    }
    const list = s.topSellers.map((p, i) => ar
      ? `${i + 1}. ${p.name} — ${p.qty} وحدة (${fmt(p.revenue)})`
      : `${i + 1}. ${p.name} — ${p.qty} units (${fmt(p.revenue)})`).join("\n");
    return ar ? `🏆 أكثر المنتجات مبيعاً:\n${list}` : `🏆 Best sellers:\n${list}`;
  }
  if (matches(q, KW.slowMovers, lang)) {
    if (s.slowMovers.length === 0) {
      return ar ? "✅ لا توجد منتجات راكدة." : "✅ No slow movers.";
    }
    const list = s.slowMovers.map((p) => `• ${p.name} (${p.qty})`).join("\n");
    return ar
      ? `🐌 منتجات راكدة (لم تُبَع):\n${list}\n\n💡 جرّب تخفيض السعر أو عرضاً ترويجياً.`
      : `🐌 Slow-moving products (never sold):\n${list}\n\n💡 Try a discount or promotion.`;
  }
  if (matches(q, KW.topCustomers, lang)) {
    if (s.topCustomers.length === 0) return ar ? "لا يوجد زبائن بعد." : "No customers yet.";
    const list = s.topCustomers.map((c, i) => `${i + 1}. ${c.name}: ${fmt(c.total)}`).join("\n");
    return ar ? `👥 أفضل الزبائن:\n${list}` : `👥 Top customers:\n${list}`;
  }
  if (matches(q, KW.expenses, lang)) {
    const cats = Object.entries(s.expensesByCategoryMonth)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `• ${k}: ${fmt(v)}`)
      .join("\n");
    return ar
      ? `💸 مصروفات هذا الشهر: ${fmt(s.totalExpensesMonth)}.\n\nالتوزيع:\n${cats || "(لا شيء)"}`
      : `💸 Expenses this month: ${fmt(s.totalExpensesMonth)}.\n\nBreakdown:\n${cats || "(none)"}`;
  }
  if (matches(q, KW.zakat, lang)) {
    return ar
      ? `🕌 الزكاة المستحقة تقريباً: ${fmt(s.zakatDue)} (2.5% من قاعدة ${fmt(s.zakatBase)} = رأس المال + المخزون - الديون).`
      : `🕌 Estimated zakat due: ${fmt(s.zakatDue)} (2.5% of base ${fmt(s.zakatBase)} = capital + inventory − debts).`;
  }
  if (matches(q, KW.capital, lang)) {
    return ar
      ? `🏦 رأس المال المسجّل: ${fmt(s.capital)}. (يمكن تعديله من الإعدادات)`
      : `🏦 Registered capital: ${fmt(s.capital)}. (Edit it in Settings)`;
  }

  // افتراضي: لم نفهم
  return ar
    ? "🤔 لم أفهم سؤالك بدقة. جرّب أحد الأسئلة المقترحة، أو اطلب «تحليل شامل» لأعطيك ملخصاً كاملاً عن محلك."
    : "🤔 I didn't quite get that. Try one of the suggestions, or ask for a 'full overview' to get a complete summary of your shop.";
}
