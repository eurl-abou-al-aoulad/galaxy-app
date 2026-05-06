# Galaxy — نظام إدارة المحلات الذكي

> Galaxy Smart Shop Management System

نظام متكامل لإدارة المبيعات، المخزون، العملاء، الديون، الصيانة، والمصروفات — مع نظام تفعيل بأكواد مرتبطة بالأجهزة وحماية متقدمة ضد التفتيش.

---

## ✨ الميزات

- 🧾 **الفواتير**: إصدار، طباعة، تعليق، استرجاع.
- 📦 **المخزون**: تتبع المنتجات، الباركود، التنبيهات.
- 👥 **العملاء والموردون**: قاعدة بيانات كاملة.
- 💰 **الديون والمصروفات**: محاسبة دقيقة.
- 🔧 **خدمات الصيانة**: تتبع طلبات الإصلاح.
- 🔐 **نظام تفعيل بأكواد**: كل كود مرتبط بجهاز واحد.
- 🛡️ **حماية متقدمة**: Anti-Debug + كشف فتح DevTools + كود وصول للمطوّر.
- 🌐 **يعمل أوفلاين** بعد التفعيل الأول.
- 🌍 **دعم العربية والإنجليزية** (i18n).

---

## 📋 المتطلبات

- [Node.js](https://nodejs.org/) إصدار 20+
- [Bun](https://bun.sh/) (مُوصى به) أو npm
- مشروع [Supabase](https://supabase.com) (مجاني)

---

## 🚀 التثبيت والتشغيل

```bash
# 1. تثبيت الحزم
bun install

# 2. نسخ ملف البيئة وتعديله
cp .env.example .env
# عدّل القيم في .env

# 3. تشغيل وضع التطوير
bun run dev

# 4. بناء نسخة الإنتاج
bun run build
```

---

## 🔑 الأسرار المطلوبة (في Supabase Edge Functions Secrets)

| السر | الوصف |
|------|-------|
| `OWNER_SECRET` | كلمة سر لوحة المالك (`/owner`) لإدارة الأكواد. |
| `DEV_ACCESS_CODE` | كود الوصول للمطوّر عند فتح DevTools. |
| `LICENSE_HMAC_SECRET` | مفتاح توقيع التراخيص (HMAC-SHA256). |
| `SUPABASE_URL` | يُضاف تلقائياً. |
| `SUPABASE_SERVICE_ROLE_KEY` | يُضاف تلقائياً. |

---

## 🗂️ بنية المشروع

```
src/
├── routes/              # صفحات التطبيق (TanStack Router)
│   ├── activate.tsx     # شاشة التفعيل
│   ├── owner.tsx        # لوحة المالك
│   └── app.*.tsx        # صفحات التطبيق الداخلية
├── components/          # المكوّنات القابلة لإعادة الاستخدام
│   ├── galaxy/          # مكوّنات تصميم Galaxy
│   ├── security/        # حراس الترخيص + قفل المطوّر
│   └── ui/              # shadcn/ui
├── lib/
│   ├── license/         # نظام التراخيص (device fingerprint, HMAC)
│   ├── security/        # Anti-Debug
│   └── db.ts            # قاعدة البيانات المحلية (Dexie)
├── contexts/            # React Contexts
├── i18n/                # ملفات الترجمة (ar/en)
└── integrations/supabase/  # عميل Supabase

supabase/
├── functions/           # Edge Functions
│   ├── activate-license/    # تفعيل كود
│   ├── verify-license/      # التحقق الدوري
│   ├── owner-licenses/      # إدارة الأكواد (للمالك)
│   ├── verify-dev-access/   # تحقق كود المطوّر
│   └── galaxy-helper/       # مساعد AI
└── config.toml
```

---

## 🖥️ بناء نسخة سطح المكتب (Electron)

```bash
# بناء الواجهة
bun run build

# تعبئة Electron
bun run electron:pack
```

سيُنشأ مجلد `electron-release/` يحتوي النسخ المحمولة.

---

## 📜 الترخيص

ملكية خاصة — راجع [LICENSE.txt](./LICENSE.txt) و[COPYRIGHT.md](./COPYRIGHT.md).

جميع الحقوق محفوظة © 2026.
