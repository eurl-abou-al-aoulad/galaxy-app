# بناء APK على Windows — نسخة أوفلاين نهائية

## سبب الخطأ في الصورة

الخطأ لا يعني أن التطبيق خربان. معناه أن Windows لا يعرف أوامر:

- `git`
- `npm`
- `npx`

يعني الأدوات غير مثبتة، أو تم تثبيتها ولم تُغلق PowerShell وتفتحه من جديد.

---

## 1) ثبّت هذه البرامج مرة واحدة فقط

1. ثبّت **Node.js LTS** من:
   `https://nodejs.org`

2. ثبّت **Git for Windows** من:
   `https://git-scm.com/download/win`

3. ثبّت **Android Studio** من:
   `https://developer.android.com/studio`

4. بعد التثبيت: أغلق PowerShell بالكامل وافتحه من جديد.

---

## 2) اختبر أن الأدوات أصبحت تعمل

اكتب في PowerShell:

```powershell
node -v
npm -v
git --version
```

إذا ظهرت أرقام الإصدارات، أكمل.

إذا ظهر نفس الخطأ الأحمر، أعد تشغيل الكمبيوتر ثم جرّب مرة أخرى.

---

## 3) افتح PowerShell داخل مجلد المشروع

افتح مجلد المشروع الذي يحتوي على:

- `package.json`
- `capacitor.config.ts`

ثم من شريط العنوان في File Explorer اكتب:

```text
powershell
```

واضغط Enter.

---

## 4) نفّذ أوامر APK الأوفلاين

انسخ هذه الأوامر واحداً واحداً:

```powershell
git pull
npm install
npm run android:apk:win
```

إذا ظهرت رسالة أن `src/routes` أو `src/router.tsx` ناقصة، فهذا يعني أن نسخة GitHub المحلية ناقصة. نفّذ داخل نفس مجلد المشروع:

```powershell
git fetch origin
git reset --hard origin/main
npm install
npm run android:apk:win
```

انتظر حتى ترى:

```text
BUILD SUCCESSFUL
```

---

## 5) مكان ملف APK

ستجد الملف هنا:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

أرسله للهاتف وثبّته.

---

## مهم جداً

- التطبيق الآن **أوفلاين** ولا يحتاج نشر Lovable.
- لا تستعمل رابط Lovable داخل التطبيق.
- إذا عدّلت شيئاً في Lovable، يجب بناء APK جديد بنفس الخطوات.
