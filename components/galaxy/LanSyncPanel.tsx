/**
 * Galaxy LAN Sync Panel — تبويب في الإعدادات
 * يعمل في وضعين:
 *  - "host": هذا الجهاز يفتح خادم WS محلي (Electron فقط)
 *  - "client": هذا الجهاز يتصل بمضيف LAN آخر
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wifi, WifiOff, Server, Plug, Copy, Check, Power } from "lucide-react";
import { toast } from "sonner";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { lanSyncClient, getDeviceName, type LanSyncState } from "@/lib/lanSync";
import type { LanHostStatus } from "@/lib/devices";

type HostStatus = LanHostStatus;

export function LanSyncPanel() {
  const { t } = useTranslation();
  const isElectron = !!(typeof window !== "undefined" && window.galaxyAPI?.isElectron);

  // — Host state (Electron only)
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null);
  const [hostBusy, setHostBusy] = useState(false);

  // — Client state
  const [clientState, setClientState] = useState<LanSyncState>(lanSyncClient.getState());
  const [ipInput, setIpInput] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem("galaxy.lan.url") ?? "";
    if (saved) {
      const m = saved.match(/^ws:\/\/([^:]+):/);
      return m ? m[1] : "";
    }
    return "";
  });
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  useEffect(() => lanSyncClient.subscribe(setClientState), []);

  useEffect(() => {
    if (!isElectron || !window.galaxyAPI?.lanStatus) return;
    let active = true;
    const refresh = async () => {
      const r = await window.galaxyAPI!.lanStatus!();
      if (active && r.ok && r.status) setHostStatus(r.status);
    };
    void refresh();
    const i = setInterval(refresh, 4000);
    return () => { active = false; clearInterval(i); };
  }, [isElectron]);

  const startHost = async () => {
    if (!window.galaxyAPI?.lanStart) return;
    setHostBusy(true);
    const r = await window.galaxyAPI.lanStart({});
    setHostBusy(false);
    if (r.ok && r.status) {
      setHostStatus(r.status);
      toast.success(t("lan_sync.host_started"));
    } else {
      toast.error(r.error || t("lan_sync.host_start_failed"));
    }
  };

  const stopHost = async () => {
    if (!window.galaxyAPI?.lanStop) return;
    setHostBusy(true);
    const r = await window.galaxyAPI.lanStop();
    setHostBusy(false);
    if (r.ok && r.status) setHostStatus(r.status);
  };

  const connectClient = () => {
    const ip = ipInput.trim();
    if (!ip) { toast.error(t("lan_sync.enter_ip")); return; }
    const url = ip.startsWith("ws://") || ip.startsWith("wss://") ? ip : `ws://${ip}:4555`;
    lanSyncClient.connect(url, null);
    toast.success(t("lan_sync.connecting"));
  };

  const disconnectClient = () => {
    lanSyncClient.disconnect();
    toast.success(t("lan_sync.disconnected"));
  };

  const copyIp = async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 1500);
    } catch (_) { /* noop */ }
  };

  const statusColor =
    clientState.status === "connected" ? "text-emerald-400"
    : clientState.status === "connecting" ? "text-amber-400"
    : clientState.status === "error" ? "text-red-400"
    : "text-muted-foreground";

  const statusLabel =
    clientState.status === "connected" ? t("lan_sync.status_connected")
    : clientState.status === "connecting" ? t("lan_sync.status_connecting")
    : clientState.status === "error" ? t("lan_sync.status_error")
    : t("lan_sync.status_off");

  return (
    <div className="glass-card rounded-2xl p-5 border-primary/30 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Wifi className="h-5 w-5 text-primary" /> {t("lan_sync.title")}
        </h2>
        <div className={`text-xs font-semibold flex items-center gap-1 ${statusColor}`}>
          {clientState.status === "off" ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          {statusLabel}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{t("lan_sync.desc")}</p>

      {/* ============== HOST (Electron only) ============== */}
      {isElectron && (
        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" /> {t("lan_sync.host_title")}
            </h3>
            {hostStatus?.running ? (
              <NeonButton variant="destructive" onClick={stopHost} disabled={hostBusy}>
                <Power className="h-4 w-4" /> {t("lan_sync.stop")}
              </NeonButton>
            ) : (
              <NeonButton variant="primary" onClick={startHost} disabled={hostBusy}>
                <Power className="h-4 w-4" /> {t("lan_sync.start")}
              </NeonButton>
            )}
          </div>

          {hostStatus?.running ? (
            <>
              <p className="text-xs text-muted-foreground">{t("lan_sync.host_share_hint")}</p>
              <div className="space-y-1.5">
                {hostStatus.ips.length === 0 ? (
                  <div className="text-xs text-amber-400">{t("lan_sync.no_ips")}</div>
                ) : (
                  hostStatus.ips.map((ip) => (
                    <div key={ip.address} className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2">
                      <div className="font-mono text-sm">{ip.address}<span className="text-muted-foreground ms-1">:{hostStatus.port}</span></div>
                      <button
                        onClick={() => copyIp(`${ip.address}:${hostStatus.port}`)}
                        className="text-xs text-primary hover:opacity-80 inline-flex items-center gap-1"
                      >
                        {copiedIp === `${ip.address}:${hostStatus.port}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedIp === `${ip.address}:${hostStatus.port}` ? t("lan_sync.copied") : t("lan_sync.copy")}
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("lan_sync.connected_peers", { count: hostStatus.peerCount })}
              </div>
              {hostStatus.peers.length > 0 && (
                <ul className="text-xs space-y-0.5 ps-4 list-disc">
                  {hostStatus.peers.map((p) => <li key={p.deviceId}>{p.deviceName}</li>)}
                </ul>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("lan_sync.host_off_hint")}</p>
          )}
        </div>
      )}

      {/* ============== CLIENT ============== */}
      <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> {t("lan_sync.client_title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("lan_sync.client_desc")}</p>

        <div className="text-[11px] text-muted-foreground">
          {t("lan_sync.this_device")}: <span className="font-mono">{getDeviceName()}</span>
        </div>

        {clientState.status === "connected" || clientState.status === "connecting" ? (
          <>
            <div className="text-xs">
              <span className="text-muted-foreground">{t("lan_sync.connected_to")}:</span>{" "}
              <span className="font-mono">{clientState.url}</span>
            </div>
            {clientState.peers.length > 0 && (
              <div className="text-xs">
                <div className="text-muted-foreground mb-1">{t("lan_sync.other_peers")}:</div>
                <ul className="space-y-0.5 ps-4 list-disc">
                  {clientState.peers.map((p) => <li key={p.deviceId}>{p.deviceName}</li>)}
                </ul>
              </div>
            )}
            {clientState.lastSyncAt && (
              <div className="text-[11px] text-muted-foreground">
                {t("lan_sync.last_sync")}: {new Date(clientState.lastSyncAt).toLocaleTimeString()}
              </div>
            )}
            <NeonButton variant="destructive" onClick={disconnectClient}>
              <WifiOff className="h-4 w-4" /> {t("lan_sync.disconnect")}
            </NeonButton>
          </>
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
                {t("lan_sync.host_ip_label")}
              </label>
              <input
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="192.168.1.10"
                className="input-galaxy"
                inputMode="decimal"
              />
            </div>
            <NeonButton variant="primary" onClick={connectClient}>
              <Plug className="h-4 w-4" /> {t("lan_sync.connect")}
            </NeonButton>
          </div>
        )}
        {clientState.status === "error" && clientState.lastError && (
          <div className="text-xs text-red-400">{t("lan_sync.error_prefix")}: {clientState.lastError}</div>
        )}
      </div>
    </div>
  );
}
