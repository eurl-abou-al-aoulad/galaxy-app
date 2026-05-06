/**
 * Galaxy LAN Sync — عميل WebSocket في الواجهة
 *
 * يعمل على الجهاز الرئيسي (محلياً ws://127.0.0.1:4555) أو على الجهاز
 * الثانوي (ws://<ip>:4555). يلتقط أي تغيير على Dexie ويبثّه، ويستقبل
 * تغييرات الأقران ويطبّقها بدون إنشاء حلقة صدى.
 *
 * حل التعارض: Last-Write-Wins حسب updatedAt + كسر التعادل بـ deviceId.
 *
 * ⚠️ يعمل فقط داخل المتصفح — لا يستدعى أبداً في SSR.
 */
import { db } from "@/lib/db";
import type { Table } from "dexie";

type Op = "put" | "delete";
type WireMsg =
  | { t: "hello"; deviceId: string; deviceName: string; token?: string | null }
  | { t: "welcome"; serverId: string; peers: { deviceId: string; deviceName: string }[] }
  | { t: "auth_fail" }
  | { t: "op"; op: Op; table: string; key: unknown; value?: unknown; updatedAt: number; deviceId: string }
  | { t: "peer_join" | "peer_leave"; deviceId: string; deviceName: string }
  | { t: "ping" } | { t: "pong" };

// الجداول التي تُزامَن (نتجنّب activation/auditLog لأسباب أمنية وضوضاء)
const SYNCED_TABLES = [
  "settings",
  "workers",
  "products",
  "invoices",
  "debts",
  "customers",
  "expenses",
  "suppliers",
  "invoiceCounters",
  "repairDevices",
  "tasks",
] as const;

const STORAGE_KEYS = {
  deviceId: "galaxy.lan.deviceId",
  deviceName: "galaxy.lan.deviceName",
  enabled: "galaxy.lan.enabled",
  url: "galaxy.lan.url",
  token: "galaxy.lan.token",
};

function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

function getDeviceName(): string {
  if (typeof window === "undefined") return "ssr";
  let name = localStorage.getItem(STORAGE_KEYS.deviceName);
  if (!name) {
    name = `Galaxy-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    localStorage.setItem(STORAGE_KEYS.deviceName, name);
  }
  return name;
}

export type LanSyncState = {
  status: "off" | "connecting" | "connected" | "error";
  url: string | null;
  peers: { deviceId: string; deviceName: string }[];
  lastError?: string;
  lastSyncAt?: number;
};

class LanSyncClient {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private token: string | null = null;
  private hooksInstalled = false;
  private suppressNext = new Set<string>(); // table:op:key:updatedAt — لمنع الصدى
  private listeners = new Set<(s: LanSyncState) => void>();
  private state: LanSyncState = { status: "off", url: null, peers: [] };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  getState(): LanSyncState { return this.state; }

  subscribe(cb: (s: LanSyncState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private setState(patch: Partial<LanSyncState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** اتصل بمضيف LAN. مثال: ws://192.168.1.10:4555 */
  connect(url: string, token: string | null = null) {
    this.disconnect();
    this.url = url;
    this.token = token;
    localStorage.setItem(STORAGE_KEYS.url, url);
    localStorage.setItem(STORAGE_KEYS.enabled, "1");
    if (token) localStorage.setItem(STORAGE_KEYS.token, token);
    else localStorage.removeItem(STORAGE_KEYS.token);
    this.installHooks();
    this.openSocket();
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch (_) { /* noop */ }
      this.ws = null;
    }
    this.setState({ status: "off", url: null, peers: [] });
    localStorage.setItem(STORAGE_KEYS.enabled, "0");
  }

  private openSocket() {
    if (!this.url) return;
    this.setState({ status: "connecting", url: this.url });
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); }
    catch (e) {
      this.setState({ status: "error", lastError: e instanceof Error ? e.message : String(e) });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      const hello: WireMsg = {
        t: "hello",
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        token: this.token,
      };
      try { ws.send(JSON.stringify(hello)); } catch (_) { /* noop */ }
    };

    ws.onmessage = (ev) => {
      let msg: WireMsg;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString()); }
      catch { return; }
      this.handleMessage(msg);
    };

    ws.onerror = () => {
      this.setState({ status: "error", lastError: "ws_error" });
    };

    ws.onclose = () => {
      this.ws = null;
      this.setState({ status: "error" });
      this.scheduleReconnect();
    };

    // ping تطبيقي كل 25 ثانية
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify({ t: "ping" })); } catch (_) { /* noop */ }
      }
    }, 25_000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.url) return;
    if (localStorage.getItem(STORAGE_KEYS.enabled) !== "1") return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 4_000);
  }

  private handleMessage(msg: WireMsg) {
    switch (msg.t) {
      case "welcome":
        this.setState({ status: "connected", peers: msg.peers || [] });
        return;
      case "auth_fail":
        this.setState({ status: "error", lastError: "auth_fail" });
        try { this.ws?.close(); } catch (_) { /* noop */ }
        return;
      case "peer_join":
        this.setState({ peers: [...this.state.peers.filter((p) => p.deviceId !== msg.deviceId), { deviceId: msg.deviceId, deviceName: msg.deviceName }] });
        return;
      case "peer_leave":
        this.setState({ peers: this.state.peers.filter((p) => p.deviceId !== msg.deviceId) });
        return;
      case "op":
        void this.applyRemoteOp(msg);
        return;
    }
  }

  // ---------- Outbound: Dexie hooks ----------

  private installHooks() {
    if (this.hooksInstalled) return;
    this.hooksInstalled = true;
    for (const tableName of SYNCED_TABLES) {
      const table = (db as unknown as Record<string, Table | undefined>)[tableName];
      if (!table || !table.hook) continue;

      table.hook("creating", (primKey, obj) => {
        // Dexie: في وقت "creating" المفتاح قد يكون undefined لـ ++id
        // نؤجل البث إلى بعد success
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this as unknown as { onsuccess?: (k: unknown) => void };
        that.onsuccess = (key: unknown) => {
          this.queueLocalOp("put", tableName, key, obj);
        };
      });

      table.hook("updating", (mods, primKey, obj) => {
        const merged = { ...obj, ...mods };
        // إذا كان التعديل بسبب op وارد، تخطّ
        const updatedAt = (merged as { updatedAt?: number }).updatedAt ?? Date.now();
        const sig = `${tableName}:put:${String(primKey)}:${updatedAt}`;
        if (this.suppressNext.has(sig)) {
          this.suppressNext.delete(sig);
          return;
        }
        this.queueLocalOp("put", tableName, primKey, merged);
      });

      table.hook("deleting", (primKey) => {
        const sig = `${tableName}:delete:${String(primKey)}`;
        if (this.suppressNext.has(sig)) {
          this.suppressNext.delete(sig);
          return;
        }
        this.queueLocalOp("delete", tableName, primKey, undefined);
      });
    }
  }

  private queueLocalOp(op: Op, table: string, key: unknown, value: unknown) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    const updatedAt =
      (value && typeof value === "object" && "updatedAt" in value && typeof (value as { updatedAt: unknown }).updatedAt === "number"
        ? (value as { updatedAt: number }).updatedAt
        : Date.now());
    const wire: WireMsg = {
      t: "op",
      op,
      table,
      key,
      value: op === "put" ? value : undefined,
      updatedAt,
      deviceId: getDeviceId(),
    };
    try {
      this.ws.send(JSON.stringify(wire));
      this.setState({ lastSyncAt: Date.now() });
    } catch (_) { /* noop */ }
  }

  // ---------- Inbound: تطبيق عملية بعيدة ----------

  private async applyRemoteOp(msg: Extract<WireMsg, { t: "op" }>) {
    if (msg.deviceId === getDeviceId()) return; // صدى ذاتي

    const table = (db as unknown as Record<string, Table | undefined>)[msg.table];
    if (!table) return;

    try {
      if (msg.op === "put") {
        // LWW: لا تستبدل سجلاً أحدث
        try {
          const existing = await table.get(msg.key as never);
          if (existing && typeof existing === "object" && "updatedAt" in existing) {
            const localTs = (existing as { updatedAt?: number }).updatedAt ?? 0;
            if (localTs > msg.updatedAt) return;
          }
        } catch (_) { /* noop */ }

        const sig = `${msg.table}:put:${String(msg.key)}:${msg.updatedAt}`;
        this.suppressNext.add(sig);
        await table.put(msg.value as never, msg.key as never);
      } else if (msg.op === "delete") {
        const sig = `${msg.table}:delete:${String(msg.key)}`;
        this.suppressNext.add(sig);
        await table.delete(msg.key as never);
      }
      this.setState({ lastSyncAt: Date.now() });
    } catch (e) {
      console.warn("[lan-sync] apply remote op failed:", e);
    }
  }
}

export const lanSyncClient = new LanSyncClient();

/** تشغيل تلقائي عند الإقلاع إذا كان مفعّلاً */
export function autoStartLanSync() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.enabled) !== "1") return;
  const url = localStorage.getItem(STORAGE_KEYS.url);
  if (!url) return;
  const token = localStorage.getItem(STORAGE_KEYS.token);
  lanSyncClient.connect(url, token);
}

export const LAN_SYNC_KEYS = STORAGE_KEYS;
export { getDeviceId, getDeviceName };
