// كاشف أدوات المطوّر — نسخة مُحسّنة لتقليل الإنذارات الكاذبة
// المبدأ: نقفل فقط على إشارات موثوقة 100% (اختصارات DevTools الصريحة)
// تم إلغاء: قياس debugger، قياس أبعاد النافذة، القفل عند النقر اليمين

let listeners: Array<() => void> = [];

export type DevToolsEvent = "open" | "shortcut" | "context";

export function installAntiDebug(onDetect: (e: DevToolsEvent) => void) {
  if (typeof window === "undefined") return () => undefined;
  if (import.meta.env.DEV) return () => undefined; // مفعّل في الإنتاج فقط

  // داخل iframe (مثل معاينة Lovable) لا نفعّل القفل إطلاقاً
  try {
    if (window.self !== window.top) return () => undefined;
  } catch {
    // cross-origin iframe → لا نفعّل
    return () => undefined;
  }

  // عدّاد محاولات الاختصارات (يجب محاولتان خلال 5 ثوانٍ لتفعيل القفل)
  let shortcutAttempts = 0;
  let lastAttemptAt = 0;

  const block = (e: KeyboardEvent) => {
    const k = e.key?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // اختصارات DevTools فقط (إشارة موثوقة وصريحة)
    const isDevToolsShortcut =
      k === "f12" ||
      (ctrl && e.shiftKey && (k === "i" || k === "j" || k === "c"));

    // Ctrl+U / Ctrl+S → نمنعها بصمت بدون قفل (مزعج للمستخدم العادي)
    const isViewSourceShortcut = ctrl && (k === "u" || k === "s");

    if (isDevToolsShortcut) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastAttemptAt > 5000) shortcutAttempts = 0;
      shortcutAttempts++;
      lastAttemptAt = now;
      // نطلب محاولتين متتاليتين لتقليل النقر العرضي
      if (shortcutAttempts >= 2) {
        shortcutAttempts = 0;
        onDetect("shortcut");
      }
      return;
    }

    if (isViewSourceShortcut) {
      e.preventDefault();
      e.stopPropagation();
      // لا نقفل
    }
  };

  // منع قائمة النقر اليمين بدون تفعيل القفل (مجرد منع صامت)
  const blockMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  window.addEventListener("keydown", block, { capture: true });
  window.addEventListener("contextmenu", blockMenu, { capture: true });

  listeners.push(() => {
    window.removeEventListener("keydown", block, { capture: true } as EventListenerOptions);
    window.removeEventListener("contextmenu", blockMenu, { capture: true } as EventListenerOptions);
  });

  return () => {
    listeners.forEach((fn) => fn());
    listeners = [];
  };
}
