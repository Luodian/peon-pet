const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelBridge', {
  onSessionsData: (callback) => ipcRenderer.on('sessions-data', (_e, data) => callback(data)),
});
