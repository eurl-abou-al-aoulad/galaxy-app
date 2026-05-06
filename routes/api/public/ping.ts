import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// نقطة "ضرب السيرفر" — تُستدعى من pg_cron كل 6 أيام لمنع تجميد المشروع
// تنفّذ استعلاماً خفيفاً لإبقاء قاعدة البيانات نشطة
export const Route = createFileRoute("/api/public/ping")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { count } = await supabaseAdmin
            .from("licenses")
            .select("*", { count: "exact", head: true });
          return Response.json({
            ok: true,
            ts: new Date().toISOString(),
            licenses: count ?? 0,
          });
        } catch (e) {
          return Response.json(
            { ok: false, error: String(e) },
            { status: 500 },
          );
        }
      },
      POST: async () => {
        try {
          await supabaseAdmin.from("licenses").select("code", { head: true, count: "exact" });
          return Response.json({ ok: true, ts: new Date().toISOString() });
        } catch (e) {
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
