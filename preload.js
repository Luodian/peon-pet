const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peonBridge', {
  onEvent: (callback) => ipcRenderer.on('peon-event', (_e, data) => callback(data)),
  onSessionUpdate: (callback) => ipcRenderer.on('session-update', (_e, data) => callback(data)),
  onSwitchCharacter: (callback) => ipcRenderer.on('switch-character', (_e, data) => callback(data)),
  onSessionsToggle: (callback) => ipcRenderer.on('sessions-toggle', (_e, show) => callback(show)),
  onSessionsData: (callback) => ipcRenderer.on('sessions-data', (_e, data) => callback(data)),
  toggleSound: () => ipcRenderer.invoke('toggle-sound'),
  getSoundState: () => ipcRenderer.invoke('get-sound-state'),
  getCharacterConfig: () => ipcRenderer.invoke('get-character-config'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
});
