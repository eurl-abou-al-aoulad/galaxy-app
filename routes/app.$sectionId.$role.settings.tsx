import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Settings as SettingsIcon, Save, Upload, Download, Trash2, Plus, UserCog, Bot, Image as ImageIcon, KeyRound, Eye, EyeOff, ShieldCheck, HardDriveDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, exportAllData, importAllData, type WorkerRecord } from "@/lib/db";
import { exportAllToExcel } from "@/lib/excelExport";
import { useApp, useSection, WORKER_OPTIONAL_MODULES } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { saveSnapshotNow, getLastSavedAt } from "@/lib/autosave";
import { DevicesPanel } from "@/components/galaxy/DevicesPanel";
import { ZakatModal } from "@/components/galaxy/ZakatModal";
import { MobileQRPanel } from "@/components/galaxy/MobileQRPanel";
import { ConnectedDevicesPanel } from "@/components/galaxy/ConnectedDevicesPanel";
import { ExternalSyncPanel } from "@/components/galaxy/ExternalSyncPanel";
import { LanSyncPanel } from "@/components/galaxy/LanSyncPanel";
import { isAIEnabled } from "@/lib/aiAccess";
import { LANG_LABELS, type AppLang } from "@/i18n";

export const Route = createFileRoute("/app/$sectionId/$role/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();
  const { lang, setLang } = useApp();
  const { sectionId } = useSection();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const workers = useLiveQuery(() => db.workers.where("section").equals(sectionId).toArray(), [sectionId]);

  const [saving, setSaving] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(getLastSavedAt());
  const [zakatOpen, setZakatOpen] = useState(false);
  const [aiLicensed, setAiLicensed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isAIEnabled().then((ok) => { if (!cancelled) setAiLicensed(ok); });
    return () => { cancelled = true; };
  }, []);

  // تحديث ختم آخر حفظ كل دقيقة
  useEffect(() => {
    const i = setInterval(() => setLastSavedAt(getLastSavedAt()), 60_000);
    return () => clearInterval(i);
  }, []);

  if (!settings) return <div className="text-muted-foreground">{t("common.loading")}</div>;

  const update = async (patch: Partial<typeof settings>) => {
    await db.settings.update(1, patch);
  };

  const handleSave = async () => {
    setSaving(true);
    toast.success(t("common.saved"));
    setTimeout(() => setSaving(false), 600);
  };

  const handleSaveSnapshot = async () => {
    setSavingSnapshot(true);
    const res = await saveSnapshotNow();
    setSavingSnapshot(false);
    if (res.ok) {
      const kb = (res.bytes / 1024).toFixed(1);
      toast.success(t("i18n_extra.settings_save_ok", { kb }));
      setLastSavedAt(Date.now());
    } else {
      toast.error(t("i18n_extra.settings_save_failed", { error: res.error ?? t("i18n_extra.settings_unknown_error") }));
    }
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    const res = await exportAllToExcel();
    setExportingExcel(false);
    if (res.ok) {
      toast.success(t("settings.export_ok", { filename: res.filename }));
    } else {
      toast.error(t("settings.export_failed", { error: res.error ?? "" }));
    }
  };

  const handleLogo = async (file: File) => {
    if (file.size > 500 * 1024) { toast.error(t("settings.logo_max_size")); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      await update({ companyLogo: reader.result as string });
      toast.success(t("common.saved"));
    };
    reader.readAsDataURL(file);
  };

  const handleExport = async () => {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `galaxy-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("common.saved"));
  };

  const performImport = async (file: File) => {
    const text = await file.text();
    try {
      await importAllData(text);
      toast.success(t("common.saved"));
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(t("i18n_extra.settings_import_failed") + (msg ? ` (${msg})` : ""));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" /> {t("settings.title")}
        </h1>
        <NeonButton variant="primary" onClick={handleSave} disabled={saving}>
          <Save className="h-5 w-5" /> {t("actions.save")}
        </NeonButton>
      </div>

      {/* الشركة */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-4">{t("settings.company_info")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={t("settings.company_name")}>
            <input value={settings.companyName} onChange={(e) => update({ companyName: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.phone")}>
            <input value={settings.companyPhone} onChange={(e) => update({ companyPhone: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.address")}>
            <input value={settings.companyAddress} onChange={(e) => update({ companyAddress: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.email")}>
            <input value={settings.companyEmail} onChange={(e) => update({ companyEmail: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.rc")}>
            <input value={settings.rc} onChange={(e) => update({ rc: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.nif")}>
            <input value={settings.nif} onChange={(e) => update({ nif: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.nic")}>
            <input value={settings.nic} onChange={(e) => update({ nic: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.ai")}>
            <input value={settings.ai} onChange={(e) => update({ ai: e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.tva_rate")}>
            <input type="number" value={settings.tvaRate} onChange={(e) => update({ tvaRate: +e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.capital")}>
            <input type="number" value={settings.capital} onChange={(e) => update({ capital: +e.target.value })} className="input-galaxy" />
          </Field>
          <Field label={t("settings.currency")}>
            <select
              value={settings.currency || "DZD"}
              onChange={(e) => update({ currency: e.target.value })}
              className="input-galaxy"
            >
              <option value="DZD">DZD — {t("settings.currency_DZD")}</option>
              <option value="EUR">EUR — {t("settings.currency_EUR")}</option>
              <option value="USD">USD — {t("settings.currency_USD")}</option>
              <option value="MAD">MAD — {t("settings.currency_MAD")}</option>
              <option value="TND">TND — {t("settings.currency_TND")}</option>
              <option value="SAR">SAR — {t("settings.currency_SAR")}</option>
              <option value="AED">AED — {t("settings.currency_AED")}</option>
              <option value="EGP">EGP — {t("settings.currency_EGP")}</option>
              <option value="GBP">GBP — {t("settings.currency_GBP")}</option>
              <option value="TRY">TRY — {t("settings.currency_TRY")}</option>
              <option value="CAD">CAD — {t("settings.currency_CAD")}</option>
            </select>
          </Field>
          <Field label={t("settings.currency_custom")}>
            <input
              value={settings.currency || ""}
              onChange={(e) => update({ currency: e.target.value.toUpperCase().slice(0, 6) })}
              className="input-galaxy"
              placeholder="DZD"
              maxLength={6}
            />
          </Field>
        </div>

        <div className="mt-4 p-3 glass-card rounded-xl border-primary/20">
          <Field label={t("settings.language")}> 
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(LANG_LABELS) as AppLang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => void setLang(code)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                    lang === code
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {LANG_LABELS[code]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* تفعيل/تعطيل الضرائب الجزائرية */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            onClick={() => update({ tvaEnabled: settings.tvaEnabled === 1 ? 0 : 1 })}
            className={`flex items-center justify-between gap-3 rounded-xl p-3 border-2 transition-all ${
              settings.tvaEnabled === 1
                ? "bg-success/15 border-success/60 text-success"
                : "bg-muted/30 border-border text-muted-foreground"
            }`}
          >
            <div className="text-start">
              <div className="font-bold text-sm">{t("settings.tva_toggle")}</div>
              <div className="text-[11px] opacity-80">{t("settings.tva_toggle_desc")}</div>
            </div>
            <span className="font-bold">{settings.tvaEnabled === 1 ? `✅ ${t("common.on")}` : `⭕ ${t("common.off")}`}</span>
          </button>
          <button
            type="button"
            onClick={() => update({ stampEnabled: settings.stampEnabled === 1 ? 0 : 1 })}
            className={`flex items-center justify-between gap-3 rounded-xl p-3 border-2 transition-all ${
              settings.stampEnabled === 1
                ? "bg-success/15 border-success/60 text-success"
                : "bg-muted/30 border-border text-muted-foreground"
            }`}
          >
            <div className="text-start">
              <div className="font-bold text-sm">{t("settings.stamp_toggle")}</div>
              <div className="text-[11px] opacity-80">{t("settings.stamp_toggle_desc")}</div>
            </div>
            <span className="font-bold">{settings.stampEnabled === 1 ? `✅ ${t("common.on")}` : `⭕ ${t("common.off")}`}</span>
          </button>
        </div>

        {/* اللوغو */}
        <div className="mt-4 p-3 glass-card rounded-xl border-accent/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {settings.companyLogo ? (
                <img src={settings.companyLogo} alt={t("settings.company_logo")} className="h-16 w-16 object-contain rounded-lg bg-background/60 p-1" />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-muted/40 flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>
              )}
              <div>
                <div className="font-semibold text-sm">{t("settings.company_logo")}</div>
                <div className="text-xs text-muted-foreground">{t("settings.logo_requirements")}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent text-sm hover:bg-accent/30">
                <Upload className="h-4 w-4" /> {t("actions.add")}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])} />
              </label>
              {settings.companyLogo && (
                <button onClick={() => update({ companyLogo: null })} className="px-3 py-2 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive text-sm hover:bg-destructive/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* المساعد الذكي — يظهر فقط إذا فعّله المالك لهذا الترخيص */}
      {aiLicensed && (
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Bot className="h-7 w-7 text-accent animate-neon-pulse" />
            <div>
              <h2 className="text-lg font-bold">{t("ai_helper.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("ai_helper.settings_desc")}</p>
            </div>
          </div>
          <button
            onClick={() => update({ aiHelperEnabled: settings.aiHelperEnabled === 1 ? 0 : 1 })}
            className={`px-4 py-2 rounded-xl font-semibold border transition-all ${settings.aiHelperEnabled === 1 ? "bg-success/20 border-success text-success" : "bg-muted/40 border-border text-muted-foreground"}`}
          >
            {settings.aiHelperEnabled === 1 ? `✅ ${t("common.on")}` : `⭕ ${t("common.off")}`}
          </button>
        </div>

        {/* مفتاح التنبيهات الاستباقية التلقائية */}
        <div
          className={`flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-border/30 ${
            settings.aiHelperEnabled === 1 ? "" : "opacity-50 pointer-events-none"
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-2">
              🔔 {t("ai_helper.proactive_title")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("ai_helper.proactive_desc")}
            </p>
          </div>
          <button
            onClick={() => update({ aiProactiveEnabled: (settings.aiProactiveEnabled ?? 1) === 1 ? 0 : 1 })}
            className={`px-4 py-2 rounded-xl font-semibold border transition-all ${(settings.aiProactiveEnabled ?? 1) === 1 ? "bg-success/20 border-success text-success" : "bg-muted/40 border-border text-muted-foreground"}`}
          >
            {(settings.aiProactiveEnabled ?? 1) === 1 ? `✅ ${t("common.on")}` : `⭕ ${t("common.off")}`}
          </button>
        </div>
      </div>
      )}

      {/* الأجهزة المتصلة */}
      <DevicesPanel settings={settings} />

      {/* الزكاة الشرعية */}
      <div className="glass-card rounded-2xl p-5 border-accent/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold">🕌 {t("zakat.title")}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t("zakat.settings_desc")}</p>
          </div>
          <NeonButton variant="primary" onClick={() => setZakatOpen(true)}>
            {t("zakat.open_calculator")}
          </NeonButton>
        </div>
      </div>

      {/* العمال */}
      <WorkersSection workers={workers ?? []} sectionId={sectionId} />

      {/* بطاقة تغيير كلمة مرور المتحكم */}
      <AdminPasswordCard currentPassword={settings.adminPassword} />

      {/* النسخ الاحتياطي */}
      <div className="glass-card rounded-2xl p-5 border border-primary/20">
        <h2 className="text-lg font-bold mb-3">💾 {t("settings.backup")}</h2>

        {/* زر الحفظ الفوري — الإجراء الرئيسي */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/30 p-4 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                <HardDriveDownload className="h-5 w-5 text-primary" />
                {t("i18n_extra.settings_save_now_title")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("i18n_extra.settings_save_now_desc")}
              </p>
              {lastSavedAt && (
                <p className="text-[11px] text-success mt-2">
                  {t("i18n_extra.settings_last_save", { when: formatRelative(lastSavedAt, t) })}
                </p>
              )}
            </div>
            <NeonButton
              variant="primary"
              onClick={handleSaveSnapshot}
              disabled={savingSnapshot}
            >
              <Save className="h-5 w-5" />
              {savingSnapshot ? t("i18n_extra.settings_saving") : t("i18n_extra.settings_save_button")}
            </NeonButton>
          </div>
        </div>

        {/* تصدير Excel شامل */}
        <div className="rounded-2xl bg-gradient-to-br from-success/10 to-accent/10 border border-success/30 p-4 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                <Download className="h-5 w-5 text-success" />
                {t("settings.export_excel")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("settings.export_excel_desc")}
              </p>
            </div>
            <NeonButton
              variant="accent"
              onClick={handleExportExcel}
              disabled={exportingExcel}
            >
              <Download className="h-5 w-5" />
              {exportingExcel ? t("settings.exporting") : t("settings.export_excel")}
            </NeonButton>
          </div>
        </div>

        {/* تنزيل/استيراد ملف JSON */}
        <div className="flex flex-wrap gap-3">
          <NeonButton variant="accent" onClick={handleExport}>
            <Download className="h-5 w-5" /> {t("settings.export_json")}
          </NeonButton>
          <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-card/50 backdrop-blur border border-primary/30 text-foreground hover:border-primary hover:bg-primary/10 font-semibold">
            <Upload className="h-5 w-5" /> {t("settings.import_json")}
            <input type="file" accept="application/json" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              toast(t("common.are_you_sure"), {
                action: { label: t("actions.confirm"), onClick: () => void performImport(f) },
                duration: 6000,
              });
            }} />
          </label>
        </div>
      </div>

      {/* مزامنة سحابية خارجية (Supabase الخاص بك) — تطبيق الهاتف /m */}
      <ExternalSyncPanel />

      {/* الشبكة المحلية — مزامنة بين الأجهزة في نفس المتجر بدون إنترنت */}
      <LanSyncPanel />

      {/* QR Code لتطبيق الهاتف */}
      <MobileQRPanel />

      {/* الأجهزة المتصلة بالهاتف */}
      <ConnectedDevicesPanel />

      <style>{`.input-galaxy { width: 100%; height: 42px; padding: 0 12px; border-radius: 10px; background: var(--input); border: 1px solid var(--border); outline: none; } .input-galaxy:focus { border-color: var(--primary); }`}</style>

      {zakatOpen && <ZakatModal sectionId={sectionId} onClose={() => setZakatOpen(false)} />}

      {/* تذييل البائع */}
      <div className="text-center text-xs text-muted-foreground border-t border-border pt-4 mt-6 space-y-1">
        <div className="font-bold text-sm text-foreground">{t("settings.footer_product")}</div>
        <div>{t("settings.footer_version", { year: new Date().getFullYear() })}</div>
        <div>{t("settings.footer_support")}</div>
      </div>
    </div>
  );
}

function formatRelative(ts: number, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("i18n_extra.settings_time_now");
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return t("i18n_extra.settings_time_minutes_ago", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("i18n_extra.settings_time_hours_ago", { n: hrs });
  const days = Math.floor(hrs / 24);
  return t("i18n_extra.settings_time_days_ago", { n: days });
}

function WorkersSection({ workers, sectionId }: { workers: WorkerRecord[]; sectionId: ReturnType<typeof useSection>["sectionId"] }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const addWorker = async () => {
    if (!name.trim() || code.length !== 5) { toast.error(t("settings.code_5_chars")); return; }
    const exists = await db.workers.where("[section+code]").equals([sectionId, code]).first();
    if (exists) { toast.error(t("settings.code_exists")); return; }
    await db.workers.add({
      section: sectionId,
      name: name.trim(),
      code: code.toUpperCase(),
      permissions: ["invoices", "inventory_view"],
      active: 1,
      createdAt: Date.now(),
    });
    setName(""); setCode("");
    toast.success(t("common.saved"));
  };

  const toggle = async (w: WorkerRecord) => {
    await db.workers.update(w.id!, { active: w.active === 1 ? 0 : 1 });
  };

  const remove = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete"),
        onClick: async () => {
          await db.workers.delete(id);
          toast.success(t("common.deleted"));
        },
      },
      duration: 5000,
    });
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" /> {t("settings.workers")}</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.worker_name")} className="input-galaxy flex-1 min-w-[180px]" />
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} placeholder={t("settings.worker_code")} className="input-galaxy w-32 font-mono text-center tracking-widest" maxLength={5} />
        <NeonButton variant="primary" onClick={addWorker}><Plus className="h-5 w-5" /> {t("actions.add")}</NeonButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="p-2 text-start">{t("settings.worker_name")}</th>
              <th className="p-2 text-center">{t("settings.worker_code")}</th>
              <th className="p-2 text-center">{t("settings.permissions")}</th>
              <th className="p-2 text-center">{t("settings.status")}</th>
              <th className="p-2 text-center">{t("actions.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">{t("common.no_data")}</td></tr>
            ) : workers.map((w) => (
              <tr key={w.id} className="border-t border-border/40">
                <td className="p-2 font-semibold">{w.name}</td>
                <td className="p-2 text-center font-mono text-accent tracking-widest">{w.code}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-md mx-auto">
                    {WORKER_OPTIONAL_MODULES.map((modKey) => {
                      const enabled = w.permissions.includes(modKey);
                      const isSensitive = ["dashboard", "expenses", "suppliers", "ai_assistant"].includes(modKey);
                      const warningKey = `settings.perm_warning_${modKey}`;
                      const tooltip = isSensitive
                        ? `${t(`settings.perm_${modKey}`)} — ${t(warningKey, { defaultValue: "" })}`
                        : t(`settings.perm_${modKey}`);
                      return (
                        <button
                          key={modKey}
                          onClick={async () => {
                            const newPerms = enabled
                              ? w.permissions.filter((p) => p !== modKey)
                              : [...w.permissions, modKey];
                            await db.workers.update(w.id!, { permissions: newPerms });
                          }}
                          className={`text-[11px] px-2 py-1 rounded-lg border transition-all ${
                            enabled
                              ? isSensitive
                                ? "bg-warning/20 border-warning/60 text-warning"
                                : "bg-success/20 border-success/60 text-success"
                              : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40"
                          }`}
                          title={tooltip}
                        >
                          {enabled ? "✅" : "⭕"} {isSensitive && "🔒 "}{t(`settings.perm_${modKey}`)}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="p-2 text-center">
                  <button onClick={() => toggle(w)} className={`px-2 py-0.5 rounded-full text-xs ${w.active === 1 ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                    {w.active === 1 ? t("common.on") : t("common.off")}
                  </button>
                </td>
                <td className="p-2 text-center">
                  <button onClick={() => remove(w.id!)} className="text-destructive p-1 hover:bg-destructive/20 rounded"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminPasswordCard({ currentPassword }: { currentPassword: string }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const save = async () => {
    if (current !== currentPassword) {
      toast.error(t("admin_login.wrong_current"));
      return;
    }
    if (next.length < 4) {
      toast.error(t("admin_login.too_short"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("admin_login.mismatch"));
      return;
    }
    await db.settings.update(1, { adminPassword: next });
    setCurrent(""); setNext(""); setConfirm("");
    toast.success(t("admin_login.changed"));
  };

  return (
    <div className="glass-card rounded-2xl p-5 border-primary/30">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" /> {t("admin_login.change_title")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground">
            {t("admin_login.current_password")}
          </label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input-galaxy pe-10"
              placeholder="admin"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground">
            {t("admin_login.new_password")}
          </label>
          <div className="relative">
            <input
              type={showNext ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input-galaxy pe-10"
            />
            <button
              type="button"
              onClick={() => setShowNext((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground">
            {t("admin_login.confirm_password")}
          </label>
          <input
            type={showNext ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-galaxy"
          />
        </div>
      </div>
      <div className="mt-4">
        <NeonButton variant="primary" onClick={save} disabled={!current || !next || !confirm}>
          <KeyRound className="h-4 w-4" /> {t("actions.save")}
        </NeonButton>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold mb-1 text-muted-foreground">{label}</label>{children}</div>;
}
