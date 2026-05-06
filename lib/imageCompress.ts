/**
 * ضغط صور المنتجات إلى WebP صغير (~30KB) قابل للتخزين كـ Data URL في IndexedDB
 * بدون أي تبعيات خارجية — يستخدم Canvas المتوفر في كل المتصفحات
 */

export interface CompressOptions {
  maxSize?: number;       // أكبر بُعد بالبكسل (افتراضي 400)
  quality?: number;       // 0..1 (افتراضي 0.75)
  mimeType?: "image/webp" | "image/jpeg"; // الافتراضي webp
}

const DEFAULTS: Required<CompressOptions> = {
  maxSize: 400,
  quality: 0.75,
  mimeType: "image/webp",
};

/**
 * يقرأ ملف صورة ويعيده كـ Data URL مضغوط
 */
export async function compressImageFile(
  file: File | Blob,
  opts: CompressOptions = {},
): Promise<string> {
  const { maxSize, quality, mimeType } = { ...DEFAULTS, ...opts };

  // 1) قراءة الملف
  const dataUrl = await readAsDataURL(file);

  // 2) تحميله في Image
  const img = await loadImage(dataUrl);

  // 3) حساب الأبعاد الجديدة
  let { width, height } = img;
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((height / width) * maxSize);
      width = maxSize;
    } else {
      width = Math.round((width / height) * maxSize);
      height = maxSize;
    }
  }

  // 4) رسم على Canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-not-supported");
  ctx.drawImage(img, 0, 0, width, height);

  // 5) إخراج WebP (مع fallback لـ JPEG في متصفحات قديمة)
  let out = canvas.toDataURL(mimeType, quality);
  if (!out.startsWith(`data:${mimeType}`)) {
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read-failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("invalid-image"));
    img.src = src;
  });
}

/** الحجم التقريبي بالكيلوبايت لـ Data URL */
export function dataUrlSizeKB(dataUrl: string): number {
  // base64: كل 4 أحرف ≈ 3 بايت
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4 / 1024);
}
