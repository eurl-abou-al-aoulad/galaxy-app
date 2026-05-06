/**
 * إشعارات هاتف فورية محلية (Notifications API).
 * - تستخدم نفس الـ Snapshot/Alerts من analyticsEngine.
 * - تتجنّب التكرار عبر بصمة في localStorage مع cooldown.
 * - تُطلق فقط إن منح المستخدم الإذن وكانت الخاصية مفعّلة.
 */
import { db, type SectionId } from "@/lib/db";
import { buildSnapshot, generateAlerts, type Alert, type Lang } from "@/lib/analyticsEngine";
import { isAIEnabled } from "@/lib/aiAccess";

const SEEN_KEY = "galaxy_push_seen_v1";
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 ساعات
const POLL_MS = 10 * 60 * 1000; // كل 10 دقائق

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}
export function pushPermission(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as PushPermission;
  }
  const r = await Notification.requestPermission();
  return r as PushPermission;
}

function loadSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"); } catch { return {}; }
}
function saveSeen(map: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}
function fp(a: Alert): string { return `${a.level}::${a.text.slice(0, 80)}`; }

function show(a: Alert) {
  try {
    const title = a.level === "danger"
      ? "🚨 GALAXY"
      : a.level === "warning"
        ? "⚠️ GALAXY"
        : a.level === "success"
          ? "✅ GALAXY"
          : "🔔 GALAXY";
    new Notification(title, {
      body: a.text,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: fp(a),
      silent: false,
    });
  } catch { /* ignore — بعض المتصفحات تحظرها داخل iframe */ }
}

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

async function scan(sections: SectionId[], lang: Lang) {
  if (pushPermission() !== "granted") return;
  if (!(await isAIEnabled())) return;
  const settings = await db.settings.get(1);
  if (!settings || settings.aiHelperEnabled !== 1) return;
  if ((settings.aiProactiveEnabled ?? 1) !== 1) return;

  const seen = loadSeen();
  const now = Date.now();
  for (const k of Object.keys(seen)) if (now - seen[k] > COOLDOWN_MS) delete seen[k];

  let pushed = 0;
  for (const sec of sections) {
    try {
      const snap = await buildSnapshot(sec);
      const alerts = generateAlerts(snap, lang);
      for (const a of alerts) {
        if (a.level === "info") continue;
        if (a.level !== "danger" && a.level !== "warning") continue;
        const key = fp(a);
        if (seen[key]) continue;
        show(a);
        seen[key] = now;
        pushed++;
        if (pushed >= 3) break; // لا أكثر من 3 إشعارات في الدورة
      }
      if (pushed >= 3) break;
    } catch { /* ignore */ }
  }
  if (pushed > 0) saveSeen(seen);
}

export function startMobilePushWatcher(sections: SectionId[], lang: Lang) {
  if (started) return;
  started = true;
  setTimeout(() => void scan(sections, lang), 5_000);
  timer = setInterval(() => void scan(sections, lang), POLL_MS);
}

export function stopMobilePushWatcher() {
  if (timer) { clearInterval(timer); timer = null; }
  started = false;
}

export async function manualPushTest(lang: Lang) {
  if (pushPermission() !== "granted") return false;
  show({
    level: "info",
    icon: "🔔",
    text: lang === "ar" ? "الإشعارات تعمل بشكل صحيح ✓" : "Notifications working correctly ✓",
  });
  return true;
}
