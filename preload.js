// preload.js — Qoder Electron preload
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Open a local folder in the system file explorer
  openFolder:   (path) => ipcRenderer.invoke('open-folder', path),
  // Show native folder picker, returns selected path or null
  selectFolder: ()     => ipcRenderer.invoke('select-folder'),
  // Listen for "New Project" menu shortcut
  onNewProject: (cb)   => ipcRenderer.on('new-project', cb),
  platform: process.platform,
});
