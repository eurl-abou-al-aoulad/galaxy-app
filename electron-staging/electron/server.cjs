// ============================================================
// خادم محلي لتشغيل TanStack Start Worker داخل Electron
// يحوّل Cloudflare Worker fetch handler إلى خادم HTTP محلي
// ============================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// مجلدات الموارد (تعمل في dev و في الحزمة المعبأة)
function findDir(name) {
  const candidates = [
    path.join(__dirname, "..", "dist", name),
    path.join(process.resourcesPath || "", "app", "dist", name),
    path.join(process.resourcesPath || "", "dist", name),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return candidates[0];
}

const CLIENT_DIR = findDir("client");
const SERVER_DIR = findDir("server");
const SERVER_ENTRY = path.join(SERVER_DIR, "index.js");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function safeJoin(base, target) {
  const resolved = path.resolve(base, "." + target);
  if (!resolved.startsWith(path.resolve(base))) return null;
  return resolved;
}

function serveStatic(req, res, filePath) {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return resolve(false);
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Cache-Control": "public, max-age=31536000",
      });
      fs.createReadStream(filePath).pipe(res).on("close", () => resolve(true));
    });
  });
}

async function nodeReqToWebRequest(req, baseUrl) {
  const url = new URL(req.url, baseUrl);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
    init.duplex = "half";
  }
  return new Request(url.toString(), init);
}

async function webResponseToNodeRes(webRes, res) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  if (!webRes.body) return res.end();
  const reader = webRes.body.getReader();
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  };
  await pump();
}

// ⚠️ منفذ ثابت إلزامي — IndexedDB و localStorage مرتبطان بـ origin (host:port).
// أي تغيير في المنفذ يفقد كل البيانات والتفعيل عند إعادة التشغيل.
const FIXED_PORT = 38291;

async function start({ port = FIXED_PORT } = {}) {
  // استيراد ديناميكي للـ ESM Worker entry
  let worker;
  try {
    const entryUrl = "file://" + SERVER_ENTRY.replace(/\\/g, "/");
    const mod = await import(entryUrl);
    worker = mod.default;
    if (!worker || typeof worker.fetch !== "function") {
      throw new Error("Worker entry has no default.fetch export");
    }
  } catch (e) {
    console.error("[server] Failed to load SSR worker, falling back to static-only:", e.message);
    worker = null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      // 1) ملفات ثابتة من client/
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath !== "/" && urlPath !== "") {
        const candidate = safeJoin(CLIENT_DIR, urlPath);
        if (candidate) {
          const served = await serveStatic(req, res, candidate);
          if (served) return;
        }
      }

      // 2) أصول البناء من server/assets (قد تطلبها مكتبات معينة)
      if (urlPath.startsWith("/assets/")) {
        const candidate = safeJoin(SERVER_DIR, urlPath);
        if (candidate) {
          const served = await serveStatic(req, res, candidate);
          if (served) return;
        }
      }

      // 3) SSR عبر Worker
      if (worker) {
        const baseUrl = `http://${req.headers.host || "127.0.0.1"}`;
        const webReq = await nodeReqToWebRequest(req, baseUrl);
        const env = {};
        const ctx = { waitUntil() {}, passThroughOnException() {} };
        const webRes = await worker.fetch(webReq, env, ctx);
        return webResponseToNodeRes(webRes, res);
      }

      // 4) fallback
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (e) {
      console.error("[server] Request error:", e);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error: " + (e && e.message));
    }
  });

  return new Promise((resolve, reject) => {
    const tryListen = (p, attempts = 0) => {
      server.once("error", (err) => {
        if (err && err.code === "EADDRINUSE" && attempts < 5) {
          // المنفذ مشغول من نسخة سابقة — جرّب نفس النطاق لضمان نفس origin قدر الإمكان
          tryListen(p + 1, attempts + 1);
        } else {
          reject(err);
        }
      });
      server.listen(p, "127.0.0.1", () => {
        const addr = server.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : p;
        console.log(`[server] Galaxy local server listening on http://127.0.0.1:${actualPort}`);
        resolve({ server, port: actualPort });
      });
    };
    tryListen(port);
  });
}

module.exports = { start, FIXED_PORT };
