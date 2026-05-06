import { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, Database, Smartphone, Sparkles, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Stats {
  ts: string;
  licenses_total: number;
  licenses_active: number;
  licenses_unused: number;
  licenses_expired: number;
  licenses_revoked: number;
  ai_enabled_count: number;
  mobile_enabled_count: number;
  mobile_sessions_total: number;
  mobile_sessions_active: number;
  sync_items_total: number;
  estimated_size_mb: number;
  free_limits: { db_mb: number; mau: number; storage_gb: number; bandwidth_gb: number };
}

interface Props {
  fnUrl: string;
  anon: string;
  secret: string;
}

export function CloudMonitorPanel({ fnUrl, anon, secret }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [pingState, setPingState] = useState<{ ts: string | null; ok: boolean | null }>({
    ts: null,
    ok: null,
  });
  const [autoKeepalive, setAutoKeepalive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${fnUrl}?action=stats`, {
        headers: { "x-owner-secret": secret, apikey: anon },
      });
      const data = await res.json();
      if (data.ok) setStats(data);
    } finally {
      setLoading(false);
    }
  }, [fnUrl, anon, secret]);

  const ping = useCallback(async () => {
    try {
      const res = await fetch("/api/public/ping");
      const data = await res.json();
      setPingState({ ts: new Date().toISOString(), ok: !!data.ok });
    } catch {
      setPingState({ ts: new Date().toISOString(), ok: false });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ضرب السيرفر تلقائياً (إذا كانت لوحة المالك مفتوحة)
  useEffect(() => {
    if (!autoKeepalive) return;
    void ping();
    const id = setInterval(() => void ping(), 6 * 60 * 60 * 1000); // كل 6 ساعات
    return () => clearInterval(id);
  }, [autoKeepalive, ping]);

  if (!stats) {
    return (
      <div className="glass-card rounded-2xl p-5 border border-border/40">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse" /> جارٍ تحميل المراقبة…
        </div>
      </div>
    );
  }

  const dbPct = Math.min(100, (stats.estimated_size_mb / stats.free_limits.db_mb) * 100);
  const mauPct = Math.min(100, (stats.licenses_active / stats.free_limits.mau) * 100);

  const dbLevel: "ok" | "warn" | "danger" =
    dbPct < 60 ? "ok" : dbPct < 80 ? "warn" : "danger";

  const recommendation =
    dbLevel === "danger" || stats.licenses_active > 100
      ? { color: "text-destructive border-destructive/40 bg-destructive/10", icon: AlertTriangle, msg: "🚨 وقت الترقية لـ Pro الآن! اقتربت من حدود Free." }
      : dbLevel === "warn" || stats.licenses_active > 50
        ? { color: "text-warning border-warning/40 bg-warning/10", icon: AlertTriangle, msg: "⚠️ راقب عن كثب — الترقية قد تكون قريبة." }
        : { color: "text-success border-success/40 bg-success/10", icon: CheckCircle2, msg: "✅ Free كافٍ تماماً. لا حاجة للترقية الآن." };

  const Rec = recommendation.icon;

  return (
    <div className="glass-card rounded-2xl p-5 border border-border/40 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" /> مراقبة الخادم (Lovable Cloud)
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoKeepalive}
              onChange={(e) => setAutoKeepalive(e.target.checked)}
              className="rounded"
            />
            <Zap className="h-3 w-3" /> ضرب تلقائي (مضاد التجميد)
          </label>
          <Button size="sm" variant="ghost" onClick={ping}>
            <Zap className="h-3 w-3 ml-1" /> ضرب الآن
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {pingState.ts && (
        <div className={`text-xs ${pingState.ok ? "text-success" : "text-destructive"}`}>
          آخر ضرب: {new Date(pingState.ts).toLocaleString("ar")} — {pingState.ok ? "✓ السيرفر يستجيب" : "✗ فشل"}
        </div>
      )}

      {/* شريط استخدام قاعدة البيانات */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span>📦 حجم البيانات (تقديري)</span>
          <span className="font-mono">{stats.estimated_size_mb} MB / {stats.free_limits.db_mb} MB</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              dbLevel === "danger" ? "bg-destructive" : dbLevel === "warn" ? "bg-warning" : "bg-success"
            }`}
            style={{ width: `${dbPct}%` }}
          />
        </div>
      </div>

      {/* شريط المستخدمين */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span>👥 التراخيص النشطة</span>
          <span className="font-mono">{stats.licenses_active} / {stats.free_limits.mau.toLocaleString()}</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(2, mauPct)}%` }}
          />
        </div>
      </div>

      {/* بطاقات أرقام */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <MiniStat icon={Database} label="عناصر مزامنة" value={stats.sync_items_total} />
        <MiniStat icon={Smartphone} label="جلسات هاتف نشطة" value={stats.mobile_sessions_active} />
        <MiniStat icon={Sparkles} label="تراخيص AI" value={stats.ai_enabled_count} />
        <MiniStat icon={Activity} label="إجمالي التراخيص" value={stats.licenses_total} />
      </div>

      {/* التوصية */}
      <div className={`flex items-start gap-2 p-3 rounded-xl border ${recommendation.color}`}>
        <Rec className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <div className="font-semibold">{recommendation.msg}</div>
          <div className="text-xs opacity-80">
            {dbLevel === "ok" && stats.licenses_active <= 50
              ? "ابقَ على Free حتى تصل إلى 50+ ترخيصاً نشطاً أو 400 MB."
              : "خطة Pro = $25/شهر — تزيل التجميد + نسخ احتياطي يومي + 8 GB قاعدة بيانات."}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        💡 الضرب التلقائي يبقي السيرفر نشطاً ويمنع تجميد المشروع بعد 7 أيام خمول. اتركه مفعّلاً.
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: number }) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
