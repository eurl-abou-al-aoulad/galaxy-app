# 📱 Galaxy — بناء تطبيق Android (APK + AAB) ونشره على Google Play

> هذا الدليل خاص بالمالك. كل المراحل تتم على جهاز محلي يحتوي **Android Studio + JDK 17**.
> Lovable لا يستطيع توليد APK مباشرة من السحابة — لكن المشروع جاهز 100% للبناء بأمر واحد.

---

## 1️⃣ المتطلبات (مرة واحدة فقط)

| الأداة | الإصدار | الرابط |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| Bun (اختياري) | latest | https://bun.sh |
| Android Studio | Hedgehog 2023.1+ | https://developer.android.com/studio |
| JDK | 17 (يأتي مع Studio) | — |
| Android SDK | API 34 | عبر Studio → SDK Manager |

ضبط متغير البيئة:
```bash
# macOS / Linux  (في ~/.zshrc أو ~/.bashrc)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Windows (Powershell)
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
```

---

## 2️⃣ تنزيل المشروع وتجهيزه

```bash
git clone <رابط-مشروعك>
cd galaxy
bun install   # أو npm install
```

---

## 3️⃣ إنشاء مشروع Android (مرة واحدة)

```bash
bun run android:init
```

سيُنشئ مجلد `android/` يحتوي مشروع Gradle كامل. **التزم به في git** بعد ذلك.

---

## 4️⃣ بناء APK للتجربة المباشرة

```bash
bun run android:apk
```

على Windows إذا ظهر خطأ `CommandNotFoundException` أو لم يعمل `gradlew`:
```powershell
bun run android:apk:win
```

أو من داخل مجلد `android` في Terminal:
```powershell
.\gradlew.bat assembleDebug
```

الناتج:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

انقله للهاتف (USB / Drive / WhatsApp) وثبّته (فعّل "تثبيت من مصادر غير معروفة").

---

## 5️⃣ التوقيع الرقمي (مرة واحدة قبل النشر)

⚠️ **احفظ الـ keystore في مكان آمن — فقدانه = خسارة التطبيق نهائياً من Play Store.**

```bash
keytool -genkey -v -keystore galaxy-release.keystore \
  -alias galaxy -keyalg RSA -keysize 2048 -validity 10000
```

أنشئ `android/key.properties`:
```properties
storePassword=YOUR_PASSWORD
keyPassword=YOUR_PASSWORD
keyAlias=galaxy
storeFile=../../galaxy-release.keystore
```

عدّل `android/app/build.gradle` وأضف داخل `android { ... }`:
```gradle
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(rootProject.file("key.properties")))

signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

---

## 6️⃣ بناء AAB (المطلوب من Google Play)

```bash
bun run android:aab
```

الناتج:
```
android/app/build/outputs/bundle/release/app-release.aab
```

---

## 7️⃣ نشر على Google Play Store

1. ادفع **25$ مرة واحدة فقط** على https://play.google.com/console
2. **Create app** → اسم: `Galaxy — محاسبة` — لغة: العربية
3. املأ:
   - وصف قصير + طويل
   - 2 لقطة شاشة على الأقل (1080×1920 موصى به)
   - أيقونة 512×512 PNG
   - بانر 1024×500
   - سياسة خصوصية
4. **Production → Create release** → ارفع `app-release.aab`
5. **Content rating** + **Target audience** + **Data safety form**
6. **Send for review** — المراجعة عادة 1-7 أيام.

---

## 🔄 تحديثات لاحقة

كل مرة تعدّل واجهة من Lovable:
```bash
git pull
bun run android:aab
```
ارفع الـ versionCode بـ +1 و versionName في `android/app/build.gradle`، ثم ارفع AAB الجديد كـ **New release** في Play Console.

---

## 💡 ملاحظات تقنية

- التطبيق الآن **أوفلاين فعلياً**: يفتح الملفات الموجودة داخل APK/AAB ولا يعتمد على رابط Lovable المنشور.
  - يمكنك إلغاء النشر من Lovable ولن تظهر صفحة `Forbidden` داخل التطبيق.
  - أي تعديل جديد في الواجهة يحتاج بناء APK/AAB جديد ورفعه/تثبيته من جديد.
- الباركود: `@capacitor-mlkit/barcode-scanning` (سريع، أوفلاين).
- البيانات المحلية تبقى داخل الجهاز، وأي مزامنة خارجية تحتاج اتصال إنترنت فقط وقت المزامنة.

---

## 📋 ملخص الأوامر

| الأمر | الوظيفة |
|---|---|
| `bun run android:init` | إنشاء مشروع Android (مرة واحدة) |
| `bun run android:sync` | مزامنة آخر تغييرات الواجهة |
| `bun run android:open` | فتح Android Studio |
| `bun run android:apk` | بناء APK للاختبار |
| `bun run android:apk:win` | بناء APK للاختبار على Windows |
| `bun run android:aab` | بناء AAB للنشر |
| `bun run android:aab:win` | بناء AAB للنشر على Windows |

---

## 🛡️ أمان

- لا تحفظ `key.properties` ولا الـ keystore في git العام (أضفهما إلى `.gitignore`).
- استخدم Play App Signing (Google يحتفظ بالمفتاح الأساسي).
- فعّل `mobile_enabled` فقط للزبائن المشتركين في الميزة.
