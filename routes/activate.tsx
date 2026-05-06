import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, AlertTriangle, Smartphone, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { activateLicense, checkLicense } from "@/lib/license/client";
import { getDeviceId, getDeviceName } from "@/lib/license/device";
import { getActivationStatus } from "@/lib/activation";
import { GalaxyLogo } from "@/components/galaxy/GalaxyLogo";

interface ActivateSearch {
  reason?: string;
}

export const Route = createFileRoute("/activate")({
  component: ActivatePage,
  validateSearch: (s: Record<string, unknown>): ActivateSearch => ({
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
});

const REASON_MSG: Record<string, string> = {
  missing: "يلزم تفعيل البرنامج بكود تنشيط للمتابعة.",
  expired: "انتهت الفترة التجريبية (15 يوم). أدخل كود التفعيل للمتابعة.",
  device_mismatch: "هذا الكود مرتبط بجهاز آخر. تواصل مع المزوّد.",
  revoked: "تم إلغاء هذا الكود. تواصل مع المزوّد.",
  invalid_code: "الكود غير صحيح.",
  tampered: "تم العبث ببيانات الترخيص محلياً.",
};

function ActivatePage() {
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>(reason ? REASON_MSG[reason] ?? "" : "");
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    void getDeviceId().then(setDeviceId);
    setDeviceName(getDeviceName());

    // اعرض الحالة المحلية: هل التريال نشط؟
    void getActivationStatus().then((s) => {
      if (s.activated) {
        navigate({ to: "/home" });
        return;
      }
      if (s.trialActive) {
        setTrialDaysLeft(s.trialDaysLeft);
      }
    });

    // إذا الترخيص السيرفر صالح بالفعل، اذهب للرئيسية
    void checkLicense().then((s) => {
      if (s.state === "valid") navigate({ to: "/home" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");

    // التفعيل يتم حصرياً عبر السيرفر بأكواد GLXY-... المولّدة من لوحة المالك
    const res = await activateLicense(code);
    setLoading(false);
    if (res.state === "valid") {
      navigate({ to: "/home" });
      return;
    }

    // رسائل خطأ مفصّلة حسب نوع الفشل
    const errorText =
      REASON_MSG[res.state] ??
      ("message" in res ? res.message : "كود التفعيل غير صحيح");
    setErr(errorText);
  };

  return (
    <div dir="rtl" className="gateway-bg min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-5">
        <div className="flex flex-col items-center gap-2">
          <GalaxyLogo size="lg" />
          <h1 className="text-2xl font-bold text-gradient-galaxy">تفعيل البرنامج</h1>
          <p className="text-sm text-muted-foreground text-center">
            أدخل كود التنشيط الذي حصلت عليه. يحتاج البرنامج للإنترنت في أول مرة فقط، ثم يعمل أوفلاين.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-border/40 space-y-4">
          {trialDaysLeft !== null && trialDaysLeft > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-accent/10 border border-accent/40 p-3 text-sm">
              <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 text-accent" />
              <div>
                <p className="font-semibold text-accent-glow">
                  لا تزال الفترة التجريبية نشطة — متبقي {trialDaysLeft} يوم
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  يمكنك استخدام البرنامج بكل ميزاته دون إدخال كود حتى انتهاء المدة.
                </p>
                <Link
                  to="/home"
                  className="inline-block mt-2 text-xs font-semibold text-primary hover:underline"
                >
                  ← متابعة استخدام البرنامج الآن
                </Link>
              </div>
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              كود التنشيط
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="GLXY-XXXXX-XXXXX-XXXXX"
              className="font-mono text-center tracking-widest text-base"
              autoFocus
              dir="ltr"
            />
            <Button
              type="submit"
              disabled={loading || code.length < 8}
              className="w-full bg-gradient-to-br from-primary to-primary-glow neon-glow"
            >
              <ShieldCheck className="h-4 w-4 ms-2" />
              {loading ? "جارٍ التفعيل…" : "تفعيل وربط بهذا الجهاز"}
            </Button>
          </form>

          <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1 border border-border/30">
            <div className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-3.5 w-3.5" />
              معرّف هذا الجهاز
            </div>
            <div className="text-muted-foreground">{deviceName}</div>
            <div className="font-mono text-[10px] break-all text-muted-foreground" dir="ltr">
              {deviceId.slice(0, 32)}…
            </div>
          </div>
        </div>

        <div className="text-center flex flex-col gap-2">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            ← العودة للواجهة
          </Link>
          <Link to="/owner" className="text-xs text-primary/70 hover:text-primary transition-colors">
            🔐 لوحة المالك (إدارة الأكواد)
          </Link>
        </div>
      </div>
    </div>
  );
}
