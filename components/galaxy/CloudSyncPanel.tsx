/**
 * لوحة مزامنة محلية مشفّرة (المرحلة 4)
 * - اختيار مجلد دائم (USB / مجلد محلي / مجلد شبكة)
 * - مزامنة الآن
 * - استرجاع من ملف .galaxy.enc بكلمة مرور المتحكم
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { FolderOpen, CloudUpload, ShieldCheck, RotateCcw, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import {
  pickSyncFolder,
  performSync,
  isFsAccessSupported,
  restoreFromEncryptedFile,
  clearDirHandle,
  getDirHandle,
} from "@/lib/cloudSync";
import { NeonButton } from "./NeonButton";

export function CloudSyncPanel() {
  const { t } = useTranslation();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const [busy, setBusy] = useState(false);
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  if (!settings) return null;
  const supported = isFsAccessSupported();
  const enabled = settings.cloudSyncEnabled === 1;
  const folder = settings.cloudSyncFolderName;

  const handlePick = async () => {
    setBusy(true);
    const r = await pickSyncFolder();
    setBusy(false);
    if (r.ok) toast.success(`✓ ${t("cloud_sync.folder_set")}: ${r.name}`);
    else if (r.error !== "cancelled") toast.error(t("cloud_sync.pick_failed"));
  };

  const handleClearFolder = async () => {
    await clearDirHandle();
    await db.settings.update(1, { cloudSyncFolderName: null, cloudSyncEnabled: 0 });
    toast.success(t("cloud_sync.folder_cleared"));
  };

  const handleSyncNow = async () => {
    const handle = await getDirHandle();
    if (!handle) {
      toast.error(t("cloud_sync.choose_folder_first"));
      return;
    }
    setBusy(true);
    const r = await performSync({ force: true });
    setBusy(false);
    if (r.ok) {
      const kb = (r.bytes / 1024).toFixed(1);
      toast.success(`✓ ${t("cloud_sync.synced")} (${kb} KB) — ${r.fileName}`);
    } else {
      const map: Record<string, string> = {
        no_folder: t("cloud_sync.choose_folder_first"),
        permission_denied: t("cloud_sync.permission_denied"),
        no_password: t("cloud_sync.no_password"),
      };
      toast.error(map[r.reason] ?? `${t("cloud_sync.sync_failed")}: ${r.error ?? ""}`);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restorePass) {
      toast.error(t("cloud_sync.restore_need_both"));
      return;
    }
    setRestoring(true);
    const r = await restoreFromEncryptedFile(restoreFile, restorePass);
    setRestoring(false);
    if (r.ok) {
      toast.success(t("cloud_sync.restored"));
      setTimeout(() => window.location.reload(), 1200);
    } else {
      const msg = r.error === "wrong_password"
        ? t("cloud_sync.wrong_password")
        : r.error === "not_galaxy_backup"
        ? t("cloud_sync.not_galaxy_file")
        : `${t("cloud_sync.restore_failed")}: ${r.error ?? ""}`;
      toast.error(msg);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-accent/20 space-y-5">
      <div className="flex items-center gap-3">
        <CloudUpload className="h-7 w-7 text-accent" />
        <div>
          <h2 className="text-lg font-bold">☁️ {t("cloud_sync.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("cloud_sync.subtitle")}</p>
        </div>
      </div>

      {!supported && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("cloud_sync.browser_unsupported")}</span>
        </div>
      )}

      {/* اختيار المجلد */}
      <div className="rounded-xl bg-background/40 border border-border/40 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <span className="text-sm">
              {folder ? (
                <span className="font-bold text-foreground">📁 {folder}</span>
              ) : (
                <span className="text-muted-foreground">{t("cloud_sync.no_folder")}</span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePick}
              disabled={!supported || busy}
              className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/25 disabled:opacity-40"
            >
              {folder ? t("cloud_sync.change_folder") : t("cloud_sync.choose_folder")}
            </button>
            {folder && (
              <button
                onClick={handleClearFolder}
                className="px-3 py-1.5 rounded-lg bg-destructive/15 border border-destructive/40 text-destructive text-xs hover:bg-destructive/25"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* تفعيل/تعطيل */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/30">
          <div className="text-sm">
            <p className="font-semibold">{t("cloud_sync.auto_enable")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("cloud_sync.auto_desc", { interval: settings.cloudSyncIntervalMin ?? 60 })}
            </p>
          </div>
          <button
            onClick={() => {
              if (!folder) { toast.error(t("cloud_sync.choose_folder_first")); return; }
              void db.settings.update(1, { cloudSyncEnabled: enabled ? 0 : 1 });
            }}
            className={`px-4 py-2 rounded-xl font-semibold border text-sm ${
              enabled
                ? "bg-success/20 border-success text-success"
                : "bg-muted/40 border-border text-muted-foreground"
            }`}
          >
            {enabled ? "✅ ON" : "⭕ OFF"}
          </button>
        </div>

        {/* فاصل التكرار + عدد النسخ */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">{t("cloud_sync.interval_min")}</span>
            <input
              type="number"
              min={5}
              max={1440}
              value={settings.cloudSyncIntervalMin ?? 60}
              onChange={(e) => void db.settings.update(1, { cloudSyncIntervalMin: Math.max(5, +e.target.value || 60) })}
              className="w-full h-9 px-2 rounded-lg bg-input border border-border"
            />
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">{t("cloud_sync.keep_count")}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.cloudSyncKeepCount ?? 7}
              onChange={(e) => void db.settings.update(1, { cloudSyncKeepCount: Math.max(1, +e.target.value || 7) })}
              className="w-full h-9 px-2 rounded-lg bg-input border border-border"
            />
          </label>
        </div>

        {settings.cloudSyncLastAt && (
          <p className="text-[11px] text-success pt-1">
            ✓ {t("cloud_sync.last_sync")}: {new Date(settings.cloudSyncLastAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* زر مزامنة الآن */}
      <NeonButton variant="primary" onClick={handleSyncNow} disabled={busy || !folder}>
        <CloudUpload className="h-5 w-5" />
        {busy ? t("cloud_sync.syncing") : t("cloud_sync.sync_now")}
      </NeonButton>

      {/* الاسترجاع */}
      <div className="rounded-xl bg-background/40 border border-border/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-accent" />
          <h3 className="font-bold text-sm">{t("cloud_sync.restore_title")}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("cloud_sync.restore_desc")}</p>

        <input
          type="file"
          accept=".enc,.galaxy"
          onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs file:me-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-accent/20 file:text-accent file:font-semibold"
        />
        {restoreFile && (
          <p className="text-[11px] text-success">📄 {restoreFile.name}</p>
        )}

        <input
          type="password"
          placeholder={t("cloud_sync.restore_password_ph")}
          value={restorePass}
          onChange={(e) => setRestorePass(e.target.value)}
          className="w-full h-9 px-3 rounded-lg bg-input border border-border text-sm"
        />

        <button
          onClick={handleRestore}
          disabled={!restoreFile || !restorePass || restoring}
          className="w-full h-10 rounded-xl bg-warning/20 border border-warning/40 text-warning font-semibold text-sm hover:bg-warning/30 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="h-4 w-4" />
          {restoring ? t("cloud_sync.restoring") : t("cloud_sync.restore_now")}
        </button>
      </div>
    </div>
  );
}
