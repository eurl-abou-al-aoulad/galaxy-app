# 🚀 دليل النشر اليدوي على حسابك الخاص في Supabase

> **الهدف**: نقل نظام التراخيص بالكامل لحسابك (`qvvvaqxzqkwyaajiseec`) ليكون مستقلاً تماماً عن Lovable.
> **الطريقة**: نسخ ولصق فقط — بدون CLI، بدون تثبيت أي شيء.

---

## ✅ المرحلة 1 — تنفيذ SQL (إنشاء الجداول)

### الخطوات:
1. افتح: https://supabase.com/dashboard/project/qvvvaqxzqkwyaajiseec/sql/new
2. الصق الكود التالي بالكامل
3. اضغط **RUN** (أو Ctrl/Cmd + Enter)

```sql
-- ============================================
-- 1) جدول التراخيص (licenses)
-- ============================================
CREATE TABLE IF NOT EXISTS public.licenses (
  code TEXT PRIMARY KEY,
  duration_days INTEGER NOT NULL DEFAULT 365,
  device_id TEXT,
  device_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unused',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- لا نضيف أي policy — الوصول فقط عبر service_role من Edge Functions

-- ============================================
-- 2) جدول محاولات فك قفل المطوّر
-- ============================================
CREATE TABLE IF NOT EXISTS public.dev_access_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT,
  device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dev_access_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3) دالة تحديث updated_at تلقائياً
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
CREATE TRIGGER update_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```

✅ يجب أن ترى **Success. No rows returned**

---

## ✅ المرحلة 2 — إضافة الأسرار (Secrets)

### الخطوات:
1. افتح: https://supabase.com/dashboard/project/qvvvaqxzqkwyaajiseec/settings/functions
2. مرّر للأسفل لقسم **Edge Function Secrets**
3. أضف هذه الأسرار واحداً واحداً (اضغط **Add new secret**):

| اسم السر | القيمة المقترحة | الشرح |
|---|---|---|
| `LICENSE_HMAC_SECRET` | اضغط [هنا](https://www.uuidgenerator.net/version4) ولّد UUID والصقه | مفتاح توقيع التراخيص — لا تشاركه أبداً |
| `OWNER_SECRET` | اخترع كلمة مرور قوية (مثلاً 32 حرف) | لحماية لوحة المالك |
| `DEV_ACCESS_CODE` | اخترع كود (مثلاً `GLXY-DEV-2025-OWNER`) | لفك قفل أدوات المطوّر |

> 💡 `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` موجودان تلقائياً، لا تضفهما.

---

## ✅ المرحلة 3 — نشر Edge Functions (4 دوال)

### القاعدة العامة لكل دالة:
1. افتح: https://supabase.com/dashboard/project/qvvvaqxzqkwyaajiseec/functions
2. اضغط **Deploy a new function**
3. أدخل اسم الدالة بالضبط كما هو موضح
4. الصق الكود الكامل
5. **مهم جداً**: في خيارات النشر، اختر:
   - ✅ **Verify JWT with legacy secret**: قم بإلغاء التحديد (uncheck)
   
   لأن هذه الدوال يجب أن تكون عامة (لا تتطلب تسجيل دخول).
6. اضغط **Deploy function**

---

### 📦 الدالة 1/4 — `activate-license`

**اسم الدالة**: `activate-license`

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const enc = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"],
  );
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)).buffer);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id, device_name } = await req.json();
    if (!code || !device_id) return json({ ok: false, error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const normalized = String(code).trim().toUpperCase();
    const { data: lic, error } = await supabase
      .from("licenses").select("*").eq("code", normalized).maybeSingle();

    if (error) return json({ ok: false, error: "db_error" }, 500);
    if (!lic) return json({ ok: false, error: "invalid_code" }, 404);
    if (lic.status === "revoked") return json({ ok: false, error: "revoked" }, 403);

    const now = new Date();

    if (lic.status === "active" || lic.device_id) {
      if (lic.device_id && lic.device_id !== device_id) {
        return json({ ok: false, error: "device_mismatch" }, 403);
      }
      const expiresAt = new Date(lic.expires_at);
      if (expiresAt < now) {
        await supabase.from("licenses").update({ status: "expired" }).eq("code", normalized);
        return json({ ok: false, error: "expired" }, 403);
      }
      const token = await signPayload(
        { code: normalized, device_id, expires_at: lic.expires_at },
        Deno.env.get("LICENSE_HMAC_SECRET")!,
      );
      return json({ ok: true, token, expires_at: lic.expires_at });
    }

    const expiresAt = new Date(now.getTime() + lic.duration_days * 86400000);
    const { error: upErr } = await supabase
      .from("licenses")
      .update({
        device_id, device_name: device_name ?? null,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: "active",
      })
      .eq("code", normalized);

    if (upErr) return json({ ok: false, error: "activation_failed" }, 500);

    const token = await signPayload(
      { code: normalized, device_id, expires_at: expiresAt.toISOString() },
      Deno.env.get("LICENSE_HMAC_SECRET")!,
    );
    return json({ ok: true, token, expires_at: expiresAt.toISOString() });
  } catch (e) {
    return json({ ok: false, error: "server_error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

### 📦 الدالة 2/4 — `verify-license`

**اسم الدالة**: `verify-license`

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id } = await req.json();
    if (!code || !device_id) return json({ ok: false, error: "missing_fields" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lic } = await supabase
      .from("licenses").select("status,device_id,expires_at")
      .eq("code", String(code).trim().toUpperCase()).maybeSingle();

    if (!lic) return json({ ok: false, error: "invalid_code" }, 404);
    if (lic.status === "revoked") return json({ ok: false, error: "revoked" }, 403);
    if (lic.device_id && lic.device_id !== device_id) {
      return json({ ok: false, error: "device_mismatch" }, 403);
    }
    if (new Date(lic.expires_at) < new Date()) {
      return json({ ok: false, error: "expired" }, 403);
    }
    return json({ ok: true, expires_at: lic.expires_at });
  } catch (e) {
    return json({ ok: false, error: "server_error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

### 📦 الدالة 3/4 — `owner-licenses`

**اسم الدالة**: `owner-licenses`

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)))
      .map((b) => alphabet[b % alphabet.length]).join("");
  return `GLXY-${block(5)}-${block(5)}-${block(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ownerSecret = req.headers.get("x-owner-secret");
  if (!ownerSecret || ownerSecret !== Deno.env.get("OWNER_SECRET")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "list";

    if (req.method === "GET" || action === "list") {
      const { data, error } = await supabase
        .from("licenses").select("*")
        .order("created_at", { ascending: false }).limit(500);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, licenses: data });
    }

    const body = await req.json().catch(() => ({}));

    if (action === "create") {
      const count = Math.min(Math.max(Number(body.count ?? 1), 1), 50);
      const duration_days = Number(body.duration_days ?? 365);
      const rows = Array.from({ length: count }, () => ({
        code: genCode(), duration_days,
        customer_name: body.customer_name ?? null,
        customer_phone: body.customer_phone ?? null,
        notes: body.notes ?? null,
      }));
      const { data, error } = await supabase.from("licenses").insert(rows).select();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, created: data });
    }

    if (action === "revoke") {
      const { error } = await supabase.from("licenses")
        .update({ status: "revoked" }).eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "reset_device") {
      const { error } = await supabase.from("licenses")
        .update({ device_id: null, device_name: null, activated_at: null, expires_at: null, status: "unused" })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "extend") {
      const days = Number(body.days ?? 30);
      const { data: cur } = await supabase
        .from("licenses").select("expires_at").eq("code", body.code).maybeSingle();
      const base = cur?.expires_at ? new Date(cur.expires_at) : new Date();
      const newExp = new Date(base.getTime() + days * 86400000);
      const { error } = await supabase.from("licenses")
        .update({ expires_at: newExp.toISOString(), status: "active" })
        .eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, expires_at: newExp.toISOString() });
    }

    if (action === "delete") {
      const { error } = await supabase.from("licenses").delete().eq("code", body.code);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: "server_error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

### 📦 الدالة 4/4 — `verify-dev-access`

**اسم الدالة**: `verify-dev-access`

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const enc = new TextEncoder();
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, device_id, device_name, user_agent } = await req.json();
    const expected = Deno.env.get("DEV_ACCESS_CODE") ?? "";
    const success = !!code && code === expected;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("dev_access_attempts").insert({
      code_hash: code ? await sha256Hex(String(code)) : null,
      device_id: device_id ?? null,
      device_name: device_name ?? null,
      user_agent: user_agent ?? null,
      success,
    });

    return new Response(JSON.stringify({ ok: success }), {
      status: success ? 200 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## ✅ المرحلة 4 — التحقق من النشر

بعد نشر الدوال الأربعة، يجب أن تراها في:
https://supabase.com/dashboard/project/qvvvaqxzqkwyaajiseec/functions

كلها يجب أن تظهر بحالة 🟢 **ACTIVE**.

اختبر سريعاً (في Terminal على جهازك):

```bash
curl -X POST https://qvvvaqxzqkwyaajiseec.supabase.co/functions/v1/activate-license \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_TMP3etW-oVFeTHEXxFapqg_6TP1PwMJ" \
  -d '{"code":"TEST","device_id":"test"}'
```

يجب أن ترى: `{"ok":false,"error":"invalid_code"}` ← هذا يعني أن كل شيء يعمل ✅

---

## 🎯 الخطوة التالية (عندما تنتهي)

أخبرني فقط: **"انتهيت من النشر"**

وسأقوم بـ:
1. تعديل كود التراخيص في المشروع ليستخدم **حسابك الخاص** بدلاً من Lovable Cloud
2. إنشاء client مستقل خاص بالتراخيص فقط
3. تجهيز إعدادات Electron build لاستخدام URL الخاص بك

⚠️ **لا تنسَ**: عندما تنشئ كود تجربة في لوحة المالك لاحقاً، يجب أن يُنشأ في حسابك الجديد وليس Lovable. لكن سنصل لذلك بعد تعديل الكود.
