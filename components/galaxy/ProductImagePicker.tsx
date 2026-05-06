/**
 * منتقي صور المنتج — يضغط الصورة ويخزنها كـ Data URL محلياً
 * • التقاط من الكاميرا (هاتف) أو اختيار من الجهاز
 * • معاينة فورية + إمكانية الحذف
 * • ضغط تلقائي لـ WebP 400px (~30KB)
 */
import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { compressImageFile, dataUrlSizeKB } from "@/lib/imageCompress";

interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  /** أكبر بُعد للصورة المحفوظة (افتراضي 400px) */
  maxSize?: number;
}

export function ProductImagePicker({ value, onChange, maxSize = 400 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("الملف ليس صورة");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImageFile(file, { maxSize, quality: 0.75 });
      const sizeKB = dataUrlSizeKB(dataUrl);
      onChange(dataUrl);
      toast.success(`تم ضغط الصورة (${sizeKB} كيلوبايت)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل ضغط الصورة");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* المعاينة */}
        <div className="relative h-24 w-24 rounded-xl bg-muted/30 border-2 border-dashed border-border overflow-hidden flex items-center justify-center flex-shrink-0">
          {value ? (
            <img src={value} alt="معاينة" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          )}
          {busy && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* الأزرار */}
        <div className="flex-1 grid grid-cols-1 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="h-10 px-3 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 flex items-center justify-center gap-2 text-sm font-semibold transition disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> التقاط بالكاميرا
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-3 rounded-lg bg-muted hover:bg-muted/70 border border-border flex items-center justify-center gap-2 text-sm font-semibold transition disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" /> اختيار من الجهاز
          </button>
          {value && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(undefined)}
              className="h-9 px-3 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive border border-destructive/30 flex items-center justify-center gap-2 text-xs font-semibold transition disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> حذف الصورة
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        💾 الصورة تُحفظ محلياً مضغوطة (~30 كيلوبايت). لا تستهلك مساحة سحابية.
      </p>

      {/* inputs مخفية */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
