import logoUrl from "@/assets/galaxy-logo.png";

export function GalaxyLogo({ size = "md", showText = true }: { size?: "sm" | "md" | "lg" | "xl"; showText?: boolean }) {
  const sizes = {
    sm: { img: "h-9 w-9", text: "text-lg" },
    md: { img: "h-14 w-14", text: "text-2xl" },
    lg: { img: "h-24 w-24", text: "text-4xl" },
    xl: { img: "h-40 w-40", text: "text-6xl" },
  };
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-accent/40 blur-2xl animate-neon-pulse" />
        <img
          src={logoUrl}
          alt="GALAXY"
          className={`relative ${s.img} object-contain drop-shadow-[0_0_20px_rgba(0,229,255,0.7)]`}
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            className={`${s.text} font-bold tracking-wider text-gradient-galaxy`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            GALAXY
          </span>
          <span className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
            Accounting Software
          </span>
        </div>
      )}
    </div>
  );
}
