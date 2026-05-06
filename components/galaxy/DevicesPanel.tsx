import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, ScanLine, Bluetooth, RefreshCw, Usb } from "lucide-react";
import { toast } from "sonner";
import { db, type SettingsRecord } from "@/lib/db";
import {
  listSystemPrinters,
  pairHidScanner,
  isRunningInElectron,
  isHidSupported,
  type PrinterInfo,
} from "@/lib/devices";
import { NeonButton } from "./NeonButton";

interface Props {
  settings: SettingsRecord;
}

export function DevicesPanel({ settings }: Props) {
  const { t } = useTranslation();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const electron = isRunningInElectron();
  const hidOk = isHidSupported();

  const enabled = settings.devicesEnabled === 1;

  const refresh = async () => {
    setLoading(true);
    const list = await listSystemPrinters();
    setPrinters(list);
    setLoading(false);
  };

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled]);

  const update = (patch: Partial<SettingsRecord>) => db.settings.update(1, patch);

  const setDefault = (kind: "thermal" | "a4", name: string) => {
    if (kind === "thermal") update({ defaultThermalPrinter: name });
    else update({ defaultPrinter: name });
    toast.success(t("common.saved"));
  };

  const pair = async () => {
    setScanning(true);
    const dev = await pairHidScanner();
    setScanning(false);
    if (!dev) {
      toast.error(t("settings.devices_none"));
      return;
    }
    update({ defaultScanner: dev.id });
    toast.success(`${dev.name} ✓`);
  };

  return (
    <div className="glass-card rounded-2xl p-5 border-accent/30">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Usb className="h-5 w-5 text-accent" /> {t("settings.devices_title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t("settings.devices_desc")}</p>
        </div>
        <button
          onClick={() => update({ devicesEnabled: enabled ? 0 : 1 })}
          className={`px-4 py-2 rounded-xl font-semibold border transition-all ${
            enabled
              ? "bg-success/20 border-success text-success"
              : "bg-muted/40 border-border text-muted-foreground"
          }`}
        >
          {enabled ? `✅ ${t("common.on")}` : `⭕ ${t("common.off")}`} — {t("settings.devices_enable")}
        </button>
      </div>

      {!enabled ? null : (
        <div className="space-y-5">
          {!electron && (
            <div className="rounded-xl bg-warning/10 border border-warning/40 px-3 py-2 text-xs text-warning">
              ⚠ {t("settings.devices_browser_only")}
            </div>
          )}

          {/* الطابعات */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Printer className="h-4 w-4" /> {t("settings.devices_printers")}
              </h3>
              <NeonButton variant="ghost" onClick={refresh} disabled={loading || !electron}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("settings.devices_detect")}
              </NeonButton>
            </div>

            {electron && printers.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">{t("settings.devices_none")}</div>
            ) : null}

            {printers.length > 0 && (
              <div className="space-y-2">
                {printers.map((p) => {
                  const isThermal = settings.defaultThermalPrinter === p.name;
                  const isA4 = settings.defaultPrinter === p.name;
                  return (
                    <div
                      key={p.name}
                      className="glass-card rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{p.displayName || p.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{p.description || p.name}</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setDefault("thermal", p.name)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                            isThermal
                              ? "bg-success/20 border-success text-success"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          {isThermal ? `★ ${t("settings.devices_thermal")}` : t("settings.devices_thermal")}
                        </button>
                        <button
                          onClick={() => setDefault("a4", p.name)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                            isA4
                              ? "bg-primary/20 border-primary text-primary"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          {isA4 ? `★ ${t("settings.devices_a4")}` : t("settings.devices_a4")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* الماسحات */}
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
              <ScanLine className="h-4 w-4" /> {t("settings.devices_scanners")}
            </h3>
            <div className="rounded-xl bg-success/10 border border-success/40 px-3 py-2 text-xs text-success mb-2">
              ✓ {t("settings.devices_usb_hid_active")}
            </div>
            {hidOk ? (
              <NeonButton variant="accent" onClick={pair} disabled={scanning}>
                <Bluetooth className="h-4 w-4" /> {t("settings.devices_pair_hid")}
              </NeonButton>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                {t("settings.devices_webhid_unsupported")}
              </div>
            )}
            {settings.defaultScanner && (
              <div className="text-[11px] text-muted-foreground mt-2">
                {t("settings.devices_default")}: <b>{settings.defaultScanner}</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
