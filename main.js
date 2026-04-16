// main.js — Qoder Electron main process
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const isDev = !app.isPackaged;

// ── Auto-updater ──────────────────────────────────────────────────────────────
let autoUpdater = null;
if (!isDev) {
  try {
    ({ autoUpdater } = require('electron-updater'));
    // Do NOT autoDownload — we trigger it manually so we can track progress
    autoUpdater.autoDownload         = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade       = false;
    autoUpdater.logger = {
      info:  (...a) => console.log('[updater]', ...a),
      warn:  (...a) => console.warn('[updater]', ...a),
      error: (...a) => console.error('[updater]', ...a),
      debug: () => {},
    };
  } catch (e) {
    console.warn('electron-updater not available:', e.message);
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
    const result = await autoUpdater.checkForUpdates();
    const latest  = result?.updateInfo?.version;
    const current = app.getVersion();
    if (latest && latest !== current) return { status: 'available', version: latest };
    return { status: 'not-available', version: current };
  } catch (err) {
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
  if (!autoUpdater) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
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
      mainWindow?.webContents.send('update-available', info.version);
    });
    autoUpdater.on('download-progress', progressObj => {
      // Send real percentage so the UI can show a progress bar
      mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent || 0));
    });
    autoUpdater.on('update-downloaded', info => {
      mainWindow?.webContents.send('update-ready', info.version);
    });
    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('update-not-available');
    });
    autoUpdater.on('error', err => {
      console.error('updater error:', err.message);
      mainWindow?.webContents.send('update-error', err.message?.split('\n')[0]?.slice(0, 120));
    });
    // Check on startup — just check, don't download yet
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch {} }, 10000);
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