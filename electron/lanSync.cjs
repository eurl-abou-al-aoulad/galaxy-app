// ====================================================================
// Galaxy LAN Sync — WebSocket Hub داخل Electron
// ====================================================================
// يفتح خادم WebSocket على منفذ ثابت (4555) داخل الشبكة المحلية.
// كل عميل (جهاز ثانوي) يتصل ويرسل/يستقبل أحداث Dexie لحظياً.
//
// البروتوكول (JSON):
//   { t: "hello", deviceId, deviceName, token? }
//   { t: "welcome", serverId, peers: [{deviceId, deviceName}] }
//   { t: "auth_required" } | { t: "auth_ok" } | { t: "auth_fail" }
//   { t: "op", op, table, key, value?, updatedAt, deviceId }
//   { t: "peer_join" | "peer_leave", deviceId, deviceName }
//   { t: "ping" } | { t: "pong" }
//
// ⚠️ يعمل فقط داخل Electron (يحتاج Node.js).
// ====================================================================
const { WebSocketServer } = require("ws");
const os = require("os");
const crypto = require("crypto");

const LAN_PORT = 4555;
const HEARTBEAT_MS = 30_000;

let wss = null;
let serverId = null;
let pairingToken = null; // اختياري: رمز اقتران بسيط
const peers = new Map(); // ws => { deviceId, deviceName, alive }

function getLocalIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === "IPv4" && !i.internal) {
        out.push({ name, address: i.address });
      }
    }
  }
  return out;
}

function broadcast(msg, exceptWs = null) {
  const data = JSON.stringify(msg);
  for (const ws of peers.keys()) {
    if (ws === exceptWs) continue;
    if (ws.readyState === ws.OPEN) {
      try { ws.send(data); } catch (_) {}
    }
  }
}

function listPeers() {
  return Array.from(peers.values()).map((p) => ({
    deviceId: p.deviceId,
    deviceName: p.deviceName,
  }));
}

function start({ port = LAN_PORT, token = null } = {}) {
  if (wss) return getStatus();
  serverId = crypto.randomBytes(8).toString("hex");
  pairingToken = token;

  wss = new WebSocketServer({ port, host: "0.0.0.0" });

  wss.on("connection", (ws, req) => {
    ws._alive = true;
    ws._authed = !pairingToken; // إذا لا يوجد توكن، الاتصال مفتوح داخل LAN
    ws._remoteAddr = req.socket.remoteAddress;

    ws.on("pong", () => { ws._alive = true; });

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // --- Hello / Auth ---
      if (msg.t === "hello") {
        if (pairingToken && msg.token !== pairingToken) {
          try { ws.send(JSON.stringify({ t: "auth_fail" })); ws.close(); } catch (_) {}
          return;
        }
        ws._authed = true;
        peers.set(ws, {
          deviceId: msg.deviceId || crypto.randomBytes(4).toString("hex"),
          deviceName: msg.deviceName || "device",
          alive: true,
        });
        const me = peers.get(ws);
        try {
          ws.send(JSON.stringify({
            t: "welcome",
            serverId,
            peers: listPeers().filter((p) => p.deviceId !== me.deviceId),
          }));
        } catch (_) {}
        broadcast({ t: "peer_join", deviceId: me.deviceId, deviceName: me.deviceName }, ws);
        return;
      }

      if (!ws._authed) return;

      // --- Operation broadcast ---
      if (msg.t === "op") {
        // إعادة بثّ لجميع الأقران الآخرين
        broadcast(msg, ws);
        return;
      }

      // --- Ping/Pong (app-level) ---
      if (msg.t === "ping") {
        try { ws.send(JSON.stringify({ t: "pong" })); } catch (_) {}
        return;
      }
    });

    ws.on("close", () => {
      const p = peers.get(ws);
      peers.delete(ws);
      if (p) broadcast({ t: "peer_leave", deviceId: p.deviceId, deviceName: p.deviceName });
    });

    ws.on("error", () => {
      try { ws.close(); } catch (_) {}
    });
  });

  // Heartbeat — قطع الاتصالات الميتة
  const interval = setInterval(() => {
    for (const ws of peers.keys()) {
      if (ws._alive === false) { try { ws.terminate(); } catch (_) {} continue; }
      ws._alive = false;
      try { ws.ping(); } catch (_) {}
    }
  }, HEARTBEAT_MS);
  wss._heartbeat = interval;

  console.log(`[lan-sync] WebSocket hub listening on 0.0.0.0:${port}`);
  return getStatus();
}

function stop() {
  if (!wss) return { running: false };
  try { clearInterval(wss._heartbeat); } catch (_) {}
  for (const ws of peers.keys()) { try { ws.close(); } catch (_) {} }
  peers.clear();
  try { wss.close(); } catch (_) {}
  wss = null;
  serverId = null;
  pairingToken = null;
  return { running: false };
}

function getStatus() {
  return {
    running: !!wss,
    port: LAN_PORT,
    serverId,
    ips: getLocalIPs(),
    peerCount: peers.size,
    peers: listPeers(),
    hasToken: !!pairingToken,
  };
}

module.exports = { start, stop, getStatus, LAN_PORT };
