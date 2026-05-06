/**
 * MobileQRPanel — QR Login بنظام WhatsApp Web
 *
 * فكرة العمل:
 *  1) البرنامج المكتبي ينادي edge function `mobile-gateway` بإجراء `createSession`
 *     مع كود التفعيل + كود المتحكم → يرجع رمز جلسة (token) صالح لـ 30 يوماً.
 *  2) يولّد QR يحتوي رابط: https://your-site.netlify.app/?t=TOKEN
 *  3) المستخدم يفتح كاميرا الهاتف → يمسح → يُفتح الموقع تلقائياً ويسجّل دخوله بدون أي كتابة.
 *  4) المستخدم يحفظ رابط Netlify الخاص به مرة واحدة (يستخدم لكل QR لاحقاً).
 */
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Smartphone, Copy, Download, RefreshCw, Pencil, Check, X, QrCode } from "lucide-react";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { db } from "@/lib/db";
import { loadLicense } from "@/lib/license/storage";
import { getControlCode } from "@/lib/externalSync";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = "a76bef20-9a5c-4708-8b55-484ac7257d10";
const FALLBACK_BASE = `https://project--${PROJECT_ID}-dev.lovable.app`;
const STORAGE_KEY = "galaxy.customMobileBase";
const TOKEN_CACHE_KEY = "galaxy.mobileSessionToken";

function normalizeMobileBase(value: string): string {
  return value.trim().replace(/\/+$/, "").replace(/\/(mobile|m)$/i, "");
}

function detectBase(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^https?:\/\//.test(saved)) return normalizeMobileBase(saved);
    if (typeof window !== "undefined") {
      const o = window.location.origin;
      const isPrivate = /id-preview--/.test(o)
        || /localhost|127\.0\.0\.1/.test(o)
        || /lovableproject\.com/.test(o);
      if (!isPrivate) return normalizeMobileBase(o);
    }
  } catch {}
  return FALLBACK_BASE;
}

interface CachedToken { token: string; createdAt: number; }

function loadCachedToken(): CachedToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // صالح لـ 25 يوماً (نتركه ينتهي قبل 30 لتجديد آمن)
    if (Date.now() - parsed.createdAt > 25 * 24 * 3600_000) return null;
    return parsed;
  } catch { return null; }
}

function saveCachedToken(token: string) {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, createdAt: Date.now() }));
  } catch {}
}

function clearCachedToken() {
  try { localStorage.removeItem(TOKEN_CACHE_KEY); } catch {}
}

export function MobileQRPanel() {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<string>(() => detectBase());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(base);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");

  // الرابط النهائي الذي يحتوي الـ token
  const mobileUrl = useMemo(() => {
    const root = normalizeMobileBase(base);
    return token ? `${root}/?t=${token}` : `${root}/`;
  }, [base, token]);

  // 1) تحميل التوكن المخزّن أو إنشاء واحد جديد
  useEffect(() => {
    const cached = loadCachedToken();
    if (cached) {
      setToken(cached.token);
    } else {
      void generateNewToken();
    }
  }, []);

  // 2) توليد QR كلما تغيّر الرابط
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    QRCode.toDataURL(mobileUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0a0e27", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) { setDataUrl(url); setLoading(false); } })
      .catch((e) => { console.error("QR error:", e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mobileUrl]);

  /** ينادي edge function لإنشاء token جديد لجلسة هاتف */
  async function generateNewToken() {
    setGenerating(true);
    setError("");
    try {
      const license = await loadLicense();
      const licenseCode = license?.payload?.code;
      if (!licenseCode) {
        setError(t("i18n_extra.mobile_qr_not_activated"));
        setGenerating(false);
        return;
      }
      const controlCode = getControlCode();
      const settings = await db.settings.get(1);
      const deviceLabel = settings?.companyName || "Galaxy POS";

      const { data, error: fnErr } = await supabase.functions.invoke("mobile-gateway", {
        body: {
          action: "createSession",
          licenseCode,
          controlCode,
          deviceLabel,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) {
        let reason: string;
        if (data?.error && /galaxy_mobile_sessions/i.test(data.error)) {
          reason = t("i18n_extra.mobile_qr_sessions_setup_needed");
        } else if (data?.reason === "license_not_found") {
          reason = t("i18n_extra.mobile_qr_license_not_found");
        } else if (data?.reason === "wrong_control_code") {
          reason = t("i18n_extra.mobile_qr_wrong_control_code");
        } else {
          reason = data?.error || t("i18n_extra.mobile_qr_create_failed");
        }
        setError(reason);
        setGenerating(false);
        return;
      }
      saveCachedToken(data.token);
      setToken(data.token);
      toast.success(t("i18n_extra.mobile_qr_created"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("i18n_extra.settings_unknown_error");
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  function regenerate() {
    clearCachedToken();
    setToken(null);
    void generateNewToken();
  }

  const saveCustomDomain = () => {
    const v = normalizeMobileBase(draft);
    if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(v)) {
      toast.error(t("i18n_extra.mobile_qr_invalid_url"));
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, v);
      setBase(v);
      setEditing(false);
      toast.success(t("i18n_extra.mobile_qr_save"));
    } catch {
      toast.error(t("i18n_extra.mobile_qr_copy_failed"));
    }
  };

  const resetDomain = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    const d = detectBase();
    setBase(d);
    setDraft(d);
    setEditing(false);
    toast.success(t("i18n_extra.mobile_qr_restore_default"));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(mobileUrl);
      toast.success(t("i18n_extra.mobile_qr_copied"));
    } catch {
      toast.error(t("i18n_extra.mobile_qr_copy_failed"));
    }
  };

  const downloadQR = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "galaxy-mobile-qr.png";
    a.click();
    toast.success(t("i18n_extra.mobile_qr_downloaded"));
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-accent/30">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold">{t("i18n_extra.mobile_qr_whatsapp_title")}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {t("i18n_extra.mobile_qr_whatsapp_desc")}
      </p>

      <div className="flex flex-col md:flex-row items-center gap-5">
        {/* QR */}
        <div className="shrink-0 rounded-2xl bg-white p-3 border-2 border-accent/40 shadow-lg relative">
          {loading || !dataUrl || generating ? (
            <div className="w-[220px] h-[220px] flex flex-col items-center justify-center text-muted-foreground gap-2">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="text-xs">{generating ? t("i18n_extra.mobile_qr_generating") : t("common.loading")}</span>
            </div>
          ) : (
            <img src={dataUrl} alt="QR" width={220} height={220} className="block" />
          )}
          {!token && !generating && (
            <div className="absolute inset-0 bg-white/90 rounded-2xl flex items-center justify-center">
              <button
                onClick={generateNewToken}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-sm"
              >
                <QrCode className="h-4 w-4" /> {t("i18n_extra.mobile_qr_create")}
              </button>
            </div>
          )}
        </div>

        {/* Info & buttons */}
        <div className="flex-1 min-w-0 w-full">
          {error && (
            <div className="mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive text-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="rounded-xl bg-muted/30 border border-border p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[11px] text-muted-foreground">{t("i18n_extra.mobile_qr_published_link")}</div>
              {!editing ? (
                <button
                  onClick={() => { setDraft(base); setEditing(true); }}
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> {t("i18n_extra.mobile_qr_customize")}
                </button>
              ) : (
                <button
                  onClick={resetDomain}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {t("i18n_extra.mobile_qr_restore_default")}
                </button>
              )}
            </div>

            {!editing ? (
              <div className="text-xs font-mono break-all text-foreground/90">{base}</div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="https://your-site.netlify.app"
                  dir="ltr"
                  className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-xs font-mono outline-none focus:border-primary"
                />
                <div className="flex gap-1">
                  <button
                    onClick={saveCustomDomain}
                    className="h-9 px-3 rounded-lg bg-success/20 border border-success text-success hover:bg-success/30 inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    <Check className="h-4 w-4" /> {t("actions.save")}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="h-9 px-3 rounded-lg bg-muted/40 border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {token && (
            <div className="text-[10px] font-mono text-muted-foreground mb-2 break-all">
              🔑 {token.slice(0, 16)}…
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <NeonButton variant="primary" onClick={copyLink} disabled={!token}>
              <Copy className="h-4 w-4" /> {t("i18n_extra.mobile_qr_copy_link")}
            </NeonButton>
            <NeonButton variant="accent" onClick={downloadQR} disabled={!dataUrl || !token}>
              <Download className="h-4 w-4" /> {t("i18n_extra.mobile_qr_download")}
            </NeonButton>
            <button
              onClick={regenerate}
              disabled={generating}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-warning/15 border border-warning/40 text-warning hover:bg-warning/25 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} /> {t("i18n_extra.mobile_qr_regenerate")}
            </button>
            {token && (
              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 text-xs font-semibold"
              >
                🔗 {t("i18n_extra.mobile_qr_open")}
              </a>
            )}
          </div>

          <ul className="mt-3 text-[11px] text-muted-foreground space-y-1 leading-relaxed">
            <li>{t("i18n_extra.mobile_qr_feature_auto_login")}</li>
            <li>{t("i18n_extra.mobile_qr_feature_30_days")}</li>
            <li>{t("i18n_extra.mobile_qr_feature_multi_sessions")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
