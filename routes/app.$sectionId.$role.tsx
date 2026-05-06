import { Outlet, createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  CreditCard,
  Users,
  Wallet,
  PauseCircle,
  Truck,
  Settings as SettingsIcon,
  Wrench,
  CalendarCheck,
  Home,
  LogOut,
  Languages,
  Sun,
  Moon,
  Phone,
  Bell,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useApp, SectionProvider, canAccess } from "@/contexts/AppContext";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";
import { AIHelperBubble } from "@/components/galaxy/AIHelperBubble";
import { LicenseGuard } from "@/components/security/LicenseGuard";
import { useProactiveInsights } from "@/hooks/useProactiveInsights";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { db, ALL_SECTIONS, exportAllData, type SectionId } from "@/lib/db";
import { openWhatsAppSupport, getActivationStatus } from "@/lib/activation";
import { useEffect, useMemo, useState, useCallback } from "react";

interface AppSearch {
  workerCode?: string;
}

export const Route = createFileRoute("/app/$sectionId/$role")({
  component: AppLayout,
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    workerCode: typeof search.workerCode === "string" ? search.workerCode : undefined,
  }),
  beforeLoad: ({ params }) => {
    if (!ALL_SECTIONS.includes(params.sectionId as SectionId)) throw new Error("Invalid section");
    if (params.role !== "admin" && params.role !== "worker") throw new Error("Invalid role");
  },
});

interface ModuleDef {
  key: string;
  to: string;
  icon: LucideIcon;
  sectionsOnly?: SectionId[];
}

const ALL_MODULES: ModuleDef[] = [
  { key: "dashboard", to: "dashboard", icon: LayoutDashboard },
  { key: "pos", to: "pos", icon: ShoppingCart },
  { key: "inventory", to: "inventory", icon: Package },
  { key: "invoices", to: "invoices", icon: Receipt },
  { key: "debts", to: "debts", icon: CreditCard },
  { key: "customers", to: "customers", icon: Users },
  { key: "expenses", to: "expenses", icon: Wallet },
  { key: "suspended", to: "suspended", icon: PauseCircle },
  { key: "suppliers", to: "suppliers", icon: Truck },
  { key: "repair_center", to: "repair", icon: Wrench, sectionsOnly: ["repair"] },
  { key: "tasks", to: "tasks", icon: CalendarCheck, sectionsOnly: ["factory", "hardware"] },
  { key: "settings", to: "settings", icon: SettingsIcon },
];

function AppLayout() {
  const { t } = useTranslation();
  const { lang, theme, toggleLang, toggleTheme } = useApp();
  const { sectionId, role } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const location = useLocation();
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [licenseDays, setLicenseDays] = useState<number | null>(null);
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [headerHidden, setHeaderHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("galaxy_header_hidden") === "1";
  });
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("galaxy_sidebar_hidden") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("galaxy_header_hidden", headerHidden ? "1" : "0");
    }
  }, [headerHidden]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("galaxy_sidebar_hidden", sidebarHidden ? "1" : "0");
    }
  }, [sidebarHidden]);

  // ✅ حفظ سريع: يضمن أن جميع المعاملات الجارية كُتبت في IndexedDB
  // (Dexie يحفظ تلقائياً، لكن هذا يطلق "flush" للمعاملات المعلقة ويعطي تأكيداً بصرياً)
  const handleBackup = async () => {
    try {
      // إجبار جميع المعاملات المعلّقة على الإكمال قبل المتابعة
      await db.transaction("rw", db.tables, async () => {
        // معاملة فارغة — تنتظر اكتمال أي عملية كتابة جارية
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("galaxy_last_save", String(Date.now()));
      }
      toast.success(t("actions.save_success"), { duration: 1500 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(`${t("actions.save_failed")}${msg ? ` — ${msg}` : ""}`);
    }
  };

  // نسخة احتياطية كاملة (تنزيل ملف JSON) — تُستدعى من الإعدادات أو التذكير اليومي
  const handleFullBackup = async () => {
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `galaxy-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("galaxy_last_backup", String(Date.now()));
      }
      toast.success(t("backup.saved_success"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(`${t("backup.failed")}${msg ? ` — ${msg}` : ""}`);
    }
  };

  // تذكير بالنسخ الاحتياطي إذا مرّ أكثر من 24 ساعة
  useEffect(() => {
    if (typeof window === "undefined") return;
    const last = Number(window.localStorage.getItem("galaxy_last_backup") ?? "0");
    const dayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - last > dayMs) {
      const timer = setTimeout(() => {
        toast.message(t("backup.reminder_title"), {
          description: t("backup.reminder_desc"),
          duration: 8000,
          action: {
            label: t("backup.save_now"),
            onClick: () => void handleFullBackup(),
          },
        });
      }, 4000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // عداد التريال / حالة التفعيل في TopBar — متجاوب فوراً مع تغييرات DB
  const activationRow = useLiveQuery(() => db.activation.get(1), []);
  useEffect(() => {
    void getActivationStatus().then((s) => {
      if (s.activated) {
        setIsActivated(true);
        setLicenseDays(s.licenseDaysLeft);
        setTrialDays(null);
      } else if (s.trialActive) {
        setIsActivated(false);
        setLicenseDays(null);
        setTrialDays(s.trialDaysLeft);
      } else {
        setIsActivated(false);
        setLicenseDays(null);
        setTrialDays(null);
      }
      if (s.trialExpired) navigate({ to: "/" });
    });
  }, [navigate, activationRow]);

  // إشعارات المخزون المنخفض — قائمة السلع المنخفضة لعرضها في القائمة المنسدلة
  const lowStockItems = useLiveQuery(
    () =>
      db.products
        .where("section")
        .equals(sectionId)
        .filter((p) => p.quantity <= (p.minStock || 5))
        .toArray(),
    [sectionId],
  );
  const lowStockCount = lowStockItems?.length ?? 0;

  // صلاحيات العامل الحالي (للأدوار العمالية فقط)
  const workerPermissions = useLiveQuery(async () => {
    if (role !== "worker" || !search.workerCode) return [];
    const w = await db.workers
      .where("[section+code]")
      .equals([sectionId, search.workerCode])
      .first();
    return w?.permissions ?? [];
  }, [role, sectionId, search.workerCode]) ?? [];

  const visibleModules = useMemo(
    () =>
      ALL_MODULES.filter((m) => {
        if (m.sectionsOnly && !m.sectionsOnly.includes(sectionId as SectionId)) return false;
        return canAccess(role as "admin" | "worker", m.key, workerPermissions);
      }),
    [sectionId, role, workerPermissions],
  );

  const currentModule = useMemo(
    () => visibleModules.find((m) => location.pathname.endsWith(`/${m.to}`)),
    [visibleModules, location.pathname],
  );

  // حماية المسارات: لو العامل دخل عنوان مباشرة بدون صلاحية → إعادة توجيه
  useEffect(() => {
    if (role !== "worker") return;
    const matched = ALL_MODULES.find((m) => location.pathname.endsWith(`/${m.to}`));
    if (matched && !canAccess("worker", matched.key, workerPermissions)) {
      navigate({
        to: "/app/$sectionId/$role/invoices",
        params: { sectionId, role },
        search: { workerCode: search.workerCode },
      });
    }
  }, [role, location.pathname, workerPermissions, navigate, sectionId, search.workerCode]);

  return (
    <LicenseGuard>
      <SectionProvider
        sectionId={sectionId as SectionId}
        role={role as "admin" | "worker"}
        workerCode={search.workerCode ?? null}
      >
        <div className="app-striped-bg relative min-h-screen flex flex-col">
          {/* الشريط العلوي — قابل للإخفاء */}
          {!headerHidden && (
            <header className="sticky top-0 z-30 bg-background/85 border-b border-border/40" style={{ contain: "layout paint" }}>
              <div className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <GalaxyLogo size="sm" />
                  <div className="hidden md:block h-8 w-px bg-border" />
                  <div className="hidden md:flex flex-col leading-tight min-w-0">
                    <span className="text-xs text-muted-foreground truncate">
                      {t(`sections.${sectionId}`)}
                    </span>
                    <span className="font-bold text-sm truncate">
                      {currentModule ? t(`modules.${currentModule.key}`) : ""}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* شارة الحالة: إما اشتراك مفعّل وإما تجربة — وليس الاثنين معاً */}
                  {isActivated ? (
                    <div
                      className="hidden sm:flex items-center gap-1.5 glass-card rounded-xl px-3 py-1.5 text-xs font-bold border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                      title={t("license.active_subscription")}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {licenseDays !== null
                        ? t("license.active_short", { days: licenseDays })
                        : t("license.lifetime_short")}
                    </div>
                  ) : trialDays !== null && trialDays > 0 ? (
                    <div
                      className={`hidden sm:flex glass-card rounded-xl px-3 py-1.5 text-xs font-bold ${
                        trialDays <= 2
                          ? "border-destructive/60 text-destructive animate-neon-pulse"
                          : trialDays <= 5
                          ? "border-warning/60 text-warning"
                          : "border-accent/40 text-accent-glow"
                      }`}
                      title={t("license.trial_period")}
                    >
                      🎁 {t("license.trial_short", { days: trialDays })}
                    </div>
                  ) : null}
                  {role === "admin" && lowStockCount > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="relative glass-card rounded-xl p-2 hover:border-warning transition-colors"
                          title={t("inventory.low_stock_alert")}
                        >
                          <Bell className="h-5 w-5 text-warning animate-neon-pulse" />
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 min-w-5 px-1 text-[10px] flex items-center justify-center font-bold">
                            {lowStockCount}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 p-0 glass-card border-warning/40">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                          <div className="flex items-center gap-2">
                            <Bell className="h-4 w-4 text-warning" />
                            <span className="font-bold text-sm">{t("inventory.low_stock_list_title")}</span>
                          </div>
                          <span className="bg-destructive text-destructive-foreground rounded-full h-5 min-w-5 px-1.5 text-[10px] flex items-center justify-center font-bold">
                            {lowStockCount}
                          </span>
                        </div>
                        <ScrollArea className="max-h-72">
                          <ul className="divide-y divide-border/30">
                            {lowStockItems?.map((p) => (
                              <li key={p.id} className="px-4 py-2.5 hover:bg-warning/5 transition-colors">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-medium truncate flex-1" title={p.name}>
                                    {p.name}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs shrink-0">
                                    <span className="text-warning font-bold">
                                      {t("inventory.current_qty")}: {p.quantity}
                                    </span>
                                    <span className="text-muted-foreground">
                                      / {t("inventory.min_qty")}: {p.minStock || 5}
                                    </span>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                        <button
                          onClick={() => navigate({ to: "/app/$sectionId/$role/inventory", params: { sectionId, role } })}
                          className="w-full px-4 py-2.5 text-xs font-bold text-accent hover:bg-accent/10 border-t border-border/40 transition-colors"
                        >
                          {t("inventory.view_all_inventory")} ←
                        </button>
                      </PopoverContent>
                    </Popover>
                  )}
                  <button onClick={openWhatsAppSupport} className="glass-card rounded-xl p-2 hover:border-accent" title={t("common.support")}>
                    <Phone className="h-4 w-4 text-accent" />
                  </button>
                  <button
                    onClick={handleBackup}
                    className="glass-card rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:border-success text-success font-semibold"
                    title={t("backup.save_tooltip")}
                  >
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("actions.save")}</span>
                  </button>
                  <button onClick={toggleLang} className="glass-card rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:border-accent" title="Language">
                    <Languages className="h-4 w-4" />
                    <span className="font-semibold uppercase">{lang}</span>
                  </button>
                  <button onClick={toggleTheme} className="glass-card rounded-xl p-2 hover:border-accent">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setSidebarHidden((v) => !v)}
                    className="glass-card rounded-xl p-2 hover:border-accent"
                    title={sidebarHidden ? t("actions.show_sidebar", "إظهار القائمة") : t("actions.hide_sidebar", "إخفاء القائمة")}
                  >
                    {sidebarHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setHeaderHidden(true)}
                    className="glass-card rounded-xl p-2 hover:border-accent"
                    title={t("actions.hide_header")}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </header>
          )}

          {/* زر إظهار الشريط العلوي عندما يكون مخفياً */}
          {headerHidden && (
            <button
              onClick={() => setHeaderHidden(false)}
              className="fixed top-2 start-1/2 -translate-x-1/2 z-40 glass-card rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 hover:border-accent shadow-lg"
              title={t("actions.show_header")}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="font-semibold">{t("actions.show_header")}</span>
            </button>
          )}

          <div className="flex-1 flex">
            {/* Sidebar */}
            {!sidebarHidden && (
              <aside className="w-56 lg:w-60 border-e border-border/40 bg-sidebar/85 sticky top-[60px] self-start max-h-[calc(100vh-60px)] overflow-y-auto py-4" style={{ contain: "layout paint" }}>
                <nav className="flex flex-col gap-1 px-2">
                  {visibleModules.map((m) => {
                    const Icon = m.icon;
                    const isActive = location.pathname.endsWith(`/${m.to}`);
                    return (
                      <Link
                        key={m.key}
                        to={`/app/$sectionId/$role/${m.to}` as "/app/$sectionId/$role/dashboard"}
                        params={{ sectionId, role }}
                        search={{ workerCode: search.workerCode }}
                        preload="intent"
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${
                          isActive
                            ? "bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/40 neon-glow text-foreground"
                            : "hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="block text-sm font-semibold truncate">
                          {t(`modules.${m.key}`)}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </aside>
            )}

            {/* أيقونات عائمة سريعة عند إخفاء الشريط الجانبي */}
            {sidebarHidden && (
              <div className="fixed top-1/2 start-2 -translate-y-1/2 z-40 flex flex-col gap-2 animate-cosmic-in">
                <button
                  onClick={() => setSidebarHidden(false)}
                  className="h-10 w-10 rounded-full bg-background/90 border border-border/60 backdrop-blur shadow-lg flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-colors"
                  title={t("actions.show_sidebar", "إظهار القائمة")}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
                {visibleModules.map((m) => {
                  const Icon = m.icon;
                  const isActive = location.pathname.endsWith(`/${m.to}`);
                  return (
                    <Link
                      key={m.key}
                      to={`/app/$sectionId/$role/${m.to}` as "/app/$sectionId/$role/dashboard"}
                      params={{ sectionId, role }}
                      search={{ workerCode: search.workerCode }}
                      preload="intent"
                      title={t(`modules.${m.key}`)}
                      className={`h-10 w-10 rounded-full backdrop-blur shadow-lg flex items-center justify-center border transition-colors ${
                        isActive
                          ? "bg-primary/20 border-primary/60 text-primary"
                          : "bg-background/90 border-border/60 text-muted-foreground hover:border-accent hover:text-foreground hover:bg-accent/10"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </Link>
                  );
                })}
              </div>
            )}

            {/* المحتوى */}
            <main className="flex-1 min-w-0 p-4 md:p-6">
              <div className="animate-cosmic-in">
                <Outlet />
              </div>
            </main>
          </div>

          {/* Bottom Nav */}
          <footer className="sticky bottom-0 z-30 bg-background/85 border-t border-border/40 px-4 py-2 flex items-center justify-between" style={{ contain: "layout paint" }}>
            <Link
              to="/home"
              className="glass-card rounded-xl px-4 py-2 text-sm flex items-center gap-2 hover:border-accent transition-colors"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">{t("actions.home")}</span>
            </Link>
            <p className="text-[10px] text-muted-foreground tracking-wider hidden md:block text-center px-2">
              {t("common.copyright")} · DZD · {role === "admin" ? "Admin" : `Worker [${search.workerCode ?? "—"}]`}
            </p>
            <Link
              to="/"
              className="glass-card rounded-xl px-4 py-2 text-sm flex items-center gap-2 hover:border-destructive transition-colors text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("actions.logout")}</span>
            </Link>
          </footer>

          {/* المساعد الذكي العائم */}
          <AIHelperBubble />
          {/* الرقابة الاستباقية الصامتة في الخلفية */}
          <ProactiveWatcher
            sectionId={sectionId as SectionId}
            role={role as "admin" | "worker"}
            workerPermissions={workerPermissions}
            lang={lang}
          />
        </div>
      </SectionProvider>
    </LicenseGuard>
  );
}

interface WatcherProps {
  sectionId: SectionId;
  role: "admin" | "worker";
  workerPermissions: string[];
  lang: "ar" | "en" | "fr";
}
function ProactiveWatcher({ sectionId, role, workerPermissions, lang }: WatcherProps) {
  useProactiveInsights({ sectionId, role, workerPermissions, lang });
  return null;
}
