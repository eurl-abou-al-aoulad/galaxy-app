import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const NeonButton = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", children, loading, disabled, ...props }, ref) => {
    const variants = {
      primary:
        "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground neon-glow hover:brightness-110",
      accent:
        "bg-gradient-to-br from-accent to-accent-glow text-accent-foreground neon-glow-accent hover:brightness-110",
      ghost:
        "bg-card/50 backdrop-blur border border-primary/30 text-foreground hover:border-primary hover:bg-primary/10",
      destructive:
        "bg-gradient-to-br from-destructive to-destructive text-destructive-foreground hover:brightness-110",
    };
    const sizes = {
      sm: "h-9 px-4 text-sm",
      md: "h-11 px-6 text-base",
      lg: "h-14 px-8 text-lg",
    };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
NeonButton.displayName = "NeonButton";
