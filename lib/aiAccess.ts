// مصدر وحيد لمعرفة هل الذكاء الاصطناعي مفعّل لهذا الترخيص
// يفعّله المالك في لوحته عند إنشاء/تعديل كود التفعيل
import { loadLicense } from "./license/storage";

export async function isAIEnabled(): Promise<boolean> {
  try {
    const lic = await loadLicense();
    return Boolean(lic?.payload.ai_enabled);
  } catch {
    return false;
  }
}
