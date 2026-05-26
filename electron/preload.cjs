const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcaneStorage", {
  loadJson: (key) => ipcRenderer.invoke("arcane:load-json", key),
  saveJson: (key, data) => ipcRenderer.invoke("arcane:save-json", key, data),
  deleteJson: (key) => ipcRenderer.invoke("arcane:delete-json", key),
  meta: () => ipcRenderer.invoke("arcane:storage-meta"),
});

contextBridge.exposeInMainWorld("arcaneWindow", {
  setFullscreen: (fullscreen) => ipcRenderer.invoke("arcane:set-fullscreen", !!fullscreen),
  isFullscreen: () => ipcRenderer.invoke("arcane:is-fullscreen"),
});

contextBridge.exposeInMainWorld("arcaneLog", {
  write: (entry) => ipcRenderer.invoke("arcane:write-renderer-log", entry),
  meta: () => ipcRenderer.invoke("arcane:log-meta"),
});

contextBridge.exposeInMainWorld("arcaneSteam", {
  event: (name, payload) => ipcRenderer.invoke("arcane:steam-event", name, payload),
});
