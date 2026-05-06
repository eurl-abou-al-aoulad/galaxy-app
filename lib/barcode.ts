import JsBarcode from "jsbarcode";
import type { SectionId } from "./db";

/**
 * توليد كود باركود قصير ومتوافق مع CODE128
 * يستخدم: حرف القسم + timestamp بنظام base36 + رقم عشوائي
 * مثال: SM-LX8KQA-42
 */
export function generateBarcode(section: SectionId): string {
  const sectionPrefix: Record<SectionId, string> = {
    clothing: "CL",
    supermarket: "SM",
    hardware: "HW",
    repair: "RP",
    factory: "FC",
  };
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.floor(Math.random() * 99).toString().padStart(2, "0");
  return `${sectionPrefix[section]}${ts}${rand}`;
}

/**
 * تحقق إذا كان الباركود مولّداً تلقائياً
 */
export function isAutoBarcode(barcode: string): boolean {
  return /^(CL|SM|HW|RP|FC)[A-Z0-9]{6}\d{2}$/.test(barcode);
}

/**
 * رسم باركود في عنصر SVG
 */
export function renderBarcodeSvg(
  element: SVGSVGElement,
  value: string,
  opts?: { width?: number; height?: number; fontSize?: number; displayValue?: boolean },
) {
  try {
    JsBarcode(element, value, {
      format: "CODE128",
      width: opts?.width ?? 1.6,
      height: opts?.height ?? 50,
      fontSize: opts?.fontSize ?? 14,
      displayValue: opts?.displayValue ?? true,
      margin: 4,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch (e) {
    console.error("Barcode generation failed", e);
  }
}

/**
 * إنشاء dataURL لصورة PNG من باركود
 */
export function barcodeToPngDataUrl(value: string): string {
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, value, {
      format: "CODE128",
      width: 2,
      height: 60,
      fontSize: 16,
      displayValue: true,
      margin: 6,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * أحجام الملصقات بالميليمتر
 */
export const LABEL_SIZES = {
  small: { w: 30, h: 20, label: "30×20mm" },
  medium: { w: 40, h: 30, label: "40×30mm" },
  large: { w: 50, h: 40, label: "50×40mm" },
  a4_grid: { w: 50, h: 30, label: "A4 شبكة" },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;
