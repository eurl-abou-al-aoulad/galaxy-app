/**
 * نظام التفعيل والتريال — مصدر وحيد للحقيقة
 *
 * الأنواع المدعومة:
 * 1) أكواد GLXY-... المولّدة من لوحة المالك فقط (تخزّن توكن HMAC من السيرفر)
 * 2) فترة تجريبية 15 يوم تبدأ تلقائياً عند أول تشغيل
 *
 * لا توجد أكواد دائمة (Lifetime) — كل تفعيل له مدة محددة من المالك.
 *
 * حالات القفل (lockedReason):
 *  - "revoked"      → المالك ألغى الترخيص يدوياً
 *  - "invalid_code" → المالك حذف الترخيص نهائياً من قاعدة بيانات السيرفر
 *  - "expired"      → انتهت مدة الاشتراك تلقائياً
 */
import { db } from "./db";
import { getDeviceId } from "./license/device";
import { clearLicense, loadLicense } from "./license/storage";

export const TRIAL_DAYS = 15;
export const SUPPORT_WHATSAPP = "+213562935257";

export type LockReason = "revoked" | "expired" | "invalid_code" | null;

export interface ActivationStatus {
  activated: boolean;
  trialActive: boolean;
  trialDaysLeft: number;
  licenseDaysLeft: number | null;
  licenseExpiresAt: string | null;
  trialExpired: boolean;
  canUse: boolean;
  /** سبب القفل النهائي (إن وجد) — يستخدمه LicenseGuard لعرض الشاشة الحمراء */
  lockedReason: LockReason;
}

function isServerCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith("GLXY-");
}

export async function getActivationStatus(): Promise<ActivationStatus> {
  const rec = await db.activation.get(1);

  // === الحالة 1: لا يوجد سجل بعد → بدء فترة تجريبية ===
  if (!rec) {
    return {
      activated: false,
      trialActive: true,
      trialDaysLeft: TRIAL_DAYS,
      licenseDaysLeft: null,
      licenseExpiresAt: null,
      trialExpired: false,
      canUse: true,
      lockedReason: null,
    };
  }

  // === قفل صريح من السيرفر سابقاً (revoked / invalid_code) ===
  // markRevoked() يضع activated=0 و activationCode=null لكن يحتفظ بـ lockReason
  if (rec.activated === 0 && rec.lockReason) {
    return {
      activated: false,
      trialActive: false,
      trialDaysLeft: 0,
      licenseDaysLeft: 0,
      licenseExpiresAt: null,
      trialExpired: true,
      canUse: false,
      lockedReason: rec.lockReason as LockReason,
    };
  }

  // === الحالة 2: مفعّل بكود GLXY من السيرفر ===
  if (rec.activated === 1 && isServerCode(rec.activationCode)) {
    const storedLicense = await loadLicense();

    if (storedLicense) {
      const deviceId = await getDeviceId();
      const sameDevice = storedLicense.payload.device_id === deviceId;
      const expiresAt = new Date(storedLicense.payload.expires_at);
      const expired = expiresAt.getTime() <= Date.now();

      // ترخيص صالح ومرتبط بنفس الجهاز
      if (!expired && sameDevice) {
        return {
          activated: true,
          trialActive: false,
          trialDaysLeft: 0,
          licenseDaysLeft: Math.max(
            0,
            Math.ceil((expiresAt.getTime() - Date.now()) / 86400000),
          ),
          licenseExpiresAt: storedLicense.payload.expires_at,
          trialExpired: false,
          canUse: true,
          lockedReason: null,
        };
      }

      // الترخيص منتهي محلياً → اقفل النظام تلقائياً
      if (expired) {
        // اضمن استمرار القفل حتى لو أوفلاين
        await markExpired();
        return {
          activated: false,
          trialActive: false,
          trialDaysLeft: 0,
          licenseDaysLeft: 0,
          licenseExpiresAt: storedLicense.payload.expires_at,
          trialExpired: true,
          canUse: false,
          lockedReason: "expired",
        };
      }
    }

    // لا يوجد توكن محفوظ لكن activated=1 — اعتبره مفعّل بدون عداد
    return {
      activated: true,
      trialActive: false,
      trialDaysLeft: 0,
      licenseDaysLeft: null,
      licenseExpiresAt: null,
      trialExpired: false,
      canUse: true,
      lockedReason: null,
    };
  }

  // === الحالة 4: مفعّل بكود غير معروف (احتياطي) ===
  if (rec.activated === 1) {
    return {
      activated: true,
      trialActive: false,
      trialDaysLeft: 0,
      licenseDaysLeft: null,
      licenseExpiresAt: null,
      trialExpired: false,
      canUse: true,
      lockedReason: null,
    };
  }

  // === الحالة 5: غير مفعّل — حساب عداد التجربة ===
  const elapsed = Date.now() - rec.trialStartedAt;
  const elapsedDays = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
  const expired = daysLeft <= 0;

  return {
    activated: false,
    trialActive: !expired,
    trialDaysLeft: daysLeft,
    licenseDaysLeft: null,
    licenseExpiresAt: null,
    trialExpired: expired,
    canUse: !expired,
    lockedReason: null,
  };
}

/**
 * تم إلغاء الأكواد الدائمة المحلية. هذه الدالة تبقى للتوافق فقط
 * وترجع false دائماً — التفعيل يتم حصرياً عبر activateLicense (السيرفر).
 */
export async function tryActivate(_code: string): Promise<boolean> {
  return false;
}

export async function markActivated(code: string): Promise<void> {
  const trimmed = code.trim().toUpperCase();
  const rec = await db.activation.get(1);
  const payload = {
    activated: 1 as const,
    activationCode: trimmed,
    activatedAt: Date.now(),
    lockReason: null,
  };

  if (rec) {
    await db.activation.update(1, payload);
    return;
  }

  await db.activation.put({
    id: 1,
    trialStartedAt: Date.now(),
    ...payload,
  });
}

/**
 * يقفل النظام بسبب إلغاء أو حذف الترخيص من طرف المالك.
 * يضع activated=0 ويحفظ سبب القفل في DB المحلية حتى يبقى مقفلاً
 * حتى لو فقد المستخدم الإنترنت بعد ذلك.
 */
export async function markRevoked(reason: "revoked" | "invalid_code" = "revoked"): Promise<void> {
  const rec = await db.activation.get(1);
  if (rec) {
    await db.activation.update(1, {
      activated: 0,
      activationCode: null,
      activatedAt: null,
      lockReason: reason,
    });
  } else {
    await db.activation.put({
      id: 1,
      activated: 0,
      activationCode: null,
      activatedAt: null,
      trialStartedAt: Date.now() - TRIAL_DAYS * 86400000 - 1, // اعتبر التريال منتهٍ
      lockReason: reason,
    });
  }
  clearLicense();
}

/**
 * يقفل النظام بسبب انتهاء تاريخ الاشتراك تلقائياً.
 */
export async function markExpired(): Promise<void> {
  const rec = await db.activation.get(1);
  if (rec) {
    await db.activation.update(1, {
      activated: 0,
      activationCode: null,
      activatedAt: null,
      lockReason: "expired",
    });
  }
}

export async function startTrialIfNeeded() {
  const rec = await db.activation.get(1);
  if (rec && rec.trialStartedAt === 0) {
    await db.activation.update(1, { trialStartedAt: Date.now() });
  }
}

export function openWhatsAppSupport(extraOrEvent?: string | unknown) {
  const phone = SUPPORT_WHATSAPP.replace(/\D/g, "");
  const extra = typeof extraOrEvent === "string" ? extraOrEvent : "";
  const text = extra
    ? `مرحبا، أحتاج مساعدة بخصوص THE GALAXY ACCOUNTING SOFTWARE — ${extra}`
    : "مرحبا، أحتاج مساعدة بخصوص THE GALAXY ACCOUNTING SOFTWARE";
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
