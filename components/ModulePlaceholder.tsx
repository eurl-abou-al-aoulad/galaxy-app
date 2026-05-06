import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

export function ModulePlaceholder({ titleKey, icon: Icon = Construction }: { titleKey: string; icon?: LucideIcon }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary" /> {t(titleKey)}
      </h1>
      <div className="glass-card rounded-3xl p-12 text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/30 to-primary/20 neon-glow-accent mb-4 animate-neon-pulse">
          <Icon className="h-10 w-10 text-accent" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t(titleKey)}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          هذه الوحدة جاهزة هيكلياً وستُكتمل وظيفياً في الجولة القادمة بنفس جودة الوحدات المنجزة.
        </p>
      </div>
    </div>
  );
}

// Re-exportable factory for route components
export const placeholderRoute = (path: string, titleKey: string, icon?: LucideIcon) =>
  createFileRoute(path as "/app/$sectionId/$role/debts")({
    component: () => <ModulePlaceholder titleKey={titleKey} icon={icon} />,
  });
