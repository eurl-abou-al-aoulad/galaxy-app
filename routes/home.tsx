import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  Shirt,
  ShoppingCart,
  Wrench,
  Smartphone,
  Factory,
  Languages,
  Sun,
  Moon,
  Phone,
  LogOut,
  ShieldCheck,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/contexts/AppContext";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";
import { openWhatsAppSupport, getActivationStatus, type ActivationStatus } from "@/lib/activation";
import type { SectionId } from "@/lib/db";

export const Route = createFileRoute("/home")({
  component: HomePage,
});

interface SectionDef {
  id: SectionId;
  icon: LucideIcon;
  color: string;
  glow: string;
}

const SECTIONS: SectionDef[] = [
  { id: "clothing", icon: Shirt, color: "from-pink-500 to-rose-500", glow: "shadow-pink-500/40" },
  { id: "supermarket", icon: ShoppingCart, color: "from-emerald-500 to-teal-500", glow: "shadow-emerald-500/40" },
  { id: "hardware", icon: Wrench, color: "from-amber-500 to-orange-500", glow: "shadow-amber-500/40" },
  { id: "repair", icon: Smartphone, color: "from-cyan-500 to-blue-500", glow: "shadow-cyan-500/40" },
  { id: "factory", icon: Factory, color: "from-violet-500 to-purple-500", glow: "shadow-violet-500/40" },
];

function HomePage() {
  const { t } = useTranslation();
  const { lang, theme, toggleLang, toggleTheme } = useApp();
  const navigate = useNavigate();
  const [activation, setActivation] = useState<ActivationStatus | null>(null);

  // تحديث فوري عند تغيّر سجل التفعيل في DB (بعد إدخال كود مثلاً)
  const activationRow = useLiveQuery(() => db.activation.get(1), []);

  useEffect(() => {
    void getActivationStatus().then(setActivation);
  }, [activationRow]);

  return (
    <div className="gateway-bg relative min-h-screen flex flex-col">
      {/* الشريط العلوي */}
      <header className="flex items-center justify-between p-4 md:p-6 sticky top-0 z-20 backdrop-blur-md bg-background/30">
        <GalaxyLogo size="sm" />
        <div className="flex items-center gap-2">
          <Link
            to="/mobile"
            className="glass-card rounded-xl p-2 hover:border-accent transition-colors flex items-center gap-2 px-3"
            title={t("actions.home")}
          >
            <Smartphone className="h-4 w-4 text-accent" />
            <span className="text-xs hidden sm:inline">Mobile</span>
          </Link>
          <button
            onClick={openWhatsAppSupport}
            className="glass-card rounded-xl p-2 hover:border-accent transition-colors hidden sm:flex items-center gap-2 px-3"
            title={t("common.support")}
          >
            <Phone className="h-4 w-4 text-accent" />
            <span className="text-xs">{t("common.support")}</span>
          </button>
          <button
            onClick={toggleLang}
            className="glass-card rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:border-accent transition-colors"
            title="Language"
          >
            <Languages className="h-4 w-4" />
            <span className="font-semibold uppercase">{lang}</span>
          </button>
          <button
            onClick={toggleTheme}
            className="glass-card rounded-xl p-2 hover:border-accent transition-colors"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link
            to="/"
            className="glass-card rounded-xl p-2 hover:border-destructive transition-colors"
            title={t("actions.logout")}
          >
            <LogOut className="h-5 w-5 text-destructive" />
          </Link>
        </div>
      </header>

      {/* المحتوى */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* العنوان الرئيسي */}
        <div className="text-center mb-10 animate-cosmic-in">
          <h1
            className="text-3xl md:text-5xl font-black tracking-wider text-gradient-galaxy mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            THE GALAXY
          </h1>
          <p className="text-xs md:text-sm tracking-[0.3em] text-accent-glow uppercase neon-text-accent mb-4">
            ACCOUNTING SOFTWARE
          </p>
          <p className="text-base md:text-lg text-muted-foreground font-semibold">
            {t("home.select_section")}
          </p>
        </div>

        {/* === بطاقة حالة الترخيص === */}
        {activation && (
          <div className="w-full max-w-5xl mb-6 animate-cosmic-in">
            {activation.activated ? (
              <div className="glass-card rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <ShieldCheck className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-emerald-400 text-sm md:text-base">
                      {t("license.activated")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {activation.licenseDaysLeft !== null
                        ? t("license.active_subscription_days", { days: activation.licenseDaysLeft })
                        : t("license.lifetime")}
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex flex-shrink-0 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                  Premium
                </span>
              </div>
            ) : activation.trialActive ? (
              <div
                className={`glass-card rounded-2xl border p-4 flex items-center justify-between gap-4 ${
                  activation.trialDaysLeft <= 2
                    ? "border-destructive/60 bg-destructive/10"
                    : activation.trialDaysLeft <= 5
                    ? "border-warning/60 bg-warning/10"
                    : "border-accent/40 bg-accent/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center shadow-lg ${
                      activation.trialDaysLeft <= 2
                        ? "bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30 animate-neon-pulse"
                        : activation.trialDaysLeft <= 5
                        ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/30"
                        : "bg-gradient-to-br from-cyan-500 to-blue-500 shadow-cyan-500/30"
                    }`}
                  >
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-bold text-sm md:text-base ${
                        activation.trialDaysLeft <= 2
                          ? "text-destructive"
                          : activation.trialDaysLeft <= 5
                          ? "text-warning"
                          : "text-accent-glow"
                      }`}
                    >
                      {t("license.trial_days_left", { days: activation.trialDaysLeft })}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t("license.activate_now_hint")}
                    </p>
                  </div>
                </div>
                <Link
                  to="/"
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs md:text-sm font-bold neon-glow hover:scale-105 transition-transform"
                >
                  {t("license.activate_cta")}
                </Link>
              </div>
            ) : null}
          </div>
        )}

        {/* شبكة الأقسام */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-5xl">
          {SECTIONS.map((section, idx) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => navigate({ to: "/section/$sectionId", params: { sectionId: section.id } })}
                className="group relative glass-card card-3d rounded-3xl p-6 text-start animate-cosmic-in"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* توهج خلفي */}
                <div
                  className={`absolute -inset-0.5 rounded-3xl bg-gradient-to-br ${section.color} opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-500`}
                />

                <div className="relative">
                  <div
                    className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${section.color} shadow-lg ${section.glow} mb-4 group-hover:scale-110 transition-transform`}
                  >
                    <Icon className="h-9 w-9 text-white" strokeWidth={2.2} />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold mb-1 group-hover:text-gradient-galaxy transition-all">
                    {t(`sections.${section.id}`)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("home_extra.modules_count", { count: 9 })}
                  </p>
                </div>

                {/* نقطة نيون متحركة */}
                <div className="absolute top-4 end-4 h-2 w-2 rounded-full bg-accent neon-glow-accent animate-neon-pulse" />
              </button>
            );
          })}
        </div>

        {/* تذييل صغير */}
        <div className="mt-12 text-center space-y-1">
          <p className="text-xs text-muted-foreground tracking-wider">
            {t("common.copyright")}
          </p>
          <p className="text-[10px] text-muted-foreground/70 tracking-wider">
            © 2026 · {t("home_extra.currency_label")}: DZD
          </p>
        </div>
      </main>
    </div>
  );
}
