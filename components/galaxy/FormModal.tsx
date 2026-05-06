import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  size?: "md" | "lg" | "xl" | "xxl" | "full";
}

/**
 * نافذة منبثقة بثلاث مناطق ثابتة:
 *  - Header ثابت في الأعلى
 *  - Body فقط هو الذي يتمرر (overflow-y-auto)
 *  - Footer ثابت في الأسفل دائماً (أزرار الحفظ/التسديد/الدين تبقى مرئية مهما كان طول النموذج)
 *
 * تستعمل وحدات `dvh` لاحتساب ارتفاع الشاشة الفعلي على الموبايل/النوافذ الصغيرة،
 * مع `overflow-hidden` على الحاوية الخارجية لمنع تمرير الصفحة كاملةً.
 */
export function FormModal({ title, onClose, children, footer, size = "lg" }: Props) {
  const mouseDownOnBackdropRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (active as HTMLElement).isContentEditable
        ) {
          return;
        }
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);

    // تركيز تلقائي على أول حقل قابل للإدخال
    const focusTimer = window.setTimeout(() => {
      const first = cardRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])",
      );
      first?.focus();
    }, 60);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [onClose]);

  const handleBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    mouseDownOnBackdropRef.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnBackdropRef.current = false;
  };

  // الحجم لم يعد يضيّق النافذة — كل النوافذ ملء الشاشة
  void size;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-hidden"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
      }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={cardRef}
        className="bg-card flex flex-col flex-1 min-h-0 w-full animate-cosmic-in"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {/* Header — ثابت أعلى الشاشة */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border/40 bg-card/95 backdrop-blur-sm">
          <h2 className="text-lg md:text-xl font-bold text-gradient-galaxy truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — منطقة التمرير الوحيدة */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 py-4 md:py-5">
          {children}
        </div>

        {/* Footer — ثابت أسفل الشاشة دائماً (أزرار الحفظ/التسديد/الدين) */}
        <div
          className="shrink-0 px-3 md:px-6 py-3 border-t border-border/40 bg-card/95 backdrop-blur-sm
                     grid grid-cols-1 sm:flex sm:flex-wrap sm:justify-end gap-2
                     [&>button]:w-full sm:[&>button]:w-auto"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {footer}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(modal, document.body);
}
