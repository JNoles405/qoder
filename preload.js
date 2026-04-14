// preload.js — Qoder Electron preload
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder:           (path) => ipcRenderer.invoke('open-folder', path),
  selectFolder:         ()     => ipcRenderer.invoke('select-folder'),
  openHTMLInBrowser:    (html) => ipcRenderer.invoke('open-html-in-browser', html),
  checkForUpdates:      ()     => ipcRenderer.invoke('check-for-updates'),   // now returns {status,version?,message?}
  installUpdate:        ()     => ipcRenderer.invoke('install-update'),
  setTitlebarOverlay:   (opts) => ipcRenderer.invoke('set-titlebar-overlay', opts),

  // Event listeners — each returns a cleanup function
  onNewProject:         (cb) => { ipcRenderer.on('new-project',         cb); return () => ipcRenderer.removeListener('new-project',         cb); },
  onMenuCheckUpdates:   (cb) => { ipcRenderer.on('menu-check-updates',  cb); return () => ipcRenderer.removeListener('menu-check-updates',  cb); },
  onUpdateAvailable:    (cb) => { ipcRenderer.on('update-available',    cb); return () => ipcRenderer.removeListener('update-available',    cb); },
  onUpdateProgress:     (cb) => { ipcRenderer.on('update-progress',     cb); return () => ipcRenderer.removeListener('update-progress',     cb); },
  onUpdateReady:        (cb) => { ipcRenderer.on('update-ready',        cb); return () => ipcRenderer.removeListener('update-ready',        cb); },
  onUpdateNotAvailable: (cb) => { ipcRenderer.on('update-not-available',cb); return () => ipcRenderer.removeListener('update-not-available',cb); },
  onUpdateError:        (cb) => { ipcRenderer.on('update-error',        cb); return () => ipcRenderer.removeListener('update-error',        cb); },

  platform: process.platform,
  appVersion: process.env.npm_package_version || '',
});