// main.js — Qoder Electron main process
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const isDev = !app.isPackaged;

app.on('remote-require', (event) => event.preventDefault());
app.on('remote-get-global', (event) => event.preventDefault());

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Open a folder in the system file explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  if (!folderPath) return;
  const err = await shell.openPath(folderPath);
  if (err) dialog.showErrorBox('Could not open folder', err);
});

// Show a native folder picker dialog, return selected path
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

// Write HTML to a temp file and open it in the default browser for printing
// This replaces window.open() which triggers "Get an app" on Windows
ipcMain.handle('open-html-in-browser', async (event, html) => {
  try {
    const tmpPath = path.join(os.tmpdir(), `qoder-report-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');
    await shell.openPath(tmpPath);
    // Clean up after 60s (enough time for the print dialog)
    setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 60000);
  } catch (err) {
    dialog.showErrorBox('PDF Export Error', err.message);
  }
});

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
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

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
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