import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Galaxy Mobile — Capacitor configuration
 *
 * - appId: معرّف فريد للتطبيق (Play Store / App Store)
 * - webDir: مجلد ناتج البناء بعد `bun run build`
 * - بدون server.url: التطبيق يفتح الملفات المحلية داخل APK مباشرة.
 *   هذا يجعل التطبيق مستقلاً عن النشر في Lovable ويعمل كنسخة أوفلاين.
 */
const config: CapacitorConfig = {
  appId: "com.galaxy.accounting",
  appName: "the galaxy accounting app",
  webDir: "dist/client",
  android: {
    backgroundColor: "#0b0d12",
  },
  plugins: {
    Camera: {
      // اطلب صلاحية واحدة فقط
      androidPhotoPermissions: ["camera"],
    },
  },
};

export default config;
