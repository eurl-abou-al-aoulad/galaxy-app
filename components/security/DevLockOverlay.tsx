import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { installAntiDebug } from "@/lib/security/antiDebug";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceName } from "@/lib/license/device";

const UNLOCK_KEY = "__galaxy_dev_unlock_v1";

export function DevLockOverlay() {
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") return;
    const off = installAntiDebug(() => setLocked(true));
    return off;
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const { data } = await supabase.functions.invoke("verify-dev-access", {
        body: {
          code,
          device_id: await getDeviceId(),
          device_name: getDeviceName(),
          user_agent: navigator.userAgent,
        },
      });
      if (data?.ok) {
        sessionStorage.setItem(UNLOCK_KEY, "1");
        setLocked(false);
      } else {
        setErr("كود غير صحيح. تم تسجيل المحاولة.");
      }
    } catch {
      setErr("تعذّر التحقق. حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  if (!locked) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md"
    >
      <div className="w-full max-w-md mx-4 rounded-xl border border-destructive/40 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 text-destructive mb-3">
          <ShieldAlert className="h-7 w-7" />
          <h2 className="text-xl font-bold">تم رصد محاولة وصول</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          اكتشفنا محاولة فتح أدوات المطوّر. هذا التطبيق محمي. أدخل كود الوصول المخصّص للمطوّر للمتابعة.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="كود الوصول"
            autoFocus
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button type="submit" disabled={loading || !code} className="w-full">
            {loading ? "جارٍ التحقق…" : "فتح القفل"}
          </Button>
        </form>
      </div>
    </div>
  );
}
