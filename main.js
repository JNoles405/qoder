// main.js — Qoder Electron main process
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const isDev = !app.isPackaged;

// ── Auto-updater ──────────────────────────────────────────────────────────────
// electron-log writes to %APPDATA%\Qoder\logs\main.log on Windows.
// Loaded unconditionally so log.* calls are safe in dev too.
const log = require('electron-log');
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.info('─── Qoder starting ───', { version: app.getVersion(), isDev, platform: process.platform });

let autoUpdater = null;
if (!isDev) {
  try {
    ({ autoUpdater } = require('electron-updater'));
    // Do NOT autoDownload — we trigger it manually so we can track progress
    autoUpdater.autoDownload         = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade       = false;
    autoUpdater.logger = log;
  } catch (e) {
    log.warn('electron-updater not available:', e.message);
    autoUpdater = null;
  }
}

app.on('remote-require',    e => e.preventDefault());
app.on('remote-get-global', e => e.preventDefault());

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('open-folder', async (_, folderPath) => {
  if (!folderPath) return;
  const err = await shell.openPath(folderPath);
  if (err) dialog.showErrorBox('Could not open folder', err);
});

ipcMain.handle('select-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Project Folder' });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open-html-in-browser', async (_, html) => {
  try {
    const tmp = path.join(os.tmpdir(), `qoder-report-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    await shell.openPath(tmp);
    setTimeout(() => { try { fs.unlinkSync(tmp); } catch {} }, 60000);
  } catch (err) {
    dialog.showErrorBox('Export Error', err.message);
  }
});

// Check only — returns {status, version?} without starting download
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { status: 'error', message: 'Dev build — updater disabled.' };
  try {
    log.info('IPC check-for-updates: calling autoUpdater.checkForUpdates()');
    const result = await autoUpdater.checkForUpdates();
    const latest  = result?.updateInfo?.version;
    const current = app.getVersion();
    log.info('IPC check-for-updates: result', { latest, current });
    if (latest && latest !== current) return { status: 'available', version: latest };
    return { status: 'not-available', version: current };
  } catch (err) {
    log.error('IPC check-for-updates: failed', err);
    let msg = String(err.message || err);
    if (msg.includes('404') || msg.includes('HttpError'))
      msg = 'No releases found on GitHub. Run npm run electron:win to publish.';
    else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN'))
      msg = 'No internet connection.';
    else if (msg.includes('401') || msg.includes('403'))
      msg = 'GitHub access denied. Make sure the repo is public.';
    else
      msg = msg.split('\n')[0].slice(0, 120);
    return { status: 'error', message: msg };
  }
});

// Explicitly start the download — called when user clicks "Download"
ipcMain.handle('start-download', async () => {
  if (!autoUpdater) { log.warn('IPC start-download: autoUpdater is null'); return; }
  try {
    log.info('IPC start-download: calling autoUpdater.downloadUpdate()');
    const files = await autoUpdater.downloadUpdate();
    log.info('IPC start-download: downloadUpdate() resolved', { files });
  } catch (err) {
    log.error('IPC start-download: downloadUpdate() threw', err);
    mainWindow?.webContents.send('update-error', err.message?.split('\n')[0]?.slice(0, 120));
  }
});

ipcMain.handle('install-update', () => {
  // isSilent=true, isForceRunAfter=true — quit and relaunch immediately
  autoUpdater?.quitAndInstall(true, true);
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
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: { color: '#0c1020', symbolColor: '#8B8FA8', height: 32 }
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

  // Wire updater events → renderer
  if (autoUpdater) {
    autoUpdater.on('update-available', info => {
      log.info('event update-available', { version: info.version });
      mainWindow?.webContents.send('update-available', info.version);
    });
    autoUpdater.on('download-progress', progressObj => {
      log.info('event download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond,
      });
      mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent || 0));
    });
    autoUpdater.on('update-downloaded', info => {
      log.info('event update-downloaded', { version: info.version, path: info.downloadedFile });
      mainWindow?.webContents.send('update-ready', info.version);
    });
    autoUpdater.on('update-not-available', () => {
      log.info('event update-not-available');
      mainWindow?.webContents.send('update-not-available');
    });
    autoUpdater.on('error', err => {
      log.error('event error', err);
      mainWindow?.webContents.send('update-error', err.message?.split('\n')[0]?.slice(0, 120));
    });
    // Check on startup — just check, don't download yet
    setTimeout(() => {
      log.info('startup: auto-check for updates');
      try { autoUpdater.checkForUpdates(); } catch (e) { log.error('startup check threw', e); }
    }, 10000);
  }
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [
      { role:'about' }, { type:'separator' },
      { role:'services' }, { type:'separator' },
      { role:'hide' }, { role:'hideOthers' }, { role:'unhide' },
      { type:'separator' }, { role:'quit' }
    ]}] : []),
    { label:'File', submenu: [
      { label:'New Project', accelerator:'CmdOrCtrl+N', click:(_,win)=>win?.webContents.send('new-project') },
      { type:'separator' },
      isMac ? { role:'close' } : { role:'quit' }
    ]},
    { label:'Edit', submenu: [
      { role:'undo' }, { role:'redo' }, { type:'separator' },
      { role:'cut' }, { role:'copy' }, { role:'paste' }, { role:'selectAll' }
    ]},
    { label:'View', submenu: [
      { role:'reload' }, { role:'forceReload' }, { type:'separator' },
      { role:'resetZoom' }, { role:'zoomIn' }, { role:'zoomOut' },
      { type:'separator' }, { role:'togglefullscreen' },
      ...(isDev ? [{ type:'separator' }, { role:'toggleDevTools' }] : [])
    ]},
    { label:'Window', submenu: [
      { role:'minimize' }, { role:'zoom' },
      ...(isMac ? [{ type:'separator' }, { role:'front' }] : [{ role:'close' }])
    ]},
    { label:'Help', submenu: [
      { label:`About Qoder v${app.getVersion()}`, click:()=>dialog.showMessageBox({ message:`Qoder v${app.getVersion()}`, detail:'Track every build.', buttons:['OK'] }) },
      { type:'separator' },
      { label:'Check for Updates', click:()=>mainWindow?.webContents.send('menu-check-updates') },
      { label:'Supabase Dashboard', click:()=>shell.openExternal('https://supabase.com/dashboard') },
    ]},
  ]));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  buildMenu();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });