/**
 * ConnectedDevicesPanel — يعرض جلسات الهاتف المتصلة عبر mobile-gateway
 * ويسمح بإلغاء أي جهاز.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Smartphone, RefreshCw, X, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLicense } from "@/lib/license/storage";
import { getControlCode } from "@/lib/externalSync";

interface SessionRow {
  token: string;
  device_label: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("ar-DZ"); } catch { return d; }
}
function maskToken(t: string): string {
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export function ConnectedDevicesPanel() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const getCreds = async (): Promise<{ lic: string; ctrl: string } | null> => {
    const lic = (await loadLicense())?.payload?.code;
    const ctrl = getControlCode();
    if (!lic || !ctrl) return null;
    return { lic, ctrl };
  };

  const refresh = async () => {
    const c = await getCreds();
    if (!c) {
      toast.error(t("i18n_extra.connected_devices_need_creds"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mobile-gateway", {
        body: { action: "listSessions", licenseCode: c.lic, controlCode: c.ctrl },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? t("i18n_extra.connected_devices_fetch_failed"));
      setSessions(data.sessions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("i18n_extra.connected_devices_error"));
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (token: string) => {
    const c = await getCreds();
    if (!c) return;
    setBusyToken(token);
    try {
      const { data, error } = await supabase.functions.invoke("mobile-gateway", {
        body: { action: "revokeSession", licenseCode: c.lic, controlCode: c.ctrl, token },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? t("i18n_extra.connected_devices_revoke_failed"));
      toast.success(t("i18n_extra.connected_devices_revoked"));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("i18n_extra.connected_devices_error"));
    } finally {
      setBusyToken(null);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  const active = sessions.filter((s) => !s.revoked && new Date(s.expires_at).getTime() > Date.now());
  const inactive = sessions.filter((s) => s.revoked || new Date(s.expires_at).getTime() <= Date.now());

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold flex-1">{t("i18n_extra.connected_devices_title")}</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs hover:bg-primary/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> {t("i18n_extra.connected_devices_refresh")}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          {t("i18n_extra.connected_devices_empty")}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div className="text-xs text-success font-bold mb-2 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {t("i18n_extra.connected_devices_active", { n: active.length })}
              </div>
              <ul className="space-y-2 mb-4">
                {active.map((s) => (
                  <li key={s.token} className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {s.device_label ?? t("i18n_extra.connected_devices_no_name")}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {maskToken(s.token)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>📅 {fmt(s.created_at)}</span>
                          <span>· {t("i18n_extra.connected_devices_expires", { when: fmt(s.expires_at) })}</span>
                          {s.last_used_at && <span>· {t("i18n_extra.connected_devices_last_used", { when: fmt(s.last_used_at) })}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => revoke(s.token)}
                        disabled={busyToken === s.token}
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs hover:bg-destructive/25 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> {t("i18n_extra.connected_devices_revoke")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {inactive.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground font-bold mb-2 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {t("i18n_extra.connected_devices_inactive", { n: inactive.length })}
              </div>
              <ul className="space-y-1 opacity-60">
                {inactive.slice(0, 5).map((s) => (
                  <li key={s.token} className="text-[11px] font-mono text-muted-foreground">
                    {maskToken(s.token)} · {s.revoked ? t("i18n_extra.connected_devices_status_revoked") : t("i18n_extra.connected_devices_status_expired")} · {fmt(s.expires_at)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
