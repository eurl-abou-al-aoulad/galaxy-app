import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Lock, Phone, Languages, Sun, Moon } from "lucide-react";
import logoUrl from "@/assets/galaxy-logo.png";
import { toast } from "sonner";
import { db } from "@/lib/db";
import {
  getActivationStatus,
  tryActivate,
  openWhatsAppSupport,
  type ActivationStatus,
} from "@/lib/activation";
import { activateLicense } from "@/lib/license/client";
import { useApp } from "@/contexts/AppContext";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  component: ActivationGate,
});

function ActivationGate() {
  const { t } = useTranslation();
  const { ready, lang, theme, toggleLang, toggleTheme } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ActivationStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // إعادة تحميل الحالة عند تغيير DB
  const activationRow = useLiveQuery(() => db.activation.get(1), []);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const s = await getActivationStatus();
      setStatus(s);
    })();
  }, [ready, activationRow]);

  const handleActivate = async () => {
    if (!code.trim()) return;
    setBusy(true);

    // 1) جرّب الأكواد المحلية الثابتة أولاً (سريع، بدون إنترنت)
    const localOk = await tryActivate(code);
    if (localOk) {
      setBusy(false);
      toast.success(t("activation.activated_success"));
      // الدخول المباشر للأقسام بدون أي تأخير
      navigate({ to: "/home" });
      return;
    }

    // 2) جرّب الأكواد المُولّدة من لوحة المالك عبر السيرفر
    const res = await activateLicense(code);
    setBusy(false);
    if (res.state === "valid") {
      toast.success(t("activation.activated_success"));
      navigate({ to: "/home" });
      return;
    }

    // 3) رسائل خطأ مفصّلة حسب نوع الفشل
    const errMessages: Record<string, string> = {
      device_mismatch: lang === "ar" ? "هذا الكود مرتبط بجهاز آخر" : "Code linked to another device",
      expired: lang === "ar" ? "انتهت صلاحية هذا الكود" : "Code expired",
      revoked: lang === "ar" ? "تم إلغاء هذا الكود" : "Code revoked",
      invalid_code: t("activation.invalid_code"),
      tampered: lang === "ar" ? "خلل في بيانات الترخيص" : "License data tampered",
    };
    const msg = errMessages[res.state] ?? ("message" in res ? res.message : t("activation.invalid_code"));
    toast.error(msg);
  };

  const handleEnter = () => {
    // إذا كان البرنامج مفعّلاً → دخول مباشر للأقسام
    // غير ذلك (تجربة نشطة) → نفس السلوك
    navigate({ to: status?.activated ? "/home" : "/home" });
  };

  if (!ready || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="mt-4 text-muted-foreground">{t("intro.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gateway-bg relative min-h-screen flex flex-col">
      {/* شريط علوي */}
      <header className="flex items-center justify-between p-4 md:p-6">
        <GalaxyLogo size="sm" />
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="glass-card rounded-xl px-3 py-2 text-sm flex items-center gap-2 hover:border-accent transition-colors"
            aria-label="toggle language"
          >
            <Languages className="h-4 w-4" />
            <span>{lang === "ar" ? "EN" : "عربي"}</span>
          </button>
          <button
            onClick={toggleTheme}
            className="glass-card rounded-xl p-2 hover:border-accent transition-colors"
            aria-label="toggle theme"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg animate-cosmic-in">
          <div className="text-center mb-8">
            <div className="inline-flex relative mb-4">
              <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl animate-neon-pulse" />
              <img
                src={logoUrl}
                alt="GALAXY"
                className="relative h-28 w-28 object-contain drop-shadow-[0_0_30px_rgba(0,229,255,0.8)]"
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-wider text-gradient-galaxy mb-2"
                style={{ fontFamily: "var(--font-display)" }}>
              GALAXY
            </h1>
            <p className="text-sm tracking-widest text-muted-foreground uppercase">
              Accounting Software
            </p>
          </div>

          <div className="glass-card rounded-3xl p-8 space-y-6">
            {/* === الحالة 1: مفعّل بكود دائم === */}
            {status.activated ? (
              <>
                <div className="text-center space-y-3">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/40 animate-neon-pulse">
                    <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-400">
                    {lang === "ar" ? "البرنامج مفعّل ✓" : "Software Activated ✓"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {status.licenseDaysLeft !== null
                      ? lang === "ar"
                        ? `اشتراك فعّال — متبقي ${status.licenseDaysLeft} يوم`
                        : `Active subscription — ${status.licenseDaysLeft} days left`
                      : lang === "ar"
                      ? "ترخيص دائم — لا توجد قيود زمنية"
                      : "Lifetime license — no time limits"}
                  </p>
                </div>

                <NeonButton
                  variant="primary"
                  size="lg"
                  className="w-full text-lg py-6"
                  onClick={handleEnter}
                >
                  {lang === "ar" ? "🚀 ادخل النظام" : "🚀 Enter System"}
                </NeonButton>

                <button
                  onClick={openWhatsAppSupport}
                  className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-accent transition-colors py-1"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t("activation.support")}
                </button>

                <div className="flex items-center justify-center pt-2 border-t border-border/30">
                  <Link
                    to="/owner"
                    className="text-xs text-primary/60 hover:text-primary transition-colors"
                  >
                    🔐 {lang === "ar" ? "لوحة المالك" : "Owner Panel"}
                  </Link>
                </div>
              </>
            ) : (
              <>
                {/* === الحالة 2: تجريبي أو منتهي === */}
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">{t("activation.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("activation.subtitle")}</p>
                </div>

                {status.trialActive && (
                  <div className="rounded-xl bg-accent/10 border border-accent/30 p-4 text-center">
                    <p className="text-sm text-accent-glow font-semibold">
                      {t("activation.continue_trial", { days: status.trialDaysLeft })}
                    </p>
                  </div>
                )}
                {status.trialExpired && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/40 p-4 text-center">
                    <p className="font-bold text-destructive">{t("activation.trial_expired")}</p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      {t("activation.trial_expired_msg")}
                    </p>
                  </div>
                )}

                {/* إدخال الرمز */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {t("activation.code_label")}
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("activation.code_placeholder")}
                    className="w-full h-12 rounded-xl bg-input border border-border px-4 text-center font-mono tracking-wider focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                  />
                  <NeonButton
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleActivate}
                    disabled={busy || !code.trim()}
                  >
                    {t("activation.activate")}
                  </NeonButton>
                </div>

                {/* زر دخول التريال */}
                {status.canUse && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        {lang === "ar" ? "أو" : "OR"}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <NeonButton
                      variant="accent"
                      size="lg"
                      className="w-full"
                      onClick={handleEnter}
                    >
                      {t("activation.start_trial")}
                    </NeonButton>
                  </>
                )}

                {/* الدعم */}
                <button
                  onClick={openWhatsAppSupport}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors py-2"
                >
                  <Phone className="h-4 w-4" />
                  {t("activation.support")} — +213 562 935 257
                </button>

                {/* روابط إضافية */}
                <div className="flex items-center justify-center gap-4 pt-2 border-t border-border/30">
                  <Link
                    to="/activate"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    🔑 شاشة التفعيل المتقدمة
                  </Link>
                  <span className="text-muted-foreground/40">•</span>
                  <Link
                    to="/owner"
                    className="text-xs text-primary/70 hover:text-primary transition-colors font-semibold"
                  >
                    🔐 لوحة المالك
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
