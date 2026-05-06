/**
 * إدارة الأجهزة المتصلة بالحاسوب — طابعات وماسحات.
 * - في Electron: يستخدم window.galaxyAPI الذي يفضحه preload.cjs.
 * - في المتصفح: يعتمد على Web HID API و navigator.hid.
 */

export interface PrinterInfo {
  name: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  status?: string | number;
}

export interface ScannerInfo {
  id: string;
  name: string;
  vendorId?: number;
  productId?: number;
  kind: "usb-hid" | "bluetooth";
}

export interface LanHostStatus {
  running: boolean;
  port: number;
  serverId: string | null;
  ips: { name: string; address: string }[];
  peerCount: number;
  peers: { deviceId: string; deviceName: string }[];
  hasToken: boolean;
}

interface GalaxyAPI {
  isElectron: boolean;
  listPrinters?: () => Promise<PrinterInfo[]>;
  printSilent?: (
    html: string,
    printerName: string | null,
    options?: { silent?: boolean; size?: "thermal" | "a4" },
  ) => Promise<{ ok: boolean; error?: string }>;
  // LAN sync host (Electron only)
  lanStart?: (opts?: { port?: number; token?: string | null }) => Promise<{ ok: boolean; status?: LanHostStatus; error?: string }>;
  lanStop?: () => Promise<{ ok: boolean; status?: LanHostStatus; error?: string }>;
  lanStatus?: () => Promise<{ ok: boolean; status?: LanHostStatus; error?: string }>;
}

declare global {
  interface Window {
    galaxyAPI?: GalaxyAPI;
  }
}

export function isRunningInElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.galaxyAPI?.isElectron);
}

export async function listSystemPrinters(): Promise<PrinterInfo[]> {
  if (isRunningInElectron() && window.galaxyAPI?.listPrinters) {
    try {
      return await window.galaxyAPI.listPrinters();
    } catch {
      return [];
    }
  }
  // المتصفح لا يعرض قائمة الطابعات لاعتبارات الخصوصية — نعيد قائمة فارغة.
  return [];
}

export async function pairHidScanner(): Promise<ScannerInfo | null> {
  if (typeof navigator === "undefined" || !("hid" in navigator)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hid = (navigator as any).hid;
    const devices = await hid.requestDevice({ filters: [] });
    if (!devices || devices.length === 0) return null;
    const d = devices[0];
    return {
      id: `${d.vendorId ?? 0}:${d.productId ?? 0}`,
      name: d.productName || "HID Scanner",
      vendorId: d.vendorId,
      productId: d.productId,
      kind: "usb-hid",
    };
  } catch {
    return null;
  }
}

export function isHidSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}
