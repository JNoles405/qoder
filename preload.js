// preload.js — Qoder Electron preload
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder:         (path) => ipcRenderer.invoke('open-folder', path),
  selectFolder:       ()     => ipcRenderer.invoke('select-folder'),
  openHTMLInBrowser:  (html) => ipcRenderer.invoke('open-html-in-browser', html),
  checkForUpdates:    ()     => ipcRenderer.invoke('check-for-updates'),
  installUpdate:      ()     => ipcRenderer.invoke('install-update'),
  onNewProject:       (cb)   => { ipcRenderer.on('new-project', cb); return ()=>ipcRenderer.removeListener('new-project',cb); },
  onUpdateAvailable:  (cb)   => { ipcRenderer.on('update-available',  cb); return ()=>ipcRenderer.removeListener('update-available',cb);  },
  onUpdateProgress:   (cb)   => { ipcRenderer.on('update-progress',   cb); return ()=>ipcRenderer.removeListener('update-progress',cb);   },
  onUpdateReady:      (cb)   => { ipcRenderer.on('update-ready',      cb); return ()=>ipcRenderer.removeListener('update-ready',cb);      },
  platform: process.platform,
});