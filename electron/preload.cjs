// ====================================================================
// Galaxy Desktop — Preload (context bridge)
// يفضح API آمن للنافذة دون تعطيل عزل السياق.
// ====================================================================
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("galaxyAPI", {
  isElectron: true,
  listPrinters: () => ipcRenderer.invoke("galaxy:list-printers"),
  printSilent: (html, printerName, options) =>
    ipcRenderer.invoke("galaxy:print-silent", { html, printerName, options }),
  // LAN Sync hub (host side)
  lanStart: (opts) => ipcRenderer.invoke("galaxy:lan-start", opts),
  lanStop: () => ipcRenderer.invoke("galaxy:lan-stop"),
  lanStatus: () => ipcRenderer.invoke("galaxy:lan-status"),
});
