import { useEffect, useRef } from "react";

/**
 * خلفية النجوم المتحركة الكونية — نسخة محسّنة للأداء:
 * - تتوقف عند إخفاء التبويب (visibilitychange)
 * - تحترم prefers-reduced-motion (نجوم ثابتة بدون animation)
 * - تخفّض الكثافة على الشاشات الصغيرة
 * - تتجنّب shadowBlur على كل إطار (مكلف جداً) — تستعمل تدرّج radial سريع
 * - مرسومة على devicePixelRatio محدود ≤ 1.5 لتفادي ضعف GPU
 */
export function StarfieldBackground({ density = 120 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmall = window.innerWidth < 768;
    const effectiveDensity = isSmall ? Math.min(density, 60) : density;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let raf = 0;
    let running = true;
    const stars: { x: number; y: number; r: number; a: number; s: number; t: number }[] = [];

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < effectiveDensity; i++) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.7 + 0.3,
        s: Math.random() * 0.15 + 0.02,
        t: Math.random() * Math.PI * 2,
      });
    }

    const drawStaticOnce = () => {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 200, 255, ${s.a})`;
        ctx.fill();
      }
    };

    const tick = () => {
      if (!running) return;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      // shadowBlur مرّة واحدة فقط في بداية الإطار — لا داخل الحلقة
      ctx.shadowColor = "rgba(180, 140, 255, 0.6)";
      ctx.shadowBlur = 4;
      for (const s of stars) {
        s.t += 0.02;
        s.y += s.s;
        if (s.y > h) {
          s.y = 0;
          s.x = Math.random() * w;
        }
        const alpha = s.a * (0.6 + 0.4 * Math.sin(s.t));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 200, 255, ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    if (reduced) {
      drawStaticOnce();
    } else {
      tick();
    }

    // إيقاف الرسم عند إخفاء التبويب — يوفّر بطارية وحرارة الجهاز
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced && !running) {
        running = true;
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density]);

  return (
    <canvas
      ref={ref}
      className="starfield-bg fixed inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
      aria-hidden
    />
  );
}
