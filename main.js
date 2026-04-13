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
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch { /* electron-updater not installed yet — safe to ignore in dev */ }

app.on('remote-require', (event) => event.preventDefault());
app.on('remote-get-global', (event) => event.preventDefault());

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('open-folder', async (event, folderPath) => {
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

ipcMain.handle('open-html-in-browser', async (event, html) => {
  try {
    const tmpPath = path.join(os.tmpdir(), `qoder-report-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');
    await shell.openPath(tmpPath);
    setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 60000);
  } catch (err) {
    dialog.showErrorBox('PDF Export Error', err.message);
  }
});

ipcMain.handle('check-for-updates', () => {
  if (autoUpdater && !isDev) autoUpdater.checkForUpdates();
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false, // show after ready-to-show to avoid white flash
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#0c1020',
        symbolColor: '#8B8FA8',
        height: 32,
      }
    } : {}),
    backgroundColor: '#0A0E1A',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Open maximized so the full screen is used from the start
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

  // Wire up auto-updater events → renderer
  if (autoUpdater && !isDev) {
    autoUpdater.on('update-available',    () => mainWindow?.webContents.send('update-available'));
    autoUpdater.on('download-progress',   () => mainWindow?.webContents.send('update-progress'));
    autoUpdater.on('update-downloaded',   () => mainWindow?.webContents.send('update-ready'));
    autoUpdater.on('error', (err)         => console.error('Updater error:', err));
    // Check on startup after a short delay
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch {} }, 8000);
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
      { label: 'About Qoder', click: () => dialog.showMessageBox({ message: 'Qoder v1.0.0', detail: 'Track every build.', buttons: ['OK'] }) },
      { type: 'separator' },
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