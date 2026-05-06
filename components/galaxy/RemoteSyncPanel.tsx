/**
 * لوحة حالة المزامنة السحابية بين الحاسوب والهاتف (المرحلة 5)
 * تعرض: الاتصال، عدد العناصر في الانتظار، آخر رفع/سحب، زر مزامنة فورية.
 */
import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, Smartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  syncNow, getRemoteSyncStatus, type RemoteSyncStatus,
} from "@/lib/cloudSyncRemote";

export function RemoteSyncPanel() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "ar" | "en" | "fr") ?? "ar";
  const [status, setStatus] = useState<RemoteSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStatus(await getRemoteSyncStatus());

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    const onNet = () => void refresh();
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, []);

  const handleSync = async () => {
    setBusy(true);
    try {
      const res = await syncNow();
      if (res.ok) {
        toast.success(
          lang === "ar"
            ? `✓ رفع ${res.pushed} وسحب ${res.pulled}`
            : `✓ Pushed ${res.pushed}, pulled ${res.pulled}`,
        );
      } else if (res.error === "offline") {
        toast.error(lang === "ar" ? "بدون إنترنت" : "Offline");
      } else if (res.error === "no_context") {
        toast.error(lang === "ar" ? "البرنامج غير مفعّل بكود" : "Not activated");
      } else {
        toast.error(res.error ?? "sync failed");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const fmtTime = (t: number | null) => {
    if (!t) return lang === "ar" ? "لم يحدث بعد" : "Never";
    const diff = Date.now() - t;
    if (diff < 60_000) return lang === "ar" ? "الآن" : "Now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} ${lang === "ar" ? "د" : "min"}`;
    return new Date(t).toLocaleString(lang === "ar" ? "ar-DZ" : "en-US");
  };

  const enabled = status.enabled;
  const online = status.online;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
          <Smartphone className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold">
            {lang === "ar" ? "ربط الهاتف بالحاسوب (سحابي)" : "Phone ↔ Desktop Cloud Sync"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "بياناتك تُزامَن مشفّرة بين الجهازين عبر السحابة"
              : "Your data syncs encrypted between devices via cloud"}
          </p>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm">
          {lang === "ar"
            ? "يجب تفعيل البرنامج بكود ووضع كلمة مرور للمتحكم لاستخدام المزامنة السحابية."
            : "Activate with a code and set an admin password to enable cloud sync."}
        </div>
      ) : (
        <>
          <div className={`rounded-xl p-4 border ${
            online
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-rose-500/10 border-rose-500/30"
          }`}>
            <div className="flex items-center gap-3">
              {online ? (
                <Cloud className="h-5 w-5 text-emerald-400" />
              ) : (
                <CloudOff className="h-5 w-5 text-rose-400" />
              )}
              <div className="flex-1">
                <div className="font-semibold text-sm">
                  {online
                    ? lang === "ar" ? "متصل — المزامنة تعمل تلقائياً" : "Online — auto-sync active"
                    : lang === "ar" ? "بدون إنترنت — العمل أوفلاين" : "Offline — working locally"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {online
                    ? lang === "ar"
                      ? "كل تغيير يُرفع للسحابة فوراً، الهاتف يستلم خلال دقيقتين."
                      : "Every change uploads instantly, phone receives within 2 min."
                    : lang === "ar"
                      ? "التغييرات محفوظة محلياً وستُرفع عند عودة الإنترنت."
                      : "Changes are queued and will upload when online."}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {lang === "ar" ? "كود المحل" : "Shop code"}
              </div>
              <div className="font-mono text-xs mt-1 text-primary truncate" title={status.licenseCode ?? ""}>
                {status.licenseCode ?? "—"}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {lang === "ar" ? "في الانتظار" : "Pending"}
              </div>
              <div className={`font-bold mt-1 ${
                status.pendingCount > 0 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {status.pendingCount} {lang === "ar" ? "عنصر" : "items"}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {lang === "ar" ? "آخر رفع" : "Last push"}
              </div>
              <div className="text-xs mt-1">{fmtTime(status.lastPushAt)}</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {lang === "ar" ? "آخر سحب" : "Last pull"}
              </div>
              <div className="text-xs mt-1">{fmtTime(status.lastPullAt)}</div>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={busy || !online}
            className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-purple-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy
              ? lang === "ar" ? "جاري المزامنة..." : "Syncing..."
              : lang === "ar" ? "مزامنة الآن" : "Sync Now"}
          </button>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <p>
              {lang === "ar"
                ? "التشفير AES-256-GCM بكلمة مرور المتحكم. لا يستطيع أحد قراءة بياناتك حتى لو وصل للسيرفر — حتى نحن."
                : "AES-256-GCM with admin password. No one can read your data — not even us."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
