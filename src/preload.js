const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('evc', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  testNotification: () => ipcRenderer.invoke('notify:test'),
});
