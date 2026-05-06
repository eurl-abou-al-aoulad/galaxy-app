/**
 * /m — تطبيق الهاتف (PWA)
 * يتصل بـ Supabase الخارجي للمستخدم عبر كود التفعيل + كود المتحكم
 * صلاحيات اطلاع وتعديل كاملة
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  KeyRound, LogIn, LogOut, RefreshCw, Package, FileText, Wallet, Users,
  CreditCard, Truck, BarChart3, Search, ArrowLeft, Cloud, ScanLine,
} from "lucide-react";
import { scanBarcodeWithCamera, isNativeApp } from "@/lib/cameraBarcode";
import {
  loginToMobile, getMobileSession, clearMobileSession, loadMobileData,
  type MobileDataType, type MobileSession,
} from "@/lib/externalSync";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";

export const Route = createFileRoute("/m")({
  component: MobileExternalApp,
});

type View = "login" | "home" | "products" | "invoices" | "debts";

const TABS: { key: View; icon: typeof Package; label: string; type?: MobileDataType }[] = [
  { key: "products", icon: Package, label: "المخزون", type: "products" },
  { key: "invoices", icon: FileText, label: "الفواتير", type: "invoices" },
  { key: "debts", icon: CreditCard, label: "الديون", type: "debts" },
];

export function MobileExternalApp() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [view, setView] = useState<View>("login");

  useEffect(() => {
    // force mobile body
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "ar");
    document.body.style.minWidth = "0";
    document.body.classList.add("dark");
    const s = getMobileSession();
    if (s) {
      setSession(s);
      setView("home");
    }
  }, []);

  const handleLogout = () => {
    clearMobileSession();
    setSession(null);
    setView("login");
    toast.success("تم تسجيل الخروج");
  };

  if (!session || view === "login") {
    return <LoginScreen onLogin={(s) => { setSession(s); setView("home"); }} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ minWidth: 0 }}>
      <header className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        {view !== "home" && (
          <button onClick={() => setView("home")} className="p-2 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">المتجر</div>
          <div className="font-bold truncate">{session.shopName ?? "متجري"}</div>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive" title="خروج">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="p-4 pb-20">
        {view === "home" && <HomeView session={session} onOpen={setView} />}
        {view !== "home" && (
          <DataView
            view={view}
            type={TABS.find((t) => t.key === view)?.type ?? "products"}
            label={TABS.find((t) => t.key === view)?.label ?? ""}
          />
        )}
      </main>
    </div>
  );
}

// ============== شاشة الدخول ==============
function LoginScreen({ onLogin }: { onLogin: (s: MobileSession) => void }) {
  const [licenseCode, setLicenseCode] = useState("");
  const [controlCode, setControlCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseCode.trim() || !controlCode.trim()) {
      toast.error("أدخل كود التفعيل وكود المتحكم");
      return;
    }
    setBusy(true);
    try {
      const res = await loginToMobile(licenseCode, controlCode);
      if (!res.ok) {
        toast.error(res.error ?? "فشل تسجيل الدخول");
        return;
      }
      toast.success("تم الدخول بنجاح");
      const s = getMobileSession();
      if (s) onLogin(s);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="gateway-bg min-h-screen flex items-center justify-center px-4 py-8"
      style={{ minWidth: 0 }}
    >
      <div className="w-full max-w-sm space-y-5">
        {/* الشعار + العنوان — نفس هوية شاشة التفعيل في البرنامج */}
        <div className="flex flex-col items-center gap-3">
          <GalaxyLogo size="lg" />
          <h1 className="text-2xl font-bold text-gradient-galaxy text-center">
            تطبيق الهاتف
          </h1>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            أدخل كود التفعيل وكود المتحكم لربط هاتفك بالمحل
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-card rounded-2xl p-6 border border-border/40 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              كود التفعيل
            </label>
            <input
              value={licenseCode}
              onChange={(e) => setLicenseCode(e.target.value.toUpperCase())}
              placeholder="GLXY-XXXX-XXXX-XXXX"
              dir="ltr"
              className="w-full h-12 px-3 rounded-xl bg-input/60 border border-border focus:border-primary outline-none font-mono text-center tracking-wider transition-colors"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-accent" />
              كود المتحكم
            </label>
            <input
              type="password"
              value={controlCode}
              onChange={(e) => setControlCode(e.target.value)}
              placeholder="••••••"
              className="w-full h-12 px-3 rounded-xl bg-input/60 border border-border focus:border-primary outline-none font-mono text-lg text-center tracking-widest transition-colors"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              الافتراضي: <code className="font-mono text-foreground/80">admin</code> — يتغيّر تلقائياً عند تغيير كلمة مرور المسؤول في البرنامج.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-primary via-primary-glow to-accent text-primary-foreground font-bold flex items-center justify-center gap-2 neon-glow disabled:opacity-50 transition-opacity"
          >
            {busy ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="h-5 w-5" />
            )}
            {busy ? "جاري التحقق..." : "اقتران ومزامنة"}
          </button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-2">
          🔒 بياناتك مشفّرة AES-256. السيرفر لا يستطيع قراءتها بدون كلمة المرور.
        </p>
      </div>
    </div>
  );
}

// ============== الشاشة الرئيسية ==============
function HomeView({ session, onOpen }: { session: MobileSession; onOpen: (v: View) => void }) {
  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="text-xs text-muted-foreground">آخر دخول</div>
        <div className="text-sm">{new Date(session.loggedAt).toLocaleString("ar-DZ")}</div>
        <div className="text-xs text-muted-foreground mt-2">كود التفعيل</div>
        <code className="text-xs font-mono break-all">{session.licenseCode}</code>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => onOpen(t.key)}
              className="glass-card rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/40 active:scale-95 transition"
            >
              <Icon className="h-7 w-7 text-primary" />
              <span className="font-bold text-sm">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============== عرض البيانات ==============
function DataView({ type, label }: { view: View; type: MobileDataType; label: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await loadMobileData([type]);
      setItems(data[type] ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [type]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) =>
      JSON.stringify(it).toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold flex-1">{label} ({items.length})</h2>
        <button onClick={load} className="p-2 rounded-lg bg-primary/20 text-primary" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث..."
            className="w-full h-11 ps-10 pe-3 rounded-xl bg-input border border-border focus:border-primary outline-none"
          />
        </div>
        {type === "products" && (
          <button
            type="button"
            onClick={async () => {
              const r = await scanBarcodeWithCamera();
              if (r.ok && r.value) {
                setSearch(r.value);
                toast.success(`📷 ${r.value}`);
              } else if (r.error === "unsupported_browser") {
                toast.info("استخدم تطبيق الهاتف لمسح الباركود بالكاميرا");
              } else if (r.error === "permission_denied") {
                toast.error("لم يُسمح بالكاميرا");
              } else if (r.error && r.error !== "no_barcode" && r.error !== "timeout") {
                toast.error(r.error);
              }
            }}
            className="h-11 px-3 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center gap-1"
            title={isNativeApp() ? "مسح بالكاميرا" : "مسح (متصفح)"}
          >
            <ScanLine className="h-5 w-5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {items.length === 0 ? "لا توجد بيانات. ارفع البيانات من البرنامج المكتبي أولاً." : "لا نتائج للبحث"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, idx) => (
            <ItemCard key={idx} item={item} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, type }: { item: any; type: MobileDataType }) {
  const formatMoney = (n: number) => `${(n ?? 0).toLocaleString("ar-DZ")} د.ج`;

  if (type === "products") {
    return (
      <div className="glass-card rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold flex-1 truncate">{item.name}</div>
          <div className={`text-xs px-2 py-0.5 rounded-full ${item.quantity <= (item.minStock ?? 0) ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"}`}>
            {item.quantity} {item.unit ?? ""}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{item.barcode}</span>
          <span className="font-bold text-primary">{formatMoney(item.sellingPrice)}</span>
        </div>
      </div>
    );
  }
  if (type === "invoices") {
    return (
      <div className="glass-card rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm">#{item.invoiceNumber}</div>
          <div className="font-bold text-primary">{formatMoney(item.total)}</div>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex justify-between">
          <span>{item.customerName ?? "نقدي"}</span>
          <span>{new Date(item.createdAt).toLocaleDateString("ar-DZ")}</span>
        </div>
      </div>
    );
  }
  if (type === "debts") {
    return (
      <div className="glass-card rounded-xl p-3 border-warning/30">
        <div className="flex items-center justify-between">
          <div className="font-bold">{item.customerName}</div>
          <div className="font-bold text-warning">{formatMoney(item.remainingAmount)}</div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{item.customerPhone}</div>
      </div>
    );
  }
  if (type === "expenses") {
    return (
      <div className="glass-card rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm flex-1 truncate">{item.description}</div>
          <div className="font-bold text-destructive">{formatMoney(item.amount)}</div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{item.category}</div>
      </div>
    );
  }
  if (type === "customers" || type === "suppliers") {
    return (
      <div className="glass-card rounded-xl p-3">
        <div className="font-bold">{item.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{item.phone} · {item.address ?? ""}</div>
      </div>
    );
  }
  return (
    <div className="glass-card rounded-xl p-3">
      <pre className="text-xs overflow-auto">{JSON.stringify(item, null, 2)}</pre>
    </div>
  );
}
