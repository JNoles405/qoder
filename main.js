// main.js — Qoder Electron main process
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const isDev  = !app.isPackaged;

// Auto-updater — only active in production builds
let autoUpdater;
try {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload    = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger          = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
} catch { /* electron-updater not installed — safe in dev */ }

app.on('remote-require',    (e) => e.preventDefault());
app.on('remote-get-global', (e) => e.preventDefault());

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('open-folder', async (_, folderPath) => {
  if (!folderPath) return;
  const err = await shell.openPath(folderPath);
  if (err) dialog.showErrorBox('Could not open folder', err);
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-html-in-browser', async (_, html) => {
  try {
    const tmpPath = path.join(os.tmpdir(), `qoder-report-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');
    await shell.openPath(tmpPath);
    setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 60000);
  } catch (err) {
    dialog.showErrorBox('PDF Export Error', err.message);
  }
});

// Returns: { status: 'available'|'not-available'|'error', message? }
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { status: 'error', message: 'Updater not available in dev mode' };
  if (isDev)        return { status: 'error', message: 'Updates are disabled in development mode' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest  = result?.updateInfo?.version;
    const current = app.getVersion();
    if (latest && latest !== current) {
      return { status: 'available', version: latest };
    }
    return { status: 'not-available', version: current };
  } catch (err) {
    // Trim the raw error — electron-updater throws verbose objects
    let msg = err.message || String(err);
    if (msg.includes('404') || msg.includes('HttpError')) {
      msg = 'No releases found on GitHub. Run "npm run electron:win" to publish your first release.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('network')) {
      msg = 'No internet connection. Check your network and try again.';
    } else if (msg.includes('token') || msg.includes('401') || msg.includes('403')) {
      msg = 'GitHub authentication failed. Check that your GH_TOKEN is valid.';
    } else {
      // Keep only the first sentence of any other error
      msg = msg.split('\n')[0].slice(0, 120);
    }
    return { status: 'error', message: msg };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

ipcMain.handle('set-titlebar-overlay', (_, opts) => {
  if (mainWindow && process.platform === 'win32') {
    try { mainWindow.setTitleBarOverlay(opts); } catch {}
  }
});

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color:       '#0c1020',
        symbolColor: '#8B8FA8',
        height: 32,
      }
    } : {}),
    backgroundColor: '#0A0E1A',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Auto-updater events → renderer
  if (autoUpdater && !isDev) {
    autoUpdater.on('update-available',  (info) => mainWindow?.webContents.send('update-available',  info.version));
    autoUpdater.on('download-progress', ()     => mainWindow?.webContents.send('update-progress'));
    autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update-ready',      info.version));
    autoUpdater.on('update-not-available', ()  => mainWindow?.webContents.send('update-not-available'));
    autoUpdater.on('error', (err) => {
      console.error('Updater error:', err.message);
      mainWindow?.webContents.send('update-error', err.message);
    });
    // Check 10 seconds after launch
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch {} }, 10000);
  }

  return mainWindow;
}

// ── App Menu ──────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ]}] : []),
    { label: 'File', submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: (_, win) => win?.webContents.send('new-project') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
    ]},
    { label: 'Help', submenu: [
      { label: 'About Qoder', click: () => dialog.showMessageBox({ message: `Qoder v${app.getVersion()}`, detail: 'Track every build.', buttons: ['OK'] }) },
      { type: 'separator' },
      { label: 'Check for Updates', click: () => mainWindow?.webContents.send('menu-check-updates') },
      { label: 'Supabase Dashboard', click: () => shell.openExternal('https://supabase.com/dashboard') },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  buildMenu();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });