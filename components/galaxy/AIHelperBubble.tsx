import { useState, useRef, useEffect, useMemo } from "react";
import { Bot, X, Send, Sparkles, Bell, Loader2, Telescope, TrendingUp, Tag, ShieldAlert, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "@/integrations/supabase/client";
import { db, type WorkerRecord } from "@/lib/db";
import { useApp, useSection, canAccess } from "@/contexts/AppContext";
import { isAIEnabled } from "@/lib/aiAccess";
import {
  buildSnapshot,
  generateAlerts,
  getSuggestions,
  answer,
  type Snapshot,
  type Alert,
} from "@/lib/analyticsEngine";

interface Msg { role: "user" | "assistant"; content: string }

export function AIHelperBubble() {
  const { t } = useTranslation();
  const { lang } = useApp();
  const { sectionId, role, workerCode } = useSection();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const workerRecord = useLiveQuery<WorkerRecord | undefined>(
    () =>
      role === "worker" && workerCode
        ? db.workers.where("[section+code]").equals([sectionId, workerCode]).first()
        : (Promise.resolve(undefined) as Promise<WorkerRecord | undefined>),
    [role, sectionId, workerCode],
  );

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "alerts">("alerts");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [darijaMode, setDarijaMode] = useState(false);
  const [aiLicensed, setAiLicensed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    isAIEnabled().then((ok) => { if (!cancelled) setAiLicensed(ok); });
    return () => { cancelled = true; };
  }, []);

  // تحديد الصلاحية: المدير دائماً، العامل يحتاج إذن صريح
  const workerPerms = useMemo(
    () => (role === "worker" ? workerRecord?.permissions ?? [] : []),
    [role, workerRecord],
  );

  const allowed = canAccess(role, "ai_assistant", workerPerms);

  // إعادة بناء اللقطة عند فتح النافذة فقط (تجنّب الحساب المتكرر)
  useEffect(() => {
    if (!open || !allowed) return;
    let cancelled = false;
    setLoadingSnap(true);
    void buildSnapshot(sectionId).then((s) => {
      if (!cancelled) {
        setSnapshot(s);
        setLoadingSnap(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, sectionId, allowed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  // الفقاعة لا تظهر إلا إذا فعّل المالك الذكاء الاصطناعي لهذا الترخيص
  if (!aiLicensed) return null;
  if (!settings || settings.aiHelperEnabled !== 1) return null;
  if (!allowed) return null;

  const suggestions = getSuggestions(lang);
  const alerts: Alert[] = snapshot ? generateAlerts(snapshot, lang) : [];

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || !snapshot || aiBusy) return;

    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setTab("chat");

    // 1) المحرك المحلي يستخدم فقط لأسئلة بيانات المحل المباشرة (مبيعات اليوم، أفضل زبون...)
    //    أي سؤال شرحي/معرفي/عام يذهب مباشرة للذكاء الاصطناعي.
    const dataKeywords = /(مبيعات|اليوم|الشهر|الأسبوع|أفضل|أكثر|الزبائن|الزكاة|رأس المال|المخزون|الديون|sales|today|month|week|best|top|customers|zakat|capital|stock|debts)/i;
    const isDataQuery = dataKeywords.test(msg);
    if (isDataQuery) {
      const localReply = answer(msg, snapshot, lang);
      const isLocalUnknown =
        localReply.startsWith("🤔") || /لم أفهم|didn't quite get/i.test(localReply);
      if (!isLocalUnknown) {
        setMessages((prev) => [...prev, { role: "assistant", content: localReply }]);
        return;
      }
    }

    // 2) Fallback إلى المساعد الذكي (Lovable AI) عبر edge function
    setAiBusy(true);
    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("galaxy-helper", {
        body: darijaMode
          ? { mode: "darija", message: msg, history, snapshot }
          : { message: msg, history, lang },
      });
      if (error) throw error;
      const reply = (data as any)?.reply || (data as any)?.error || (lang === "ar"
        ? "تعذّر الحصول على رد الآن، حاول مجدداً."
        : "Couldn't get a reply right now, please retry.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error("AI helper error:", e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: lang === "ar"
            ? "⚠️ تعذّر الاتصال بالمساعد الذكي. تأكّد من الاتصال بالإنترنت ثم أعد المحاولة."
            : "⚠️ Could not reach the AI assistant. Check your internet and try again.",
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };



  // 🔬 يشغّل أحد الأوضاع الذكية المتقدمة (تحليل/توقّع/أسعار/مدقّق)
  const runMode = async (
    mode: "deep_analysis" | "forecast" | "pricing" | "anomaly",
    label: string,
  ) => {
    if (!snapshot || aiBusy) return;
    setTab("chat");
    setMessages((prev) => [...prev, { role: "user", content: label }]);
    setAiBusy(true);
    try {
      const body: Record<string, unknown> = { mode, lang, snapshot };
      if (mode === "pricing") {
        // إرسال أهم 30 منتجاً مع تقدير تقريبي للمبيعات الشهرية
        const prods = await db.products.where("section").equals(sectionId).limit(60).toArray();
        body.products = prods.slice(0, 30).map((p) => ({
          name: p.name,
          cost: p.purchasePrice,
          price: p.sellingPrice,
          qty: p.quantity,
          monthly_sales_est:
            snapshot.topSellers.find((s) => s.name === p.name)?.qty ?? 0,
        }));
      }
      if (mode === "anomaly") {
        const recentInv = await db.invoices
          .where("section").equals(sectionId)
          .reverse().sortBy("createdAt");
        body.recent = {
          invoices: recentInv.slice(0, 30).map((i) => ({
            n: i.invoiceNumber, total: i.total, discount: i.discount,
            paid: i.paid, status: i.status, by: i.createdBy, at: i.createdAt,
            items: i.items.length,
          })),
        };
      }
      const { data, error } = await supabase.functions.invoke("galaxy-helper", { body });
      if (error) throw error;
      const reply = (data as any)?.reply || (data as any)?.error ||
        (lang === "ar" ? "تعذّر تنفيذ العملية الآن." : "Could not run this now.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error("AI mode error:", e);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: lang === "ar"
          ? "⚠️ تعذّر تنفيذ العملية. تأكّد من الاتصال بالإنترنت."
          : "⚠️ Could not run. Check your internet.",
      }]);
    } finally {
      setAiBusy(false);
    }
  };

  const runDeepAnalysis = () => runMode("deep_analysis", lang === "ar" ? "🔬 تحليل شامل للمتجر" : "🔬 Full shop analysis");
  const runForecast = () => runMode("forecast", lang === "ar" ? "📈 توقّع المبيعات للأسبوعين القادمين" : "📈 Forecast next 2 weeks");
  const runPricing = () => runMode("pricing", lang === "ar" ? "🏷️ اقتراح أسعار ذكية" : "🏷️ Smart pricing suggestions");
  const runAnomaly = () => runMode("anomaly", lang === "ar" ? "🛡️ كشف الأخطاء والعمليات المشبوهة" : "🛡️ Detect anomalies & fraud");



  const alertColor = (lvl: Alert["level"]) => {
    switch (lvl) {
      case "danger": return "bg-destructive/15 border-destructive/40 text-destructive";
      case "warning": return "bg-warning/15 border-warning/40 text-warning";
      case "success": return "bg-success/15 border-success/40 text-success";
      default: return "bg-primary/10 border-primary/30 text-foreground";
    }
  };

  return (
    <>
      {/* الزر العائم مع شارة عدد التنبيهات */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setTab("alerts"); }}
          className="fixed bottom-20 end-5 z-50 group"
          aria-label={t("ai_helper.open")}
        >
          <span className="absolute inset-0 rounded-full bg-accent/30 blur-lg animate-neon-pulse" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-accent via-primary to-accent neon-glow-accent border border-accent/60 group-hover:scale-110 transition-transform">
            <Bot className="h-5 w-5 text-accent-foreground" strokeWidth={2.2} />
          </span>
        </button>
      )}

      {/* النافذة */}
      {open && (
        <div className="fixed bottom-20 end-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl border border-accent/40 bg-[oklch(0.10_0.03_280)] flex flex-col overflow-hidden animate-cosmic-in shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border/40 bg-gradient-to-r from-accent/20 to-primary/10">
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-accent/50 blur-md animate-neon-pulse" />
                <Bot className="relative h-5 w-5 text-accent" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-gradient-galaxy">{t("ai_helper.title")}</span>
                <span className="text-[10px] text-muted-foreground">{t("ai_helper.subtitle")}</span>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* تبويبات */}
          <div className="flex border-b border-border/40 bg-background/40">
            <button
              onClick={() => setTab("alerts")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
                tab === "alerts" ? "bg-accent/20 text-accent border-b-2 border-accent" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              {t("ai_helper.alerts_tab")}
              {alerts.length > 0 && (
                <span className="ms-1 px-1.5 py-0.5 rounded-full bg-destructive/30 text-destructive text-[10px] font-bold">
                  {alerts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
                tab === "chat" ? "bg-accent/20 text-accent border-b-2 border-accent" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("ai_helper.chat_tab")}
            </button>
          </div>

          {/* المحتوى */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {loadingSnap && (
              <div className="text-xs text-muted-foreground text-center py-6 animate-pulse">
                {t("ai_helper.analyzing")}
              </div>
            )}

            {/* تبويب التنبيهات */}
            {!loadingSnap && tab === "alerts" && (
              <>
                {alerts.length === 0 ? (
                  <div className="glass-card rounded-xl p-4 text-xs text-center text-muted-foreground border-success/30">
                    ✅ {t("ai_helper.no_alerts")}
                  </div>
                ) : (
                  alerts.map((a, i) => (
                    <div key={i} className={`rounded-xl p-2.5 text-xs leading-relaxed border ${alertColor(a.level)}`}>
                      <span className="me-1.5">{a.icon}</span>
                      {a.text}
                    </div>
                  ))
                )}
              </>
            )}

            {/* تبويب الدردشة */}
            {!loadingSnap && tab === "chat" && (
              <>
                {messages.length === 0 && (
                  <div className="space-y-2">
                    <div className="glass-card rounded-xl p-3 text-xs text-muted-foreground border-accent/20">
                      🌌 {t("ai_helper.welcome_local")}
                    </div>
                    <div className="space-y-1.5">
                      {suggestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => send(q)}
                          className="w-full text-start text-xs glass-card rounded-lg p-2 hover:border-accent transition-colors"
                        >
                          💫 {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-2.5 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary/20 border border-primary/30 ms-6"
                        : "glass-card border-accent/20 me-6 whitespace-pre-wrap"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {aiBusy && (
                  <div className="glass-card border-accent/20 me-6 rounded-xl p-2.5 text-xs flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {lang === "ar" ? "كوكب جالاكسي يفكّر..." : "Galaxy Planet is thinking..."}
                  </div>
                )}
              </>
            )}
            <div ref={endRef} />
          </div>

          {/* 🚀 الأزرار الذكية المتقدّمة (4 وضعيات + الدارجة) */}
          <div className="mx-2 mb-1 mt-1 grid grid-cols-4 gap-1">
            <ModeBtn icon={<Telescope className="h-3.5 w-3.5" />} label={lang === "ar" ? "تحليل" : "Analyze"} onClick={runDeepAnalysis} disabled={!snapshot || aiBusy} color="from-fuchsia-600 to-purple-600" />
            <ModeBtn icon={<TrendingUp className="h-3.5 w-3.5" />} label={lang === "ar" ? "توقّع" : "Forecast"} onClick={runForecast} disabled={!snapshot || aiBusy} color="from-emerald-600 to-teal-600" />
            <ModeBtn icon={<Tag className="h-3.5 w-3.5" />} label={lang === "ar" ? "أسعار" : "Pricing"} onClick={runPricing} disabled={!snapshot || aiBusy} color="from-amber-600 to-orange-600" />
            <ModeBtn icon={<ShieldAlert className="h-3.5 w-3.5" />} label={lang === "ar" ? "تدقيق" : "Audit"} onClick={runAnomaly} disabled={!snapshot || aiBusy} color="from-rose-600 to-red-600" />
          </div>
          <button
            onClick={() => setDarijaMode((v) => !v)}
            className={`mx-2 mb-1.5 flex items-center justify-center gap-2 rounded-lg px-2 py-1 text-[11px] font-bold transition-all border ${darijaMode ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border-cyan-400 text-cyan-200" : "bg-background/40 border-border/50 text-muted-foreground hover:text-foreground"}`}
            title={lang === "ar" ? "تبديل وضع الدارجة الجزائرية" : "Toggle Algerian Darija mode"}
          >
            <MessageSquare className="h-3 w-3" />
            {darijaMode ? (lang === "ar" ? "🇩🇿 الدارجة مُفعّلة" : "🇩🇿 Darija ON") : (lang === "ar" ? "🇩🇿 فعّل الدارجة الجزائرية" : "🇩🇿 Enable Darija")}
          </button>

          {/* مدخل الدردشة (دائم) */}
          <div className="p-2 border-t border-border/40 flex gap-2 bg-background/40">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={t("ai_helper.placeholder_local")}
              className="flex-1 h-9 px-3 rounded-lg bg-input border border-border focus:outline-none focus:border-accent text-xs"
              disabled={!snapshot || aiBusy}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || !snapshot || aiBusy}
              className="h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-primary text-accent-foreground flex items-center justify-center disabled:opacity-50 hover:brightness-110"
            >
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ModeBtn({
  icon, label, onClick, disabled, color,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold text-white bg-gradient-to-br ${color} hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 shadow-md transition-all`}
    >
      {icon}
      <span className="truncate w-full text-center leading-tight">{label}</span>
    </button>
  );
}
