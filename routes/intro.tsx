import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FastForward } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";
import logoUrl from "@/assets/galaxy-logo.png";

export const Route = createFileRoute("/intro")({
  component: IntroVideo,
});

function IntroVideo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  // شاشة انترو سينمائية مدتها 6 ثوان (يمكن استبدالها بفيديو mp4 لاحقاً)
  useEffect(() => {
    const start = Date.now();
    const duration = 6000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / duration) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        navigate({ to: "/home" });
      }
    }, 50);
    return () => clearInterval(interval);
  }, [navigate]);

  const skip = () => navigate({ to: "/home" });

  return (
    <div className="gateway-bg fixed inset-0 flex items-center justify-center overflow-hidden">
      {/* تأثيرات كونية متحركة */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--primary-glow), transparent 70%)",
            opacity: 0.25,
            animation: "neon-pulse 3s ease-in-out infinite",
          }}
        />
        {/* حلقات مدارية */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full border border-primary/20 animate-orbit"
            style={{
              width: `${300 + i * 150}px`,
              height: `${300 + i * 150}px`,
              marginTop: `-${(300 + i * 150) / 2}px`,
              marginLeft: `-${(300 + i * 150) / 2}px`,
              animationDuration: `${15 + i * 5}s`,
              animationDirection: i % 2 === 0 ? "reverse" : "normal",
            }}
          >
            <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-accent neon-glow-accent" />
          </div>
        ))}
      </div>

      {/* الشعار في المنتصف */}
      <div className="relative z-10 text-center animate-cosmic-in">
        <div className="inline-flex relative mb-8">
          <div className="absolute inset-0 rounded-full bg-primary/40 blur-3xl animate-neon-pulse" />
          <img
            src={logoUrl}
            alt="GALAXY"
            className="relative h-40 w-40 object-contain drop-shadow-[0_0_40px_rgba(0,229,255,0.8)]"
          />
        </div>

        <h1
          className="text-5xl md:text-7xl font-black tracking-widest text-gradient-galaxy mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          GALAXY
        </h1>
        <p className="text-sm md:text-base tracking-[0.4em] text-accent-glow uppercase neon-text-accent mb-12">
          Accounting Software
        </p>

        <p className="text-sm text-muted-foreground mb-2">{t("intro.loading")}</p>

        {/* شريط التقدم */}
        <div className="w-72 mx-auto h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent neon-glow transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* زر تخطي */}
      <button
        onClick={skip}
        className="absolute bottom-8 right-8 glass-card rounded-xl px-5 py-3 text-sm font-semibold flex items-center gap-2 hover:border-accent transition-colors z-20"
      >
        <FastForward className="h-4 w-4" />
        {t("actions.skip")}
      </button>

      {/* شعار صغير في الأعلى */}
      <div className="absolute top-6 left-6 opacity-60">
        <GalaxyLogo size="sm" />
      </div>
    </div>
  );
}
