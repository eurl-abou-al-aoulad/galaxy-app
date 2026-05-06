/**
 * /mobile — واجهة الهاتف المخصصة (PWA-friendly)
 * شاشات: ملخص اليوم، بيع سريع، إضافة منتج، استرداد نسخة، إشعارات.
 * كل العمليات محلية على Dexie — تعمل offline.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import {
  Home, ShoppingCart, PackagePlus, RotateCcw, Bell, BellOff, Trash2, Plus, Minus,
  TrendingUp, AlertTriangle, ChevronLeft, Check, Cloud, CloudOff, RefreshCw, KeyRound,
} from "lucide-react";
import {
  db, ALL_SECTIONS, type SectionId, type ProductRecord, nextInvoiceNumber, logAudit,
} from "@/lib/db";
import { useApp } from "@/contexts/AppContext";
import { restoreFromEncryptedFile } from "@/lib/cloudSync";
import {
  pushSupported, pushPermission, requestPushPermission,
  startMobilePushWatcher, manualPushTest,
} from "@/lib/mobilePush";
import { buildSnapshot, generateAlerts, type Alert } from "@/lib/analyticsEngine";
import {
  syncNow, pullRemoteChanges, getRemoteSyncStatus, verifyRemoteCredentials, setMobilePairingSessionVerified, type RemoteSyncStatus,
} from "@/lib/cloudSyncRemote";
import { markActivated } from "@/lib/activation";
import { MobileExternalApp } from "./m";

export const Route = createFileRoute("/mobile")({
  component: MobileExternalApp,
});

type Tab = "home" | "sell" | "add" | "restore" | "alerts" | "sync";

const SECTION_LABELS_AR: Record<SectionId, string> = {
  clothing: "ملابس", supermarket: "سوبرماركت", hardware: "أدوات", repair: "صيانة", factory: "مصنع",
};
const SECTION_LABELS_EN: Record<SectionId, string> = {
  clothing: "Clothing", supermarket: "Market", hardware: "Hardware", repair: "Repair", factory: "Factory",
};

export function MobileApp() {
  const { lang, theme } = useApp();
  const [tab, setTab] = useState<Tab>("home");
  const [section, setSection] = useState<SectionId>("supermarket");
  const [sessionVerified, setSessionVerified] = useState(false);
  const SL = lang === "ar" ? SECTION_LABELS_AR : SECTION_LABELS_EN;

  // 📱 إجبار الجسم على وضع الهاتف — يتجاوز قاعدة min-width:1024px في styles.css
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBodyMinW = body.style.minWidth;
    const prevBodyOverflow = body.style.overflowX;
    const prevHtmlMinW = html.style.minWidth;
    body.style.minWidth = "0";
    body.style.overflowX = "hidden";
    html.style.minWidth = "0";
    body.classList.add("is-mobile-route");
    // ضبط viewport meta للهاتف (مفيد إن لم يكن مضبوطاً)
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const prevContent = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
    return () => {
      body.style.minWidth = prevBodyMinW;
      body.style.overflowX = prevBodyOverflow;
      html.style.minWidth = prevHtmlMinW;
      body.classList.remove("is-mobile-route");
      if (meta && prevContent !== undefined) meta.content = prevContent;
    };
  }, []);

  // حالة الاقتران: نتأكد أن الجهاز مرتبط بكود ترخيص + كلمة مرور
  const activation = useLiveQuery(() => db.activation.get(1), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const hasStoredPairing = !!(activation?.activated && activation.activationCode && settings?.adminPassword);
  const isPaired = hasStoredPairing && sessionVerified;

  useEffect(() => {
    return () => setMobilePairingSessionVerified(false);
  }, []);

  // تشغيل الإشعارات + سحب فوري عند الاقتران
  useEffect(() => {
    if (!isPaired) return;
    if (pushPermission() === "granted") {
      startMobilePushWatcher([...ALL_SECTIONS], lang);
    }
    void pullRemoteChanges();
  }, [lang, isPaired]);

  // الاستماع لإلغاء الترخيص من طرف المالك → فك الاقتران فوراً
  useEffect(() => {
    const onRevoked = (e: Event) => {
      const detail = (e as CustomEvent).detail as { reason?: string } | undefined;
      setMobilePairingSessionVerified(false);
      setSessionVerified(false);
      const reason = detail?.reason ?? "revoked";
      const msg = lang === "ar"
        ? (reason === "expired" ? "انتهت صلاحية الترخيص — يلزم تفعيل جديد" :
           reason === "invalid_code" ? "تم حذف هذا الترخيص — تواصل مع المالك" :
           "تم إلغاء الترخيص من طرف المالك")
        : (reason === "expired" ? "License expired — new activation required" :
           reason === "invalid_code" ? "License removed — contact the owner" :
           "License revoked by owner");
      toast.error(msg, { duration: 6000 });
    };
    window.addEventListener("galaxy:license-revoked", onRevoked);
    return () => window.removeEventListener("galaxy:license-revoked", onRevoked);
  }, [lang]);

  // فحص دوري لصلاحية الترخيص (كل دقيقتين) — يكشف الحذف من طرف المالك
  useEffect(() => {
    if (!isPaired) return;
    const check = () => { void pullRemoteChanges(); };
    const id = setInterval(check, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [isPaired]);

  // شاشة الاقتران الأولية
  if (!isPaired) {
    return <PairingScreen lang={lang} theme={theme} onPaired={() => setSessionVerified(true)} />;
  }

  return (
    <div className={`mobile-shell ${theme}`} dir={lang === "ar" ? "rtl" : "ltr"}>
      <style>{`
        .mobile-shell { min-height: 100vh; width:min(100%,430px); margin:0 auto; background: #0b0b1f; color: #fff;
          padding-bottom: calc(72px + env(safe-area-inset-bottom));
          padding-top: env(safe-area-inset-top); }
        .m-header { padding: 14px 16px 8px; display:flex; align-items:center; justify-content:space-between; }
        .m-title { font-weight: 800; font-size: 18px; letter-spacing: 0.5px;
          background: linear-gradient(90deg,#a78bfa,#22d3ee); -webkit-background-clip: text;
          -webkit-text-fill-color: transparent; background-clip: text; }
        .m-back { background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 8px 10px; color:#fff; display:inline-flex; align-items:center; gap:6px; font-size:13px; }
        .m-card { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 14px; }
        .m-input { width:100%; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 12px 14px; color:#fff; font-size: 15px; outline:none; }
        .m-input:focus { border-color:#a78bfa; }
        .m-btn { width:100%; background: linear-gradient(90deg,#7c3aed,#06b6d4); color:#fff;
          border-radius:14px; padding: 14px; font-weight:700; font-size:15px; border:none;
          box-shadow: 0 8px 24px -8px rgba(124,58,237,0.6); }
        .m-btn:disabled { opacity:.5; box-shadow:none; }
        .m-btn-ghost { background: rgba(255,255,255,0.06); color:#fff; border:1px solid rgba(255,255,255,0.1);
          border-radius:12px; padding: 10px 12px; font-size:14px; }
        .m-tabs { position: fixed; bottom: 0; left:50%; right:auto; transform:translateX(-50%); width:min(100%,430px); background: rgba(11,11,31,0.92);
          backdrop-filter: blur(12px); border-top:1px solid rgba(255,255,255,0.08);
          padding: 8px env(safe-area-inset-right) calc(8px + env(safe-area-inset-bottom)) env(safe-area-inset-left);
          display: grid; grid-template-columns: repeat(5, 1fr); gap:4px; z-index:50; }
        .m-tab { display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 4px;
          color:#9ca3af; font-size:11px; border-radius:10px; background:none; border:none; }
        .m-tab.active { color:#fff; background: rgba(167,139,250,0.15); }
        .m-stat { display:flex; flex-direction:column; gap:4px; padding:12px;
          background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; }
        .m-stat-v { font-size:18px; font-weight:800; }
        .m-stat-l { font-size:11px; color:#9ca3af; }
        .m-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06); }
        .m-row:last-child { border-bottom: none; }
        .m-chip { padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1); font-size:12px; color:#e5e7eb; }
        .m-chip.active { background: rgba(167,139,250,0.2); border-color:#a78bfa; color:#fff; }
        .qty-btn { width:32px; height:32px; border-radius:8px; background: rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,0.12); color:#fff; display:inline-flex; align-items:center; justify-content:center; }
      `}</style>

      <header className="m-header">
        <Link to="/home" className="m-back">
          <ChevronLeft size={16} />
          {lang === "ar" ? "الرئيسية" : "Home"}
        </Link>
        <div className="m-title">GALAXY MOBILE</div>
        <div style={{ width: 70 }} />
      </header>

      {/* اختيار القسم */}
      <div style={{ padding: "0 12px 4px", display: "flex", gap: 6, overflowX: "auto" }}>
        {ALL_SECTIONS.map((s) => (
          <button
            key={s}
            className={`m-chip ${section === s ? "active" : ""}`}
            onClick={() => setSection(s)}
          >
            {SL[s]}
          </button>
        ))}
      </div>

      <main style={{ padding: "12px 14px 24px" }}>
        {tab === "home" && <HomeTab section={section} lang={lang} />}
        {tab === "sell" && <SellTab section={section} lang={lang} />}
        {tab === "add" && <AddTab section={section} lang={lang} />}
        {tab === "restore" && <RestoreTab lang={lang} />}
        {tab === "alerts" && <AlertsTab section={section} lang={lang} />}
        {tab === "sync" && <SyncTab lang={lang} />}
      </main>

      <nav className="m-tabs" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <TabBtn icon={<Home size={20} />} label={lang === "ar" ? "الرئيسية" : "Home"} active={tab === "home"} onClick={() => setTab("home")} />
        <TabBtn icon={<ShoppingCart size={20} />} label={lang === "ar" ? "بيع" : "Sell"} active={tab === "sell"} onClick={() => setTab("sell")} />
        <TabBtn icon={<PackagePlus size={20} />} label={lang === "ar" ? "إضافة" : "Add"} active={tab === "add"} onClick={() => setTab("add")} />
        <TabBtn icon={<Cloud size={20} />} label={lang === "ar" ? "مزامنة" : "Sync"} active={tab === "sync"} onClick={() => setTab("sync")} />
        <TabBtn icon={<Bell size={20} />} label={lang === "ar" ? "تنبيهات" : "Alerts"} active={tab === "alerts"} onClick={() => setTab("alerts")} />
        <TabBtn icon={<RotateCcw size={20} />} label={lang === "ar" ? "استرداد" : "Restore"} active={tab === "restore"} onClick={() => setTab("restore")} />
      </nav>
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`m-tab ${active ? "active" : ""}`} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

// ============ Home Tab ============

function HomeTab({ section, lang }: { section: SectionId; lang: "ar" | "en" | "fr" }) {
  const [snap, setSnap] = useState<Awaited<ReturnType<typeof buildSnapshot>> | null>(null);
  useEffect(() => {
    let stopped = false;
    void buildSnapshot(section).then((s) => { if (!stopped) setSnap(s); });
    let t: ReturnType<typeof setInterval> | null = null;
    const tick = () => { if (!document.hidden) void buildSnapshot(section).then((s) => { if (!stopped) setSnap(s); }); };
    t = setInterval(tick, 60_000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; if (t) clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [section]);

  const fmt = (n: number) => `${Math.round(n).toLocaleString()} ${lang === "ar" ? "دج" : "DZD"}`;

  if (!snap) return <div className="m-card">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat l={lang === "ar" ? "مبيعات اليوم" : "Sales Today"} v={fmt(snap.totalSalesToday)} />
        <Stat l={lang === "ar" ? "مبيعات الشهر" : "Sales Month"} v={fmt(snap.totalSalesMonth)} />
        <Stat l={lang === "ar" ? "ربح الشهر" : "Profit Month"} v={fmt(snap.totalProfitMonth)} />
        <Stat l={lang === "ar" ? "الديون" : "Debts"} v={fmt(snap.totalDebts)} />
        <Stat l={lang === "ar" ? "قيمة المخزون" : "Inventory"} v={fmt(snap.inventoryValue)} />
        <Stat l={lang === "ar" ? "المنتجات" : "Products"} v={String(snap.productsCount)} />
      </div>

      <div className="m-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <TrendingUp size={16} color="#a78bfa" />
          <strong>{lang === "ar" ? "الأكثر مبيعاً" : "Top Sellers"}</strong>
        </div>
        {snap.topSellers.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{lang === "ar" ? "لا بيانات بعد" : "No data yet"}</div>
        ) : snap.topSellers.slice(0, 5).map((p) => (
          <div className="m-row" key={p.name}>
            <span style={{ fontSize: 14 }}>{p.name}</span>
            <span style={{ fontSize: 13, color: "#a78bfa" }}>{p.qty} × {fmt(p.revenue)}</span>
          </div>
        ))}
      </div>

      {snap.lowStock.length > 0 && (
        <div className="m-card" style={{ borderColor: "rgba(251,191,36,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={16} color="#fbbf24" />
            <strong>{lang === "ar" ? "مخزون منخفض" : "Low Stock"}</strong>
          </div>
          {snap.lowStock.slice(0, 5).map((p) => (
            <div className="m-row" key={p.name}>
              <span style={{ fontSize: 14 }}>{p.name}</span>
              <span style={{ fontSize: 13, color: "#fbbf24" }}>{p.qty} / {p.min}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="m-stat">
      <div className="m-stat-l">{l}</div>
      <div className="m-stat-v">{v}</div>
    </div>
  );
}

// ============ Sell Tab (بيع سريع) ============

interface CartItem { product: ProductRecord; qty: number }

function SellTab({ section, lang }: { section: SectionId; lang: "ar" | "en" | "fr" }) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);

  const products = useLiveQuery(
    () => db.products.where("section").equals(section).limit(200).toArray(),
    [section],
  );

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [products, search]);

  const total = cart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0);

  const addToCart = (p: ProductRecord) => {
    setCart((c) => {
      const ex = c.find(x => x.product.id === p.id);
      if (ex) return c.map(x => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { product: p, qty: 1 }];
    });
  };
  const changeQty = (id: number, delta: number) => {
    setCart((c) => c.map(x => x.product.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  };
  const remove = (id: number) => setCart((c) => c.filter(x => x.product.id !== id));

  const checkout = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      // تحقّق من المخزون
      for (const it of cart) {
        if (it.product.quantity < it.qty) {
          toast.error(lang === "ar"
            ? `الكمية غير متوفرة: ${it.product.name}`
            : `Insufficient stock: ${it.product.name}`);
          setBusy(false);
          return;
        }
      }
      const number = await nextInvoiceNumber(section, "ticket");
      const items = cart.map((c) => ({
        productId: c.product.id!,
        barcode: c.product.barcode,
        name: c.product.name,
        unit: c.product.unit,
        quantity: c.qty,
        purchasePrice: c.product.purchasePrice,
        sellingPrice: c.product.sellingPrice,
        discount: 0,
        total: c.product.sellingPrice * c.qty,
      }));
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const now = Date.now();
      await db.transaction("rw", [db.invoices, db.products, db.auditLog], async () => {
        await db.invoices.add({
          section, invoiceNumber: number, type: "ticket",
          customerId: null, customerName: lang === "ar" ? "زبون عابر" : "Walk-in",
          customerPhone: "",
          items, subtotal, discount: 0, tva: 0, stamp: 0, shipping: 0, labor: 0,
          total: subtotal, paid: subtotal, remaining: 0,
          status: "paid", paymentMethod: "cash", notes: lang === "ar" ? "بيع من تطبيق الهاتف" : "Mobile sale",
          printSize: "thermal", createdAt: now, updatedAt: now, createdBy: "mobile",
        });
        for (const c of cart) {
          await db.products.update(c.product.id!, {
            quantity: c.product.quantity - c.qty, updatedAt: now,
          });
        }
      });
      await logAudit({ section, action: "create_invoice", module: "mobile", user: "mobile",
        details: `Mobile sale ${number} — total ${subtotal}` });
      toast.success(lang === "ar" ? `✓ تم البيع — ${number}` : `✓ Sold — ${number}`);
      setCart([]);
      setSearch("");
    } catch (e) {
      toast.error(lang === "ar" ? "فشل إتمام البيع" : "Sale failed");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        className="m-input"
        placeholder={lang === "ar" ? "ابحث باسم أو باركود..." : "Search name or barcode..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* قائمة المنتجات */}
      <div className="m-card" style={{ maxHeight: 240, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af", padding: 8 }}>
            {lang === "ar" ? "لا توجد منتجات" : "No products"}
          </div>
        ) : filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            style={{ width: "100%", textAlign: lang === "ar" ? "right" : "left", padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)", background: "none", border: "none", color: "#fff",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.barcode} · {p.quantity} {p.unit}</div>
            </div>
            <div style={{ fontSize: 13, color: "#22d3ee", fontWeight: 700 }}>
              {Math.round(p.sellingPrice).toLocaleString()}
            </div>
          </button>
        ))}
      </div>

      {/* السلة */}
      {cart.length > 0 && (
        <div className="m-card">
          <strong style={{ fontSize: 14 }}>{lang === "ar" ? "السلة" : "Cart"}</strong>
          {cart.map((c) => (
            <div className="m-row" key={c.product.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.product.name}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {Math.round(c.product.sellingPrice).toLocaleString()} × {c.qty} = {Math.round(c.product.sellingPrice * c.qty).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button className="qty-btn" onClick={() => changeQty(c.product.id!, -1)}><Minus size={14} /></button>
                <span style={{ minWidth: 24, textAlign: "center", fontSize: 14 }}>{c.qty}</span>
                <button className="qty-btn" onClick={() => changeQty(c.product.id!, 1)}><Plus size={14} /></button>
                <button className="qty-btn" onClick={() => remove(c.product.id!)} style={{ marginInlineStart: 4 }}>
                  <Trash2 size={14} color="#f87171" />
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontWeight: 700 }}>{lang === "ar" ? "الإجمالي" : "Total"}</span>
            <span style={{ fontWeight: 800, color: "#22d3ee", fontSize: 18 }}>
              {Math.round(total).toLocaleString()} {lang === "ar" ? "دج" : "DZD"}
            </span>
          </div>
          <button className="m-btn" style={{ marginTop: 12 }} onClick={checkout} disabled={busy}>
            {busy ? "..." : lang === "ar" ? "✓ إتمام البيع نقداً" : "✓ Complete Sale (Cash)"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============ Add Product Tab ============

function AddTab({ section, lang }: { section: SectionId; lang: "ar" | "en" | "fr" }) {
  const [form, setForm] = useState({
    name: "", barcode: "", category: "", unit: lang === "ar" ? "قطعة" : "piece",
    purchasePrice: "", sellingPrice: "", quantity: "", minStock: "5",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.sellingPrice) {
      toast.error(lang === "ar" ? "الاسم والسعر مطلوبان" : "Name and price required");
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const barcode = form.barcode.trim() || `MOB-${now}`;
      await db.products.add({
        section, barcode, name: form.name.trim(),
        category: form.category.trim() || (lang === "ar" ? "عام" : "General"),
        unit: form.unit,
        purchasePrice: Number(form.purchasePrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        quantity: Number(form.quantity) || 0,
        minStock: Number(form.minStock) || 5,
        createdAt: now, updatedAt: now,
      });
      await logAudit({ section, action: "create_product", module: "mobile", user: "mobile",
        details: `Mobile add product ${form.name}` });
      toast.success(lang === "ar" ? "✓ تمت إضافة المنتج" : "✓ Product added");
      setForm({ name: "", barcode: "", category: "", unit: form.unit,
        purchasePrice: "", sellingPrice: "", quantity: "", minStock: "5" });
    } catch (e) {
      toast.error(lang === "ar" ? "فشل الحفظ" : "Save failed");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const F = (k: keyof typeof form, ph: string, type = "text") => (
    <input className="m-input" placeholder={ph} type={type} value={form[k]}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      style={{ marginBottom: 10 }} />
  );

  return (
    <div className="m-card" style={{ display: "grid", gap: 0 }}>
      {F("name", lang === "ar" ? "اسم المنتج *" : "Product name *")}
      {F("barcode", lang === "ar" ? "الباركود (اختياري)" : "Barcode (optional)")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <input className="m-input" placeholder={lang === "ar" ? "الفئة" : "Category"}
          value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input className="m-input" placeholder={lang === "ar" ? "الوحدة" : "Unit"}
          value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <input className="m-input" placeholder={lang === "ar" ? "سعر الشراء" : "Purchase"}
          type="number" value={form.purchasePrice}
          onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
        <input className="m-input" placeholder={lang === "ar" ? "سعر البيع *" : "Sell price *"}
          type="number" value={form.sellingPrice}
          onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <input className="m-input" placeholder={lang === "ar" ? "الكمية" : "Quantity"}
          type="number" value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input className="m-input" placeholder={lang === "ar" ? "حد التنبيه" : "Min stock"}
          type="number" value={form.minStock}
          onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
      </div>
      <button className="m-btn" onClick={submit} disabled={busy}>
        <Check size={16} style={{ display: "inline", marginInlineEnd: 6 }} />
        {busy ? "..." : lang === "ar" ? "حفظ المنتج" : "Save Product"}
      </button>
    </div>
  );
}

// ============ Restore Tab ============

function RestoreTab({ lang }: { lang: "ar" | "en" | "fr" }) {
  const [file, setFile] = useState<File | null>(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (!file || !pwd) {
      toast.error(lang === "ar" ? "اختر ملفاً وأدخل كلمة المرور" : "Pick file and enter password");
      return;
    }
    if (!confirm(lang === "ar"
      ? "⚠️ سيتم استبدال جميع البيانات الحالية. متابعة؟"
      : "⚠️ This will replace ALL current data. Continue?")) return;

    setBusy(true);
    const r = await restoreFromEncryptedFile(file, pwd);
    setBusy(false);
    if (r.ok) {
      toast.success(lang === "ar" ? "✓ تم الاسترداد بنجاح" : "✓ Restored successfully");
      setFile(null); setPwd("");
    } else {
      toast.error(r.error === "wrong_password"
        ? (lang === "ar" ? "كلمة المرور خاطئة" : "Wrong password")
        : (lang === "ar" ? "فشل الاسترداد: " : "Restore failed: ") + (r.error ?? ""));
    }
  };

  return (
    <div className="m-card" style={{ display: "grid", gap: 12 }}>
      <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
        {lang === "ar"
          ? "اختر ملف نسخة احتياطية بصيغة .galaxy.enc وأدخل كلمة مرور المتحكم لاستعادة البيانات."
          : "Pick a .galaxy.enc backup file and enter the manager password to restore."}
      </p>
      <label className="m-btn-ghost" style={{ display: "block", textAlign: "center", cursor: "pointer" }}>
        {file ? file.name : (lang === "ar" ? "اختر ملف النسخة" : "Choose backup file")}
        <input type="file" accept=".enc,.galaxy.enc" style={{ display: "none" }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <input className="m-input" type="password" placeholder={lang === "ar" ? "كلمة مرور المتحكم" : "Manager password"}
        value={pwd} onChange={(e) => setPwd(e.target.value)} />
      <button className="m-btn" onClick={restore} disabled={busy || !file || !pwd}>
        <RotateCcw size={16} style={{ display: "inline", marginInlineEnd: 6 }} />
        {busy ? "..." : lang === "ar" ? "استرداد البيانات" : "Restore Data"}
      </button>
    </div>
  );
}

// ============ Alerts Tab ============

function AlertsTab({ section, lang }: { section: SectionId; lang: "ar" | "en" | "fr" }) {
  const [perm, setPerm] = useState(pushPermission());
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    void buildSnapshot(section).then((s) => setAlerts(generateAlerts(s, lang)));
    const t = setInterval(() => {
      void buildSnapshot(section).then((s) => setAlerts(generateAlerts(s, lang)));
    }, 60_000);
    return () => clearInterval(t);
  }, [section, lang]);

  const enable = async () => {
    const p = await requestPushPermission();
    setPerm(p);
    if (p === "granted") {
      startMobilePushWatcher([...ALL_SECTIONS], lang);
      toast.success(lang === "ar" ? "✓ تم تفعيل الإشعارات" : "✓ Notifications enabled");
    } else if (p === "denied") {
      toast.error(lang === "ar" ? "تم رفض الإذن" : "Permission denied");
    } else if (p === "unsupported") {
      toast.error(lang === "ar" ? "المتصفح لا يدعم الإشعارات" : "Browser does not support notifications");
    }
  };

  const test = async () => {
    const ok = await manualPushTest(lang);
    if (!ok) toast.error(lang === "ar" ? "فعّل الإشعارات أولاً" : "Enable notifications first");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="m-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>
            {lang === "ar" ? "الإشعارات الفورية" : "Push Notifications"}
          </strong>
          {perm === "granted" ? <Bell size={18} color="#22d3ee" /> : <BellOff size={18} color="#9ca3af" />}
        </div>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 12px" }}>
          {perm === "granted"
            ? (lang === "ar" ? "مفعّلة — ستصلك تنبيهات عن المخزون والديون" : "Enabled — you'll get inventory and debt alerts")
            : (lang === "ar" ? "غير مفعّلة. فعّلها لاستقبال تنبيهات تلقائية على هاتفك." : "Disabled. Enable to receive automatic phone alerts.")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="m-btn-ghost" onClick={enable} disabled={perm === "granted" || perm === "unsupported"}>
            {perm === "granted" ? (lang === "ar" ? "✓ مفعّلة" : "✓ Enabled") : (lang === "ar" ? "تفعيل" : "Enable")}
          </button>
          <button className="m-btn-ghost" onClick={test}>
            {lang === "ar" ? "اختبار" : "Test"}
          </button>
        </div>
      </div>

      <div className="m-card">
        <strong style={{ fontSize: 14 }}>{lang === "ar" ? "تنبيهات حالية" : "Current Alerts"}</strong>
        {alerts.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af", padding: "10px 0" }}>
            {lang === "ar" ? "لا توجد تنبيهات — كل شيء على ما يرام ✓" : "No alerts — all good ✓"}
          </div>
        ) : alerts.slice(0, 10).map((a, i) => {
          const color = a.level === "danger" ? "#f87171" : a.level === "warning" ? "#fbbf24" : a.level === "success" ? "#34d399" : "#a78bfa";
          return (
            <div className="m-row" key={i} style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, lineHeight: "20px" }}>{a.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color }}>{a.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Pairing Screen (شاشة الاقتران الأولية) ============

function PairingScreen({
  lang,
  theme,
  onPaired,
}: {
  lang: "ar" | "en" | "fr";
  theme: "dark" | "light";
  onPaired: () => void;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePair = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedPwd = password.trim();
    if (!trimmedCode || !trimmedPwd) {
      toast.error(lang === "ar" ? "أدخل الكود وكلمة المرور" : "Enter code and password");
      return;
    }
    setBusy(true);
    try {
      toast.loading(lang === "ar" ? "جاري التحقق من الكود..." : "Verifying code...", { id: "pair" });
      const verified = await verifyRemoteCredentials(trimmedCode, trimmedPwd);
      if (!verified.ok) {
        toast.dismiss("pair");
        const msg: Record<string, string> = {
          invalid_code: lang === "ar" ? "كود التفعيل غير صحيح" : "Invalid activation code",
          wrong_password: lang === "ar" ? "كلمة مرور المتحكم لا تطابق الحاسوب" : "Admin password does not match desktop",
          not_registered: lang === "ar" ? "اضغط مزامنة الآن في برنامج الحاسوب أولاً" : "Run Sync Now on desktop first",
          expired: lang === "ar" ? "انتهت صلاحية الكود" : "Code expired",
          revoked: lang === "ar" ? "تم إلغاء الكود" : "Code revoked",
        };
        toast.error(msg[verified.error ?? ""] ?? (lang === "ar" ? "فشل التحقق من الربط" : "Pairing verification failed"));
        return;
      }
      await markActivated(trimmedCode);
      await db.settings.update(1, { adminPassword: trimmedPwd });
      setMobilePairingSessionVerified(true);
      toast.loading(lang === "ar" ? "تم التحقق، جاري سحب البيانات..." : "Verified, pulling data...", { id: "pair" });
      const res = await pullRemoteChanges();
      toast.dismiss("pair");
      if (res.ok) {
        onPaired();
        toast.success(
          lang === "ar"
            ? `✓ تم الاقتران — تم سحب ${res.count} عنصر`
            : `✓ Paired — pulled ${res.count} items`,
        );
      } else if (res.error === "offline") {
        toast.error(lang === "ar" ? "لا يمكن الاقتران بدون إنترنت" : "Cannot pair while offline");
      } else {
        toast.error(
          lang === "ar"
            ? "فشل سحب بيانات الحاسوب — لم يتم اعتماد الاقتران"
            : "Failed to pull desktop data — pairing was not saved",
        );
        setMobilePairingSessionVerified(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`mobile-shell ${theme}`} dir={lang === "ar" ? "rtl" : "ltr"}>
      <style>{`
        .pair-shell { min-height: 100svh; background: linear-gradient(180deg,#0b0b1f 0%, #1a1033 100%);
          color:#fff; padding: calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));
          display:flex; flex-direction:column; justify-content:center; gap:16px; }
        .pair-card { background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          border-radius: 18px; padding: 20px; backdrop-filter: blur(10px); }
        .pair-input { width:100%; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
          border-radius: 12px; padding: 14px; color:#fff; font-size: 15px; outline:none;
          font-family: 'SF Mono', Menlo, monospace; letter-spacing: 1px; }
        .pair-input:focus { border-color:#a78bfa; }
        .pair-btn { width:100%; background: linear-gradient(90deg,#7c3aed,#06b6d4); color:#fff;
          border-radius:14px; padding: 14px; font-weight:700; font-size:15px; border:none;
          box-shadow: 0 10px 30px -10px rgba(124,58,237,0.7); }
        .pair-btn:disabled { opacity:.5; }
        @media (max-width: 380px), (max-height: 720px) {
          .pair-shell { justify-content:flex-start; gap:12px; padding-inline:12px; }
          .pair-card { padding:16px; border-radius:16px; }
          .pair-input { padding:12px; font-size:14px; }
          .pair-btn { padding:12px; font-size:14px; }
        }
      `}</style>
      <div className="pair-shell">
        <div style={{ display: "flex", justifyContent: lang === "ar" ? "flex-start" : "flex-end" }}>
          <Link
            to="/home"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12, padding: "8px 12px", color: "#fff", fontSize: 13,
              textDecoration: "none",
            }}
          >
            <ChevronLeft size={16} />
            {lang === "ar" ? "خروج" : "Exit"}
          </Link>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, margin: "0 auto", borderRadius: 18,
            background: "linear-gradient(135deg,#7c3aed,#06b6d4)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 10px 30px -10px rgba(124,58,237,0.7)",
          }}>
            <KeyRound size={30} color="#fff" />
          </div>
          <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 800,
            background: "linear-gradient(90deg,#a78bfa,#22d3ee)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>GALAXY MOBILE</h1>
          <p style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>
            {lang === "ar" ? "اربط هاتفك بمحلّك" : "Pair your phone with your shop"}
          </p>
        </div>

        <div className="pair-card">
          <p style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 14, lineHeight: 1.55 }}>
            {lang === "ar"
              ? "أدخل نفس كود التفعيل وكلمة مرور المتحكم المستعملين في برنامج الحاسوب — سيتم سحب بيانات محلّك تلقائياً."
              : "Enter the same activation code and admin password used on the desktop app — your shop data will be pulled automatically."}
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, display: "block" }}>
                {lang === "ar" ? "كود التفعيل" : "Activation Code"}
              </label>
              <input
                className="pair-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="GLXY-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, display: "block" }}>
                {lang === "ar" ? "كلمة مرور المتحكم" : "Admin Password"}
              </label>
              <input
                className="pair-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button className="pair-btn" onClick={handlePair} disabled={busy}>
              {busy
                ? lang === "ar" ? "جاري الاقتران..." : "Pairing..."
                : lang === "ar" ? "🔗 اقتران ومزامنة" : "🔗 Pair & Sync"}
            </button>
          </div>
        </div>

        <p style={{ fontSize: 11, color: "#6b7280", textAlign: "center", lineHeight: 1.6 }}>
          {lang === "ar"
            ? "🔒 بياناتك مشفّرة AES-256. السيرفر لا يستطيع قراءتها بدون كلمة المرور."
            : "🔒 Your data is AES-256 encrypted. The server cannot read it without the password."}
        </p>
      </div>
    </div>
  );
}

// ============ Sync Tab (حالة المزامنة) ============

function SyncTab({ lang }: { lang: "ar" | "en" | "fr" }) {
  const [status, setStatus] = useState<RemoteSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStatus(await getRemoteSyncStatus());

  useEffect(() => {
    void refresh();
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(refresh, 15000); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    start();
    const onVis = () => (document.hidden ? stop() : (void refresh(), start()));
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  const handleSync = async () => {
    setBusy(true);
    try {
      const res = await syncNow();
      if (res.ok) {
        toast.success(
          lang === "ar"
            ? `✓ تم — رفع ${res.pushed} وسحب ${res.pulled}`
            : `✓ Done — pushed ${res.pushed}, pulled ${res.pulled}`,
        );
      } else if (res.error === "offline") {
        toast.error(lang === "ar" ? "أنت بدون إنترنت" : "You are offline");
      } else {
        toast.error(res.error ?? "sync failed");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleUnpair = async () => {
    if (!confirm(lang === "ar"
      ? "هل تريد فك الاقتران؟ ستحتاج إعادة إدخال الكود وكلمة المرور."
      : "Unpair this device? You will need to re-enter code and password.",
    )) return;
    await db.activation.update(1, { activated: 0, activationCode: null, lockReason: null });
    setMobilePairingSessionVerified(false);
    toast.success(lang === "ar" ? "تم فك الاقتران" : "Unpaired");
  };

  if (!status) return <div className="m-card">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>;

  const fmtTime = (t: number | null) => {
    if (!t) return lang === "ar" ? "لم يحدث بعد" : "Never";
    const diff = Date.now() - t;
    if (diff < 60_000) return lang === "ar" ? "الآن" : "Now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} ${lang === "ar" ? "د" : "min"}`;
    return new Date(t).toLocaleString(lang === "ar" ? "ar-DZ" : "en-US");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="m-card" style={{
        background: status.online
          ? "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))"
          : "linear-gradient(135deg, rgba(251,113,133,0.15), rgba(244,63,94,0.1))",
        borderColor: status.online ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {status.online ? <Cloud size={22} color="#10b981" /> : <CloudOff size={22} color="#f43f5e" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {status.online
                ? lang === "ar" ? "متصل بالسحابة" : "Cloud Connected"
                : lang === "ar" ? "بدون إنترنت" : "Offline"}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {status.online
                ? lang === "ar" ? "المزامنة فعّالة تلقائياً" : "Auto-sync active"
                : lang === "ar" ? "العمل أوفلاين — سيُزامَن عند الإنترنت" : "Working offline — will sync when online"}
            </div>
          </div>
        </div>
      </div>

      <div className="m-card">
        <div className="m-row">
          <span style={{ fontSize: 13, color: "#9ca3af" }}>{lang === "ar" ? "كود المحل" : "Shop code"}</span>
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "#a78bfa" }}>
            {status.licenseCode ?? "—"}
          </span>
        </div>
        <div className="m-row">
          <span style={{ fontSize: 13, color: "#9ca3af" }}>{lang === "ar" ? "في الانتظار" : "Pending"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: status.pendingCount > 0 ? "#fbbf24" : "#10b981" }}>
            {status.pendingCount} {lang === "ar" ? "عنصر" : "items"}
          </span>
        </div>
        <div className="m-row">
          <span style={{ fontSize: 13, color: "#9ca3af" }}>{lang === "ar" ? "آخر رفع" : "Last push"}</span>
          <span style={{ fontSize: 13 }}>{fmtTime(status.lastPushAt)}</span>
        </div>
        <div className="m-row">
          <span style={{ fontSize: 13, color: "#9ca3af" }}>{lang === "ar" ? "آخر سحب" : "Last pull"}</span>
          <span style={{ fontSize: 13 }}>{fmtTime(status.lastPullAt)}</span>
        </div>
      </div>

      <button className="m-btn" onClick={handleSync} disabled={busy || !status.online}>
        <RefreshCw size={16} style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-3px" }} />
        {busy
          ? lang === "ar" ? "جاري المزامنة..." : "Syncing..."
          : lang === "ar" ? "مزامنة الآن" : "Sync Now"}
      </button>

      <button className="m-btn-ghost" onClick={handleUnpair} style={{ width: "100%", marginTop: 4 }}>
        {lang === "ar" ? "فك الاقتران" : "Unpair this device"}
      </button>
    </div>
  );
}
