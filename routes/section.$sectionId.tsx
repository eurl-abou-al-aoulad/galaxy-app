import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ShieldCheck, User, ArrowRight, Lock, Sparkles, ChevronRight, Eye, EyeOff, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, ALL_SECTIONS, type SectionId } from "@/lib/db";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";
import { NeonButton } from "@/components/galaxy/NeonButton";

export const Route = createFileRoute("/section/$sectionId")({
  component: SectionGate,
  beforeLoad: ({ params }) => {
    if (!ALL_SECTIONS.includes(params.sectionId as SectionId)) {
      throw new Error("Invalid section");
    }
  },
});

function SectionGate() {
  const { t } = useTranslation();
  const { sectionId } = Route.useParams();
  const navigate = useNavigate();
  const [showWorkerLogin, setShowWorkerLogin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [code, setCode] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [, setTick] = useState(0);

  const settings = useLiveQuery(() => db.settings.get(1), []);
  const workers = useLiveQuery(
    () => db.workers.where("section").equals(sectionId).and((w) => w.active === 1).toArray(),
    [sectionId],
  );

  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [lockUntil]);

  const remainingLock = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));

  const submitAdmin = () => {
    if (remainingLock > 0) {
      toast.error(`⏱ ${remainingLock}s`);
      return;
    }
    const expected = settings?.adminPassword || "admin";
    if (adminPwd === expected) {
      setAdminPwd("");
      setAttempts(0);
      navigate({
        to: "/app/$sectionId/$role/dashboard",
        params: { sectionId, role: "admin" },
      });
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setAdminPwd("");
      if (next >= 3) {
        setLockUntil(Date.now() + 30_000);
        setAttempts(0);
        toast.error(t("admin_login.locked"));
      } else {
        toast.error(`${t("admin_login.wrong")} (${3 - next})`);
      }
    }
  };

  const submitWorker = () => {
    if (!code.trim()) return;
    const w = workers?.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
    if (!w) {
      toast.error(t("role.wrong_code"));
      return;
    }
    navigate({
      to: "/app/$sectionId/$role/invoices",
      params: { sectionId, role: "worker" },
      search: { workerCode: w.code },
    });
  };

  return (
    <div className="gateway-bg relative min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 md:p-6">
        <GalaxyLogo size="sm" />
        <Link to="/home" className="glass-card rounded-xl px-4 py-2 text-sm hover:border-accent transition-colors flex items-center gap-2">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          {t("actions.back")}
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl animate-cosmic-in">
          <div className="text-center mb-8">
            <div className="inline-flex relative mb-4">
              <div className="absolute inset-0 rounded-full bg-accent/30 blur-2xl animate-neon-pulse" />
              <div className="relative rounded-full bg-gradient-to-br from-accent to-accent-glow p-4 neon-glow-accent">
                <Sparkles className="h-12 w-12 text-accent-foreground" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gradient-galaxy mb-2">
              {t(`sections.${sectionId}`)}
            </h1>
            <p className="text-muted-foreground">{t("role.title")}</p>
          </div>

          {!showWorkerLogin && !showAdminLogin ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Admin */}
              <button
                onClick={() => setShowAdminLogin(true)}
                className="group glass-card card-3d rounded-3xl p-8 text-center"
              >
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow neon-glow mb-4 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="h-12 w-12 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{t("role.admin")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t("role.admin_desc")}</p>
                <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold">
                  <Lock className="h-4 w-4" /> {t("admin_login.title")}
                </div>
              </button>

              {/* Worker */}
              <button
                onClick={() => setShowWorkerLogin(true)}
                className="group glass-card card-3d rounded-3xl p-8 text-center"
              >
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-glow neon-glow-accent mb-4 group-hover:scale-110 transition-transform">
                  <User className="h-12 w-12 text-accent-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{t("role.worker")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t("role.worker_desc")}</p>
                <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold">
                  {t("role.enter_code")} <Lock className="h-4 w-4" />
                </div>
              </button>
            </div>
          ) : showAdminLogin ? (
            <div className="glass-card rounded-3xl p-8 max-w-md mx-auto">
              <div className="text-center mb-6">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow neon-glow mb-3">
                  <KeyRound className="h-9 w-9 text-primary-foreground" />
                </div>
                <h2 className="text-xl font-bold">{t("admin_login.title")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t("admin_login.hint")}</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={adminPwd}
                    onChange={(e) => setAdminPwd(e.target.value)}
                    placeholder={t("admin_login.placeholder")}
                    className="w-full h-14 rounded-xl bg-input border border-border px-4 pe-12 text-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    onKeyDown={(e) => e.key === "Enter" && submitAdmin()}
                    disabled={remainingLock > 0}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {remainingLock > 0 && (
                  <p className="text-center text-xs text-destructive font-bold">
                    🔒 {t("admin_login.locked_for", { sec: remainingLock })}
                  </p>
                )}
                <NeonButton
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={submitAdmin}
                  disabled={remainingLock > 0 || !adminPwd}
                >
                  {t("actions.submit")}
                </NeonButton>
              </div>

              <button
                onClick={() => { setShowAdminLogin(false); setAdminPwd(""); }}
                className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("actions.back")}
              </button>
            </div>
          ) : (
            <div className="glass-card rounded-3xl p-8 max-w-md mx-auto">
              <div className="text-center mb-6">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-glow neon-glow-accent mb-3">
                  <User className="h-9 w-9 text-accent-foreground" />
                </div>
                <h2 className="text-xl font-bold">{t("role.enter_code")}</h2>
              </div>

              {workers && workers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {t("role.no_workers")}
                </p>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={5}
                    placeholder={t("role.code_placeholder")}
                    className="w-full h-14 rounded-xl bg-input border border-border px-4 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    onKeyDown={(e) => e.key === "Enter" && submitWorker()}
                    autoFocus
                  />
                  <NeonButton variant="accent" size="lg" className="w-full" onClick={submitWorker}>
                    {t("actions.submit")}
                  </NeonButton>
                </div>
              )}

              <button
                onClick={() => { setShowWorkerLogin(false); setCode(""); }}
                className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("actions.back")}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
