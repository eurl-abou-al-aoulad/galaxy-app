import { useCallback, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type FocusEvent, type WheelEvent } from "react";
import { AlertCircle } from "lucide-react";

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * حقل موحّد بتسمية واضحة + علامة * إلزامية + رسالة خطأ تحت الحقل
 */
export function FormField({ label, required, error, hint, children, className = "" }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold mb-1.5 text-foreground">
        {label}
        {required && <span className="text-destructive ms-1">*</span>}
      </label>
      {children}
      {error ? (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-destructive font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/* ===== المدخلات الموحّدة ===== */

const baseInput = (hasError: boolean) =>
  `w-full h-12 px-3 rounded-xl bg-input border ${
    hasError ? "border-destructive ring-1 ring-destructive/40" : "border-border focus:border-primary"
  } outline-none transition-colors text-base md:text-sm`;

export function TextInput({
  error,
  onFocus,
  onWheel,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  // اختيار النص تلقائياً عند التركيز للحقول الرقمية → استبدال أسرع
  const handleFocus = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      if (props.type === "number") e.currentTarget.select();
      onFocus?.(e);
    },
    [onFocus, props.type],
  );
  // منع عجلة الفأرة من تغيير قيمة الحقول الرقمية بالخطأ
  const handleWheel = useCallback(
    (e: WheelEvent<HTMLInputElement>) => {
      if (props.type === "number") (e.currentTarget as HTMLInputElement).blur();
      onWheel?.(e);
    },
    [onWheel, props.type],
  );
  return (
    <input
      {...props}
      onFocus={handleFocus}
      onWheel={handleWheel}
      className={`${baseInput(!!error)} ${props.className ?? ""}`}
    />
  );
}

export function TextArea({ error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      {...props}
      className={`w-full min-h-[80px] p-3 rounded-xl bg-input border ${
        error ? "border-destructive ring-1 ring-destructive/40" : "border-border focus:border-primary"
      } outline-none transition-colors text-base md:text-sm ${props.className ?? ""}`}
    />
  );
}

export function SelectInput({ error, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return <select {...props} className={`${baseInput(!!error)} ${props.className ?? ""}`} />;
}

/**
 * شبكة قياسية للحقول: عمود على الجوال، عمودان على سطح المكتب
 */
export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const colsClass = cols === 1 ? "" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return <div className={`grid grid-cols-1 ${colsClass} gap-4`}>{children}</div>;
}

/**
 * عنوان مجموعة فرعية داخل النموذج
 */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 pb-2 border-b border-border/40">
        {title}
      </h3>
      {children}
    </div>
  );
}
