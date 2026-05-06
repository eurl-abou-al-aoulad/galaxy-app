// ====================================================================
// Galaxy Desktop — Electron Main Process
// © 2026 — All Rights Reserved
//
// تطبيق سطح مكتب مستقل تماماً. يشغّل خادم HTTP محلي داخل العملية
// لاستضافة ملفات التطبيق المبنية ثم يحمّلها في النافذة. لا اتصال
// بـ Lovable أو أي موقع خارجي للواجهة. البيانات في IndexedDB المحلي.
// ====================================================================
const { app, BrowserWindow, Menu, shell, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const { start: startLocalServer, FIXED_PORT } = require("./server.cjs");

// ✅ ضمان نسخة واحدة فقط — يمنع تعارض المنفذ الثابت ويحافظ على نفس origin
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const isDev = process.env.NODE_ENV === "development";

let mainWindow = null;
let localServer = null;
let localPort = null;

function getIconPath() {
  return path.join(__dirname, "icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: "#0a0e1a",
    title: "Galaxy — نظام إدارة المحلات",
    autoHideMenuBar: true,
    icon: getIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ضروري لتشغيل preload.cjs
      devTools: isDev,
      partition: "persist:galaxy",
      preload: path.join(__dirname, "preload.cjs"),
      // ✅ تفعيل دوال window.confirm / window.alert / window.prompt الأصلية
      // (معطّلة افتراضياً في Electron وتسبب تجمّد النوافذ في الإصدارات الحديثة)
      enableWebSQL: false,
      safeDialogs: false,
      disableDialogs: false,
    },
  });

  if (!isDev) Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ===== IPC: Connected devices =====
ipcMain.handle("galaxy:list-printers", async () => {
  try {
    if (!mainWindow) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (e) {
    console.error("list-printers failed:", e);
    return [];
  }
});

ipcMain.handle("galaxy:print-silent", async (_event, { html, printerName, options }) => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: options?.silent ?? true,
          deviceName: printerName || undefined,
          pageSize: options?.size === "thermal" ? { width: 80000, height: 297000 } : "A4",
        },
        (success, errorType) => {
          win.close();
          if (success) resolve();
          else reject(new Error(errorType || "print failed"));
        },
      );
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

app.whenReady().then(async () => {
  try {
    const { server, port } = await startLocalServer({ port: FIXED_PORT });
    localServer = server;
    localPort = port;
  } catch (e) {
    console.error("Failed to start local server:", e);
    app.quit();
    return;
  }

  createWindow();

  if (!isDev) {
    const blocked = ["F12", "CommandOrControl+Shift+I", "CommandOrControl+Shift+J", "CommandOrControl+Shift+C", "CommandOrControl+U"];
    blocked.forEach((accel) => {
      globalShortcut.register(accel, () => {});
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (localServer) {
    try { localServer.close(); } catch (_) {}
  }
});
