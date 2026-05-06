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
});
