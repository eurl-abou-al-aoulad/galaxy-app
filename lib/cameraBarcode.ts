/**
 * useCameraBarcode — مسح باركود بكاميرا الهاتف.
 *  - داخل Capacitor: يستخدم @capacitor-mlkit/barcode-scanning (سريع، أوفلاين)
 *  - في المتصفح: ينعطف على Web BarcodeDetector إن توفر، وإلا يطلب صورة من الكاميرا
 *
 * مهم: لا يستورد Capacitor إلا عند الطلب باش ما يطيحش بناء SSR.
 */
export interface CameraBarcodeResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor يحقن window.Capacitor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

export async function scanBarcodeWithCamera(): Promise<CameraBarcodeResult> {
  if (typeof window === "undefined") return { ok: false, error: "no_window" };

  // ====== Capacitor (Android/iOS) ======
  if (isNativeApp()) {
    try {
      const mod = await import("@capacitor-mlkit/barcode-scanning");
      const { BarcodeScanner } = mod;
      const granted = await BarcodeScanner.requestPermissions();
      if (granted.camera !== "granted") {
        return { ok: false, error: "permission_denied" };
      }
      const { barcodes } = await BarcodeScanner.scan();
      const code = barcodes?.[0]?.rawValue ?? barcodes?.[0]?.displayValue;
      if (code) return { ok: true, value: String(code) };
      return { ok: false, error: "no_barcode" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "scan_failed";
      return { ok: false, error: msg };
    }
  }

  // ====== متصفح حديث: BarcodeDetector ======
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const detector = new BD({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"],
      });
      const deadline = Date.now() + 15000;
      let result: string | null = null;
      while (Date.now() < deadline && !result) {
        const codes = await detector.detect(video);
        if (codes.length > 0) result = String(codes[0].rawValue);
        else await new Promise((r) => setTimeout(r, 200));
      }
      stream.getTracks().forEach((t) => t.stop());
      if (result) return { ok: true, value: result };
      return { ok: false, error: "timeout" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "scan_failed";
      return { ok: false, error: msg };
    }
  }

  return { ok: false, error: "unsupported_browser" };
}
