import { useState, useMemo, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ScanLine,
  Plus,
  Minus,
  Trash2,
  Search,
  Banknote,
  CreditCard,
  Receipt as ReceiptIcon,
  ShoppingCart,
  X,
  Star,
  Package as PackageIcon,
} from "lucide-react";
import {
  db,
  nextInvoiceNumber,
  type InvoiceItem,
  type ProductRecord,
} from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { NeonButton } from "@/components/galaxy/NeonButton";
import {
  formatDZD,
  printInvoiceHtml,
  thermalReceiptHtml,
  a4InvoiceHtml,
} from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/pos")({
  component: POSPage,
});

function POSPage() {
  const { t } = useTranslation();
  const { sectionId, role, workerCode } = useSection();
  const createdBy = role === "admin" ? "admin" : workerCode ?? "worker";

  const products = useLiveQuery(
    () => db.products.where("section").equals(sectionId).toArray(),
    [sectionId],
  );
  const settings = useLiveQuery(() => db.settings.get(1), []);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("__all__");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paid, setPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [printSize, setPrintSize] = useState<"thermal" | "a4">(
    sectionId === "supermarket" || sectionId === "clothing" ? "thermal" : "a4",
  );
  const [autoPrint, setAutoPrint] = useState(true);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // قائمة الفئات (مع عدّاد سريع)
  const categories = useMemo(() => {
    if (!products) return [] as { name: string; count: number }[];
    const map = new Map<string, number>();
    for (const p of products) {
      const c = (p.category || "—").trim() || "—";
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [products]);

  // المنتجات المعروضة بعد الفلترة
  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (activeCat !== "__all__" && (p.category || "—") !== activeCat) return false;
        if (!q) return true;
        return (
          p.barcode.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [products, search, activeCat]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.total, 0), [items]);
  const total = Math.max(0, subtotal - discount);
  const change = Math.max(0, paid - total);

  // تسديد كامل افتراضياً
  useEffect(() => {
    setPaid(total);
  }, [total]);

  const addProduct = (p: ProductRecord) => {
    if (p.quantity <= 0) {
      toast.error(t("pos.out_of_stock", { name: p.name }));
      return;
    }
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === p.id);
      if (idx >= 0) {
        const cur = prev[idx];
        if (cur.quantity + 1 > p.quantity) {
          toast.error(t("pos.max_stock", { name: p.name, n: p.quantity }));
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...cur,
          quantity: cur.quantity + 1,
          total: (cur.quantity + 1) * cur.sellingPrice,
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id!,
          barcode: p.barcode,
          name: p.name,
          unit: p.unit,
          quantity: 1,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          discount: 0,
          total: p.sellingPrice,
        },
      ];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === productId);
      if (idx < 0) return prev;
      const stockProd = products?.find((p) => p.id === productId);
      const newQty = prev[idx].quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      if (stockProd && newQty > stockProd.quantity) {
        toast.error(t("pos.max_stock", { name: prev[idx].name, n: stockProd.quantity }));
        return prev;
      }
      const next = [...prev];
      next[idx] = { ...prev[idx], quantity: newQty, total: newQty * prev[idx].sellingPrice };
      return next;
    });
  };

  const removeItem = (productId: number) =>
    setItems((prev) => prev.filter((it) => it.productId !== productId));

  const clearAll = () => {
    setItems([]);
    setDiscount(0);
    setPaid(0);
  };

  // ─── الماسح الضوئي ───
  useBarcodeScanner((code) => {
    const p = products?.find((x) => x.barcode === code);
    if (p) {
      addProduct(p);
      toast.success(t("invoices.scan_added", { name: p.name }));
    } else {
      toast.error(t("invoices.scan_not_found", { code }));
    }
  }, true);

  // اختصار: F2 = تركيز البحث | F4 = تسديد كامل | Esc = إلغاء السلة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0) void checkout("paid", total);
      } else if (e.key === "Escape") {
        if (items.length > 0) clearAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, total]);

  const checkout = async (mode: "paid" | "debt", paidValue: number) => {
    if (submitting) return;
    if (items.length === 0) {
      toast.error(t("invoices.errors.no_items"));
      return;
    }
    // تحديد الحالة الفعلية: مدفوعة كاملاً / جزئية / دين كامل
    const effectivePaid = Math.max(0, Math.min(paidValue, total));
    const remaining = Math.max(0, total - effectivePaid);
    let status: "paid" | "partial" | "debt";
    if (mode === "debt" || effectivePaid <= 0) status = "debt";
    else if (effectivePaid >= total) status = "paid";
    else status = "partial";

    // عند الدين/الجزئي اطلب اسم زبون
    let customerName = "";
    if (status !== "paid") {
      const entered = window.prompt(t("pos.customer_name_prompt"), t("pos.walk_in"));
      if (entered === null) return; // ألغى
      customerName = entered.trim() || t("pos.walk_in");
    }

    setSubmitting(true);
    try {
      const number = await nextInvoiceNumber(sectionId, "ticket");
      const now = Date.now();
      const inv = {
        section: sectionId,
        invoiceNumber: number,
        type: "ticket" as const,
        customerId: null,
        customerName,
        customerPhone: "",
        items,
        subtotal,
        discount,
        tva: 0,
        stamp: 0,
        shipping: 0,
        labor: 0,
        total,
        paid: effectivePaid,
        remaining,
        status,
        paymentMethod: "cash",
        notes: "POS",
        printSize,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };
      const id = await db.invoices.add(inv);

      // خصم المخزن (دائماً — البضاعة خرجت من المحل)
      for (const it of items) {
        const p = await db.products.get(it.productId);
        if (p) await db.products.update(it.productId, { quantity: Math.max(0, p.quantity - it.quantity) });
      }

      // إنشاء سجل دين تلقائياً عند الجزئي أو الكامل
      if (status === "debt" || status === "partial") {
        await db.debts.add({
          section: sectionId,
          invoiceId: id as number,
          customerId: null,
          customerName,
          customerPhone: "",
          totalAmount: total,
          paidAmount: effectivePaid,
          remainingAmount: remaining,
          payments: effectivePaid > 0 ? [{ date: now, amount: effectivePaid, note: "POS" }] : [],
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        toast.success(t("pos.debt_created", { amount: formatDZD(remaining) }));
      }

      // طباعة فورية إن مفعّلة
      if (autoPrint && settings) {
        const fullInv = await db.invoices.get(id as number);
        if (fullInv) {
          const html = printSize === "thermal"
            ? thermalReceiptHtml(fullInv, settings)
            : a4InvoiceHtml(fullInv, settings);
          printInvoiceHtml(html, printSize);
        }
      }

      toast.success(t("pos.checkout_done", { number }));
      clearAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg || t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 h-[calc(100vh-140px)] min-h-[560px]">
      {/* ───── الجانب الأيسر: البحث + الفئات + شبكة المنتجات ───── */}
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gradient-galaxy flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" /> {t("pos.title")}
          </h1>
          <span className="text-xs text-muted-foreground hidden md:inline">
            {t("pos.shortcuts")}
          </span>
        </div>

        {/* صف البحث */}
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-5 w-5 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pos.search_placeholder")}
            className="w-full ps-11 pe-4 h-12 rounded-xl bg-card/60 border border-border/60 focus:border-primary outline-none text-base"
          />
          <ScanLine className="absolute top-1/2 -translate-y-1/2 end-3 h-5 w-5 text-accent" />
        </div>

        {/* شريط الفئات */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <CatChip
            active={activeCat === "__all__"}
            label={t("pos.all_categories")}
            count={products?.length ?? 0}
            onClick={() => setActiveCat("__all__")}
          />
          {categories.map((c) => (
            <CatChip
              key={c.name}
              active={activeCat === c.name}
              label={c.name}
              count={c.count}
              onClick={() => setActiveCat(c.name)}
            />
          ))}
        </div>

        {/* شبكة المنتجات */}
        <div className="flex-1 overflow-y-auto rounded-2xl bg-card/30 border border-border/40 p-3 min-h-0">
          {!products || filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <PackageIcon className="h-12 w-12 opacity-40" />
              {t("pos.no_products")}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map((p) => {
                const low = p.quantity <= (p.minStock || 5);
                const out = p.quantity <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    disabled={out}
                    className={`relative text-start rounded-xl bg-card/70 border border-border/50 hover:border-primary hover:shadow-[0_0_0_2px_var(--primary)] transition-all p-3 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {/* صورة المنتج (اختيارية) */}
                    {p.imageUrl ? (
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted/30 mb-2 border border-border/50">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${low ? "bg-warning/15 text-warning border-warning/40" : "bg-success/15 text-success border-success/40"}`}>
                        {p.quantity} {p.unit}
                      </span>
                      <Star className="h-3.5 w-3.5 text-amber-400 opacity-70" />
                    </div>
                    <div className="font-bold text-sm leading-tight line-clamp-2 min-h-[2.6em]">
                      {p.name}
                    </div>
                    <div className="mt-2 text-base font-bold text-primary">
                      {formatDZD(p.sellingPrice)}
                    </div>
                    {p.barcode && (
                      <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        {p.barcode}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ───── الجانب الأيمن: السلة + الدفع ───── */}
      <div className="flex flex-col gap-3 rounded-2xl bg-card/40 border border-border/50 p-3 min-h-0">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ReceiptIcon className="h-5 w-5 text-accent" /> {t("pos.cart")}
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </h2>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-xs text-destructive hover:underline cursor-pointer flex items-center gap-1">
              <X className="h-3 w-3" /> {t("pos.clear")}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <ShoppingCart className="h-10 w-10 opacity-30" />
              {t("pos.empty_cart")}
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.productId} className="rounded-lg bg-background/60 border border-border/40 p-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-sm leading-tight line-clamp-1 flex-1">{it.name}</span>
                    <button onClick={() => removeItem(it.productId)} className="text-destructive hover:text-destructive/80 cursor-pointer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(it.productId, -1)} className="h-7 w-7 rounded-md bg-muted hover:bg-destructive/30 flex items-center justify-center cursor-pointer">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold text-sm">{it.quantity}</span>
                      <button onClick={() => updateQty(it.productId, 1)} className="h-7 w-7 rounded-md bg-muted hover:bg-primary/30 flex items-center justify-center cursor-pointer">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-muted-foreground">{formatDZD(it.sellingPrice)}</div>
                      <div className="font-bold text-sm text-primary">{formatDZD(it.total)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ملخّص + دفع */}
        <div className="space-y-2 border-t border-border/40 pt-3">
          <Row label={t("invoices.subtotal")} value={formatDZD(subtotal)} />
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-muted-foreground">{t("invoices.discount")}</label>
            <input
              type="number"
              min={0}
              max={subtotal}
              value={discount || ""}
              onChange={(e) => setDiscount(Math.max(0, Math.min(subtotal, Number(e.target.value) || 0)))}
              className="w-28 h-8 rounded-md bg-background border border-border/60 px-2 text-end text-sm"
            />
          </div>
          <div className="flex items-center justify-between text-lg font-bold pt-1 border-t border-border/30">
            <span>{t("invoices.total")}</span>
            <span className="text-primary">{formatDZD(total)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-muted-foreground">{t("invoices.paid")}</label>
            <input
              type="number"
              min={0}
              value={paid || ""}
              onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))}
              className="w-28 h-9 rounded-md bg-background border border-primary/40 px-2 text-end font-bold"
            />
          </div>
          {change > 0 && (
            <div className="flex items-center justify-between text-sm text-success font-semibold">
              <span>{t("pos.change")}</span>
              <span>{formatDZD(change)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
              {t("pos.auto_print")}
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPrintSize("thermal")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${printSize === "thermal" ? "bg-primary/20 border-primary text-primary" : "border-border/50 text-muted-foreground"}`}
              >
                80mm
              </button>
              <button
                onClick={() => setPrintSize("a4")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${printSize === "a4" ? "bg-primary/20 border-primary text-primary" : "border-border/50 text-muted-foreground"}`}
              >
                A4
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <NeonButton
              variant="ghost"
              onClick={() => void checkout("debt", 0)}
              disabled={submitting || items.length === 0}
            >
              <CreditCard className="h-4 w-4" /> {t("invoices.pay_debt")}
            </NeonButton>
            <NeonButton
              variant="primary"
              onClick={() => void checkout("paid", total)}
              disabled={submitting || items.length === 0}
            >
              <Banknote className="h-4 w-4" /> {t("pos.pay_now")}
            </NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
        active
          ? "bg-primary text-primary-foreground border-primary neon-glow"
          : "bg-card/60 border-border/50 text-muted-foreground hover:border-primary/60 hover:text-foreground"
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
