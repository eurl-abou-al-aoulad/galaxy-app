import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ShieldCheck, Plus, RotateCcw, Ban, Trash2, Calendar, Copy, Check,
  ArrowRight, Sparkles, Smartphone, X, RefreshCw, Search, Download,
  Pencil, AlertTriangle, Clock, Users, KeyRound, Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CloudMonitorPanel } from "@/components/galaxy/CloudMonitorPanel";

interface License {
  code: string;
  duration_days: number;
  device_id: string | null;
  device_name: string | null;
  activated_at: string | null;
  expires_at: string | null;
  status: "unused" | "active" | "expired" | "revoked";
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  ai_enabled: boolean;
  mobile_enabled: boolean;
  mobile_max_devices: number;
  created_at: string;
}

interface MobileSession {
  token: string;
  device_label: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-licenses`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = "__galaxy_owner_secret_v1";

const DURATION_PRESETS = [
  { label: "أسبوع", days: 7 },
  { label: "شهر", days: 30 },
  { label: "3 أشهر", days: 90 },
  { label: "6 أشهر", days: 180 },
  { label: "سنة", days: 365 },
  { label: "سنتين", days: 730 },
];

type StatusFilter = "all" | "unused" | "active" | "expired" | "revoked" | "expiring_soon";

export const Route = createFileRoute("/owner")({
  component: OwnerPage,
});

function OwnerPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // إنشاء
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(365);
  const [expiresOn, setExpiresOn] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [mobileEnabledNew, setMobileEnabledNew] = useState(false);
  const [mobileLimitNew, setMobileLimitNew] = useState(1);

  // تمديد
  const [extendTarget, setExtendTarget] = useState<{ code: string; currentExpiry: string | null; days: string } | null>(null);

  // إدارة الهاتف
  const [mobileTarget, setMobileTarget] = useState<License | null>(null);
  const [sessions, setSessions] = useState<MobileSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string>("");

  // تعديل بيانات
  const [editTarget, setEditTarget] = useState<License | null>(null);

  // فلترة وبحث
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiFilter, setAiFilter] = useState<"all" | "on" | "off">("all");
  const [mobileFilter, setMobileFilter] = useState<"all" | "on" | "off">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const call = useCallback(
    async (action: string, body?: Record<string, unknown>, method: "GET" | "POST" = "POST") => {
      const url = `${FN_URL}?action=${action}`;
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-owner-secret": secret,
          apikey: ANON,
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      return data;
    },
    [secret],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call("list", undefined, "GET");
      setLicenses(data.licenses ?? []);
      setSelected(new Set());
    } catch (e) {
      toast.error(`تعذّر التحميل: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    const stored = sessionStorage.getItem(SECRET_KEY);
    if (stored) setSecret(stored);
  }, []);

  useEffect(() => {
    if (authed) void refresh();
  }, [authed, refresh]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${FN_URL}?action=list`, {
        method: "GET",
        headers: { "x-owner-secret": secret, apikey: ANON },
      });
      if (!res.ok) throw new Error("كلمة سر غير صحيحة");
      sessionStorage.setItem(SECRET_KEY, secret);
      setAuthed(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    try {
      let durationDays = days;
      if (expiresOn) {
        const target = new Date(expiresOn + "T23:59:59");
        const diffMs = target.getTime() - Date.now();
        const computed = Math.ceil(diffMs / 86400000);
        if (computed < 1) {
          toast.error("تاريخ الانتهاء يجب أن يكون في المستقبل");
          return;
        }
        durationDays = computed;
      }
      if (!durationDays || durationDays < 1) {
        toast.error("يجب تحديد مدة صالحة (أيام أو تاريخ انتهاء)");
        return;
      }
      const data = await call("create", {
        count,
        duration_days: durationDays,
        customer_name: customer || null,
        customer_phone: phone || null,
        notes: notes || null,
        ai_enabled: aiEnabled,
        mobile_enabled: mobileEnabledNew,
        mobile_max_devices: mobileLimitNew,
      });
      const flags = [
        aiEnabled && "🤖 AI",
        mobileEnabledNew && `📱 ${mobileLimitNew === 0 ? "∞" : mobileLimitNew}`,
      ].filter(Boolean).join(" + ");
      toast.success(`✓ ${data.created.length} كود — ${durationDays} يوم${flags ? " — " + flags : ""}`);
      setCustomer(""); setPhone(""); setNotes(""); setExpiresOn("");
      setAiEnabled(false); setMobileEnabledNew(false); setMobileLimitNew(1);
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doAction = async (action: string, code: string, extra?: Record<string, unknown>) => {
    try {
      await call(action, { code, ...extra });
      toast.success("تم");
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const bulk = async (op: string, extra?: Record<string, unknown>) => {
    if (selected.size === 0) {
      toast.error("اختر أكواداً أولاً");
      return;
    }
    try {
      const data = await call("bulk", { op, codes: [...selected], ...extra });
      toast.success(`✓ تم تطبيق العملية على ${data.count ?? selected.size} كود`);
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const extendCustom = (code: string, currentExpiry: string | null) => {
    setExtendTarget({ code, currentExpiry, days: "30" });
  };

  // ====== هاتف ======
  const openMobilePanel = async (lic: License) => {
    setMobileTarget(lic);
    setEditingLimit(String(lic.mobile_max_devices));
    setSessionsLoading(true);
    try {
      const data = await call("list_sessions", { code: lic.code });
      setSessions(data.sessions ?? []);
    } catch (e) {
      toast.error((e as Error).message);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };
  const refreshSessions = async (code: string) => {
    setSessionsLoading(true);
    try {
      const data = await call("list_sessions", { code });
      setSessions(data.sessions ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSessionsLoading(false);
    }
  };
  const toggleMobile = async (lic: License) => {
    try {
      await call("set_mobile", { code: lic.code, mobile_enabled: !lic.mobile_enabled });
      toast.success(lic.mobile_enabled ? "تم تعطيل ربط الهاتف" : "تم تفعيل ربط الهاتف");
      void refresh();
      if (mobileTarget?.code === lic.code) {
        setMobileTarget({ ...lic, mobile_enabled: !lic.mobile_enabled });
        void refreshSessions(lic.code);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const saveLimit = async () => {
    if (!mobileTarget) return;
    const n = Number(editingLimit);
    if (!Number.isFinite(n) || n < 0) { toast.error("عدد غير صالح (0 = غير محدود)"); return; }
    try {
      await call("set_mobile_limit", { code: mobileTarget.code, mobile_max_devices: n });
      toast.success("تم حفظ الحد");
      setMobileTarget({ ...mobileTarget, mobile_max_devices: n });
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const revokeSession = async (token: string) => {
    if (!mobileTarget) return;
    try {
      await call("revoke_session", { token });
      toast.success("تم فصل الجلسة");
      void refreshSessions(mobileTarget.code);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ====== تعديل بيانات ======
  const saveMeta = async () => {
    if (!editTarget) return;
    try {
      await call("update_meta", {
        code: editTarget.code,
        customer_name: editTarget.customer_name,
        customer_phone: editTarget.customer_phone,
        notes: editTarget.notes,
      });
      toast.success("✓ تم تحديث البيانات");
      setEditTarget(null);
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1200);
  };

  const exportCSV = () => {
    const rows = filtered;
    const head = ["code","status","customer_name","customer_phone","device_name","activated_at","expires_at","ai_enabled","mobile_enabled","mobile_max_devices","notes","created_at"];
    const csv = [
      head.join(","),
      ...rows.map((l) => head.map((k) => {
        const v = (l as unknown as Record<string, unknown>)[k];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `licenses-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ====== إحصائيات + فلترة ======
  const stats = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400000;
    let active = 0, expired = 0, unused = 0, revoked = 0, expiringSoon = 0, ai = 0, mobile = 0;
    for (const l of licenses) {
      if (l.status === "active") active++;
      else if (l.status === "expired") expired++;
      else if (l.status === "unused") unused++;
      else if (l.status === "revoked") revoked++;
      if (l.ai_enabled) ai++;
      if (l.mobile_enabled) mobile++;
      if (l.expires_at && l.status === "active") {
        const ms = new Date(l.expires_at).getTime() - now;
        if (ms > 0 && ms < week) expiringSoon++;
      }
    }
    return { total: licenses.length, active, expired, unused, revoked, expiringSoon, ai, mobile };
  }, [licenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return licenses.filter((l) => {
      if (statusFilter === "expiring_soon") {
        if (!l.expires_at || l.status !== "active") return false;
        const ms = new Date(l.expires_at).getTime() - now;
        if (ms <= 0 || ms > 7 * 86400000) return false;
      } else if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (aiFilter === "on" && !l.ai_enabled) return false;
      if (aiFilter === "off" && l.ai_enabled) return false;
      if (mobileFilter === "on" && !l.mobile_enabled) return false;
      if (mobileFilter === "off" && l.mobile_enabled) return false;
      if (q) {
        const hay = [l.code, l.customer_name, l.customer_phone, l.device_name, l.notes]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [licenses, search, statusFilter, aiFilter, mobileFilter]);

  const toggleSelect = (code: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });
  };
  const selectAllVisible = () => {
    setSelected((p) => {
      const n = new Set(p);
      const allIn = filtered.every((l) => n.has(l.code));
      if (allIn) filtered.forEach((l) => n.delete(l.code));
      else filtered.forEach((l) => n.add(l.code));
      return n;
    });
  };

  if (!authed) {
    return (
      <div dir="rtl" className="gateway-bg min-h-screen flex items-center justify-center px-4">
        <form onSubmit={login} className="glass-card rounded-2xl p-6 w-full max-w-sm border border-border/40 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-6 w-6" />
            <h1 className="text-xl font-bold">لوحة المالك</h1>
          </div>
          <p className="text-sm text-muted-foreground">أدخل كلمة سر المالك للوصول.</p>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="OWNER_SECRET" autoFocus />
          <Button type="submit" disabled={!secret || loading} className="w-full">
            {loading ? "جارٍ التحقق…" : "دخول"}
          </Button>
          <Link to="/activate" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors pt-2">
            <ArrowRight className="h-4 w-4" /> العودة لشاشة التفعيل
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div dir="rtl" className="gateway-bg min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          إدارة التراخيص
        </h1>
        <div className="flex items-center gap-2">
          <Link to="/activate">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowRight className="h-4 w-4" /> العودة للتفعيل
            </Button>
          </Link>
          <Button variant="ghost" onClick={() => { sessionStorage.removeItem(SECRET_KEY); setAuthed(false); }}>خروج</Button>
        </div>
      </div>

      {/* ===== إحصائيات سريعة ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatCard icon={KeyRound} label="الإجمالي" value={stats.total} color="text-primary" />
        <StatCard icon={Activity} label="نشطة" value={stats.active} color="text-success" />
        <StatCard icon={AlertTriangle} label="تنتهي خلال 7 أيام" value={stats.expiringSoon} color="text-warning" />
        <StatCard icon={Clock} label="منتهية" value={stats.expired} color="text-warning" />
        <StatCard icon={Ban} label="ملغاة" value={stats.revoked} color="text-destructive" />
        <StatCard icon={Sparkles} label="مع AI" value={stats.ai} color="text-primary" />
        <StatCard icon={Smartphone} label="مع موبايل" value={stats.mobile} color="text-success" />
      </div>

      {/* ===== مراقبة السيرفر + ضرب التجميد ===== */}
      <CloudMonitorPanel fnUrl={FN_URL} anon={ANON} secret={secret} />
      <div className="glass-card rounded-2xl p-5 border border-border/40 space-y-4">
        <h2 className="font-bold flex items-center gap-2"><Plus className="h-4 w-4" /> إنشاء أكواد جديدة</h2>

        {/* presets للمدة */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">مدد سريعة:</span>
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => { setDays(p.days); setExpiresOn(""); }}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                days === p.days && !expiresOn
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>العدد</Label>
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(+e.target.value)} />
          </div>
          <div>
            <Label>المدة (أيام)</Label>
            <Input type="number" min={1} value={days} onChange={(e) => setDays(+e.target.value)} disabled={!!expiresOn} />
          </div>
          <div>
            <Label>أو تاريخ انتهاء يدوي</Label>
            <Input
              type="date"
              value={expiresOn}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
            {expiresOn && (
              <button type="button" onClick={() => setExpiresOn("")} className="text-xs text-muted-foreground hover:text-destructive mt-1">
                مسح التاريخ
              </button>
            )}
          </div>
          <div>
            <Label>اسم العميل</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div>
            <Label>هاتف العميل</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* خصائص إضافية */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none p-3 rounded border border-border bg-muted/40 hover:bg-muted transition-colors">
            <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">🤖 الذكاء الاصطناعي</span>
            <span className="text-xs text-muted-foreground ms-auto">{aiEnabled ? "مفعّل" : "معطّل"}</span>
          </label>
          <div className="p-3 rounded border border-border bg-muted/40 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={mobileEnabledNew} onChange={(e) => setMobileEnabledNew(e.target.checked)} className="h-4 w-4 accent-primary" />
              <Smartphone className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">📱 ربط الهاتف</span>
            </label>
            {mobileEnabledNew && (
              <div className="flex items-center gap-2 text-xs">
                <Label className="text-xs whitespace-nowrap">عدد الهواتف:</Label>
                <Input type="number" min={0} max={999} value={mobileLimitNew}
                  onChange={(e) => setMobileLimitNew(+e.target.value)}
                  className="h-8 w-24" />
                <span className="text-muted-foreground">{mobileLimitNew === 0 ? "(غير محدود)" : ""}</span>
              </div>
            )}
          </div>
        </div>

        <Button onClick={create} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 ms-2" /> إنشاء {count > 1 ? `${count} أكواد` : "كود"}
        </Button>
      </div>

      {/* ===== فلترة وبحث ===== */}
      <div className="glass-card rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث: كود / اسم / هاتف / جهاز / ملاحظة"
              className="pr-8" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 px-3 rounded-md bg-background border border-border text-sm">
            <option value="all">كل الحالات</option>
            <option value="unused">غير مستخدم</option>
            <option value="active">نشط</option>
            <option value="expiring_soon">⚠️ ينتهي خلال 7 أيام</option>
            <option value="expired">منتهي</option>
            <option value="revoked">ملغى</option>
          </select>
          <select value={aiFilter} onChange={(e) => setAiFilter(e.target.value as typeof aiFilter)}
            className="h-9 px-3 rounded-md bg-background border border-border text-sm">
            <option value="all">AI: الكل</option>
            <option value="on">AI مفعّل</option>
            <option value="off">AI معطّل</option>
          </select>
          <select value={mobileFilter} onChange={(e) => setMobileFilter(e.target.value as typeof mobileFilter)}
            className="h-9 px-3 rounded-md bg-background border border-border text-sm">
            <option value="all">📱 الكل</option>
            <option value="on">📱 مفعّل</option>
            <option value="off">📱 معطّل</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>تحديث</Button>
        </div>

        {/* شريط الإجراءات الجماعية */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <span className="text-sm font-bold text-primary flex items-center gap-1">
              <Users className="h-4 w-4" /> {selected.size} محدد
            </span>
            <div className="h-4 w-px bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={() => bulk("set_ai", { ai_enabled: true })}>تفعيل AI</Button>
            <Button size="sm" variant="outline" onClick={() => bulk("set_ai", { ai_enabled: false })}>تعطيل AI</Button>
            <Button size="sm" variant="outline" onClick={() => bulk("set_mobile", { mobile_enabled: true })}>تفعيل 📱</Button>
            <Button size="sm" variant="outline" onClick={() => bulk("set_mobile", { mobile_enabled: false })}>تعطيل 📱</Button>
            <Button size="sm" variant="outline" onClick={() => {
              const d = prompt("عدد الأيام للتمديد لكل الأكواد المحددة:", "30");
              const n = Number(d);
              if (Number.isFinite(n) && n > 0) void bulk("extend", { days: n });
            }}>تمديد بأيام</Button>
            <Button size="sm" variant="destructive" onClick={() => {
              toast(`إلغاء ${selected.size} كود؟`, {
                action: { label: "تأكيد", onClick: () => void bulk("revoke") },
                duration: 6000,
              });
            }}>إلغاء جماعي</Button>
            <Button size="sm" variant="destructive" onClick={() => {
              toast(`حذف نهائي لـ ${selected.size} كود؟`, {
                action: { label: "حذف", onClick: () => void bulk("delete") },
                duration: 6000,
              });
            }}>حذف نهائي</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
          </div>
        )}
      </div>

      {/* ===== الجدول ===== */}
      <div className="glass-card rounded-2xl p-5 border border-border/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">الأكواد ({filtered.length} من {licenses.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border/40">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((l) => selected.has(l.code))}
                    onChange={selectAllVisible}
                    className="h-4 w-4 accent-primary" />
                </th>
                <th className="text-start p-2">الكود</th>
                <th className="text-start p-2">الحالة</th>
                <th className="text-start p-2">العميل</th>
                <th className="text-start p-2">الجهاز</th>
                <th className="text-start p-2">الانتهاء</th>
                <th className="text-start p-2">AI</th>
                <th className="text-start p-2">📱</th>
                <th className="p-2">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const isExpiringSoon = l.expires_at && l.status === "active" &&
                  (new Date(l.expires_at).getTime() - Date.now()) < 7 * 86400000 &&
                  (new Date(l.expires_at).getTime() - Date.now()) > 0;
                return (
                <tr key={l.code} className={`border-b border-border/20 hover:bg-muted/30 ${isExpiringSoon ? "bg-warning/5" : ""}`}>
                  <td className="p-2">
                    <input type="checkbox" checked={selected.has(l.code)} onChange={() => toggleSelect(l.code)} className="h-4 w-4 accent-primary" />
                  </td>
                  <td className="p-2 font-mono text-xs flex items-center gap-1" dir="ltr">
                    {l.code}
                    <button onClick={() => copy(l.code)} className="text-muted-foreground hover:text-primary">
                      {copied === l.code ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      l.status === "active" ? "bg-success/20 text-success" :
                      l.status === "expired" ? "bg-warning/20 text-warning" :
                      l.status === "revoked" ? "bg-destructive/20 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{l.status}</span>
                    {isExpiringSoon && (
                      <span className="block text-[10px] text-warning mt-0.5">⚠️ قريب الانتهاء</span>
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    {l.customer_name ?? "—"}
                    {l.customer_phone && <div className="text-muted-foreground">{l.customer_phone}</div>}
                    {l.notes && <div className="text-muted-foreground italic truncate max-w-[180px]" title={l.notes}>📝 {l.notes}</div>}
                  </td>
                  <td className="p-2 text-xs">{l.device_name ?? "—"}</td>
                  <td className="p-2 text-xs">
                    {l.expires_at ? new Date(l.expires_at).toLocaleDateString("ar-DZ") : "—"}
                    {l.activated_at && (
                      <div className="text-[10px] text-muted-foreground">
                        فُعّل: {new Date(l.activated_at).toLocaleDateString("ar-DZ")}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => doAction("set_ai", l.code, { ai_enabled: !l.ai_enabled })}
                      title={l.ai_enabled ? "تعطيل" : "تفعيل"}
                      className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                        l.ai_enabled ? "bg-primary/15 text-primary hover:bg-primary/25" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {l.ai_enabled ? "✓" : "—"}
                    </button>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleMobile(l)}
                        title={l.mobile_enabled ? "تعطيل" : "تفعيل"}
                        className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                          l.mobile_enabled ? "bg-success/15 text-success hover:bg-success/25" : "bg-muted text-muted-foreground hover:bg-muted/70"
                        }`}
                      >
                        <Smartphone className="h-3 w-3" />
                        {l.mobile_enabled ? `${l.mobile_max_devices === 0 ? "∞" : l.mobile_max_devices}` : "—"}
                      </button>
                      <button onClick={() => openMobilePanel(l)} title="إدارة الجلسات"
                        className="text-muted-foreground hover:text-primary p-1">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setEditTarget({ ...l })} title="تعديل البيانات"
                        className="p-1.5 hover:bg-primary/10 rounded text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => extendCustom(l.code, l.expires_at)} title="تمديد"
                        className="p-1.5 hover:bg-primary/10 rounded text-primary"><Calendar className="h-3.5 w-3.5" /></button>
                      <button onClick={() => doAction("reset_device", l.code)} title="إعادة ربط الجهاز"
                        className="p-1.5 hover:bg-warning/10 rounded text-warning"><RotateCcw className="h-3.5 w-3.5" /></button>
                      <button onClick={() => doAction("revoke", l.code)} title="إلغاء"
                        className="p-1.5 hover:bg-destructive/10 rounded text-destructive"><Ban className="h-3.5 w-3.5" /></button>
                      <button onClick={() => {
                        toast("حذف نهائي؟", { action: { label: "حذف", onClick: () => void doAction("delete", l.code) }, duration: 5000 });
                      }} title="حذف" className="p-1.5 hover:bg-destructive/10 rounded text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                  {licenses.length === 0 ? "لا توجد أكواد بعد" : "لا توجد نتائج تطابق الفلتر"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== نافذة تمديد ===== */}
      {extendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setExtendTarget(null)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary">تمديد الكود {extendTarget.code}</h3>
            <p className="text-xs text-muted-foreground">
              الانتهاء الحالي: {extendTarget.currentExpiry ? new Date(extendTarget.currentExpiry).toLocaleDateString("ar-DZ") : "غير مفعّل بعد"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((p) => (
                <button key={p.days} type="button" onClick={() => setExtendTarget({ ...extendTarget, days: String(p.days) })}
                  className="px-2.5 py-1 rounded-full text-xs border border-border hover:bg-muted">
                  +{p.label}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              عدد الأيام للإضافة:
              <input type="number" min={1} value={extendTarget.days}
                onChange={(e) => setExtendTarget({ ...extendTarget, days: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none"
                autoFocus />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setExtendTarget(null)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted">إلغاء</button>
              <button onClick={() => {
                const d = Number(extendTarget.days);
                if (!Number.isFinite(d) || d < 1) { toast.error("عدد أيام غير صالح"); return; }
                void doAction("extend", extendTarget.code, { days: d });
                setExtendTarget(null);
              }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">تمديد</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== نافذة تعديل بيانات ===== */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditTarget(null)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                <Pencil className="h-5 w-5" /> تعديل بيانات الكود
              </h3>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground hover:text-destructive"><X className="h-5 w-5" /></button>
            </div>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">{editTarget.code}</p>
            <div className="space-y-3">
              <div>
                <Label>اسم العميل</Label>
                <Input value={editTarget.customer_name ?? ""} onChange={(e) => setEditTarget({ ...editTarget, customer_name: e.target.value })} />
              </div>
              <div>
                <Label>هاتف العميل</Label>
                <Input value={editTarget.customer_phone ?? ""} onChange={(e) => setEditTarget({ ...editTarget, customer_phone: e.target.value })} />
              </div>
              <div>
                <Label>ملاحظات</Label>
                <textarea value={editTarget.notes ?? ""} onChange={(e) => setEditTarget({ ...editTarget, notes: e.target.value })}
                  className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted">إلغاء</button>
              <button onClick={saveMeta} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== نافذة إدارة الهاتف ===== */}
      {mobileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMobileTarget(null)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                <Smartphone className="h-5 w-5" /> إدارة الهاتف — {mobileTarget.code}
              </h3>
              <button onClick={() => setMobileTarget(null)} className="text-muted-foreground hover:text-destructive"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                <Label className="text-xs">حالة ربط الهاتف</Label>
                <button onClick={() => toggleMobile(mobileTarget)}
                  className={`w-full px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-2 ${
                    mobileTarget.mobile_enabled ? "bg-success/20 text-success hover:bg-success/30" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}>
                  <Smartphone className="h-4 w-4" />
                  {mobileTarget.mobile_enabled ? "✓ مفعّل" : "معطّل"}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  {mobileTarget.mobile_enabled ? "الزبون يستطيع ربط هاتفه" : "أي جلسات سابقة ستُلغى عند التعطيل"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                <Label className="text-xs">الحد الأقصى للهواتف (0 = ∞)</Label>
                <div className="flex gap-2">
                  <Input type="number" min={0} max={999} value={editingLimit}
                    onChange={(e) => setEditingLimit(e.target.value)}
                    disabled={!mobileTarget.mobile_enabled} />
                  <Button onClick={saveLimit}
                    disabled={!mobileTarget.mobile_enabled || editingLimit === String(mobileTarget.mobile_max_devices)}
                    size="sm">حفظ</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  الحالي: {mobileTarget.mobile_max_devices === 0 ? "غير محدود" : `${mobileTarget.mobile_max_devices} هاتف`}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between bg-muted/30 px-4 py-2 border-b border-border/40">
                <h4 className="font-bold text-sm">
                  الجلسات ({sessions.filter((s) => !s.revoked && new Date(s.expires_at) > new Date()).length} نشطة من {sessions.length})
                </h4>
                <button onClick={() => refreshSessions(mobileTarget.code)} disabled={sessionsLoading}
                  className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1">
                  <RefreshCw className={`h-3 w-3 ${sessionsLoading ? "animate-spin" : ""}`} /> تحديث
                </button>
              </div>
              {sessionsLoading ? (
                <div className="p-6 text-center text-xs text-muted-foreground">جارٍ التحميل…</div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">لا توجد جلسات هاتف بعد</div>
              ) : (
                <div className="divide-y divide-border/30">
                  {sessions.map((s) => {
                    const isActive = !s.revoked && new Date(s.expires_at) > new Date();
                    return (
                      <div key={s.token} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                        <Smartphone className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.device_label ?? "هاتف غير مسمّى"}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>أُنشئت: {new Date(s.created_at).toLocaleDateString("ar-DZ")}</span>
                            {s.last_used_at && <span>· آخر استخدام: {new Date(s.last_used_at).toLocaleDateString("ar-DZ")}</span>}
                            <span>· تنتهي: {new Date(s.expires_at).toLocaleDateString("ar-DZ")}</span>
                          </div>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded ${
                          s.revoked ? "bg-destructive/20 text-destructive" :
                          isActive ? "bg-success/20 text-success" :
                          "bg-warning/20 text-warning"
                        }`}>
                          {s.revoked ? "ملغاة" : isActive ? "نشطة" : "منتهية"}
                        </span>
                        {isActive && (
                          <button onClick={() => revokeSession(s.token)} title="فصل"
                            className="p-1.5 hover:bg-destructive/10 rounded text-destructive">
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="glass-card rounded-xl p-3 border border-border/40 flex items-center gap-2">
      <Icon className={`h-5 w-5 ${color}`} />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
        <div className={`text-lg font-bold ${color}`}>{value}</div>
      </div>
    </div>
  );
}
