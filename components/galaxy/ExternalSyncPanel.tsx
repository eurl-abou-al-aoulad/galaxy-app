import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Upload, Copy, Check, RefreshCw, KeyRound, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  pushAllToExternal,
  getControlCode,
  setControlCode,
  getLastPushAt,
} from "@/lib/externalSync";
import { loadLicense } from "@/lib/license/storage";

export function ExternalSyncPanel() {
  const { t, i18n } = useTranslation();
  const [licenseCode, setLicenseCode] = useState<string>("");
  const [controlCodeState, setControlCodeState] = useState<string>("");
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastPush, setLastPush] = useState<number | null>(null);
  const [copied, setCopied] = useState<"license" | "control" | null>(null);

  useEffect(() => {
    void (async () => {
      const lic = await loadLicense();
      setLicenseCode(lic?.payload?.code ?? "");
      setControlCodeState(getControlCode());
      setLastPush(getLastPushAt());
    })();
  }, []);

  const handlePush = async () => {
    setBusy(true);
    try {
      const res = await pushAllToExternal();
      if (res.ok) {
        toast.success(t("i18n_extra.external_sync_push_ok", { count: res.count }));
        setLastPush(Date.now());
      } else {
        toast.error(res.error ?? t("i18n_extra.external_sync_push_failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (text: string, which: "license" | "control") => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
    toast.success(t("i18n_extra.external_sync_copied"));
  };

  const handleSaveControlCode = () => {
    const code = newCode.trim();
    if (code.length < 3) {
      toast.error(t("i18n_extra.external_sync_control_min"));
      return;
    }
    setControlCode(code);
    setControlCodeState(code);
    setEditingCode(false);
    toast.success(t("i18n_extra.external_sync_control_updated"));
  };

  if (!licenseCode) {
    return (
      <div className="glass-card rounded-2xl p-5 border-warning/40 bg-warning/5">
        <div className="flex items-center gap-2 text-warning">
          <AlertCircle className="h-5 w-5" />
          <span className="font-bold">{t("i18n_extra.external_sync_requires_activation")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-bold">{t("i18n_extra.external_sync_title")}</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("i18n_extra.external_sync_desc")}
      </p>

      {/* بيانات الدخول */}
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-input/40 p-3">
          <div className="text-xs text-muted-foreground mb-1">{t("i18n_extra.external_sync_license_code")}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm font-bold text-primary break-all">
              {licenseCode}
            </code>
            <button
              onClick={() => handleCopy(licenseCode, "license")}
              className="p-2 rounded-lg hover:bg-primary/20 text-primary"
              title={t("actions.copy")}
            >
              {copied === "license" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-input/40 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <KeyRound className="h-3 w-3" /> {t("i18n_extra.external_sync_control_code")}
            </div>
            {!editingCode && (
              <button
                onClick={() => {
                  setNewCode(controlCodeState);
                  setEditingCode(true);
                }}
                className="text-xs text-accent hover:underline"
              >
                {t("actions.edit")}
              </button>
            )}
          </div>
          {editingCode ? (
            <div className="flex items-center gap-2">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg bg-background border border-border focus:border-primary outline-none font-mono"
                placeholder={t("i18n_extra.external_sync_control_placeholder")}
                maxLength={32}
              />
              <button
                onClick={handleSaveControlCode}
                className="px-3 h-10 rounded-lg bg-success text-success-foreground font-bold"
              >
                {t("actions.save")}
              </button>
              <button
                onClick={() => setEditingCode(false)}
                className="px-3 h-10 rounded-lg bg-muted text-muted-foreground"
              >
                {t("actions.cancel")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg font-bold text-success">
                {controlCodeState}
              </code>
              <button
                onClick={() => handleCopy(controlCodeState, "control")}
                className="p-2 rounded-lg hover:bg-success/20 text-success"
                title={t("actions.copy")}
              >
                {copied === "control" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* زر الرفع */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-muted-foreground">
          {lastPush ? (
            <>{t("i18n_extra.external_sync_last_push", { when: new Date(lastPush).toLocaleString(i18n.language || "ar-DZ") })}</>
          ) : (
            t("i18n_extra.external_sync_never_pushed")
          )}
        </div>
        <button
          onClick={handlePush}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold disabled:opacity-50 neon-glow"
        >
          {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {busy ? t("i18n_extra.external_sync_pushing") : t("i18n_extra.external_sync_push_now")}
        </button>
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-3">
        💡 <strong>{t("i18n_extra.external_sync_how_title")}</strong> {t("i18n_extra.external_sync_how_before")}{" "}
        <code className="px-1 rounded bg-muted">/m</code> {t("i18n_extra.external_sync_how_after")}
      </div>
    </div>
  );
}
