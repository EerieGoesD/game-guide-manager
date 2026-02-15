// electron/main.cjs
const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const isDev = !app.isPackaged;

// Helps Windows taskbar grouping/icon identity
if (process.platform === 'win32') {
  app.setAppUserModelId('com.eerie.guidemanager');
}

// Optional tray (set to true if you want a tray icon + menu)
const ENABLE_TRAY = false;

let mainWindow = null;
let tray = null;

function firstExistingPath(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function getIconPngPath() {
  // Use PNG for BrowserWindow icon (Linux cares most)
  return firstExistingPath([
    path.join(process.cwd(), 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath, 'build', 'icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, 'icon.png')
  ]);
}

function getTrayIconPath() {
  // Windows tray prefers .ico; others can use png
  const ico = firstExistingPath([
    path.join(process.cwd(), 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(__dirname, 'icon.ico')
  ]);

  if (process.platform === 'win32' && ico) return ico;

  return firstExistingPath([
    path.join(process.cwd(), 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(process.resourcesPath, 'build', 'icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, 'icon.png')
  ]);
}

function guidesPath() {
  return path.join(app.getPath('userData'), 'guides.json');
}

async function readGuides() {
  try {
    const p = guidesPath();
    if (!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf-8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}

async function writeGuides(guides) {
  const p = guidesPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(guides, null, 2), 'utf-8');
}

async function fetchUrl(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'text'
  });

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }

  const content = response.data;

  // Friendly block detection (not a bypass)
  if (
    typeof content === 'string' &&
    (content.includes('_cf_chl_opt') ||
      content.includes('challenge-platform') ||
      content.includes('Enable JavaScript and cookies to continue'))
  ) {
    throw new Error('Blocked by bot protection (try Paste Text).');
  }

  return typeof content === 'string' ? content : String(content);
}

function createWindow() {
  const iconPng = getIconPngPath() || undefined;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1b2838',
    icon: iconPng,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Open external links in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const trayIcon = getTrayIconPath();
  if (!trayIcon) return;

  tray = new Tray(trayIcon);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Guide Manager');
  tray.setContextMenu(menu);

  tray.on('double-click', () => {
    if (!mainWindow) createWindow();
    mainWindow.show();
    mainWindow.focus();
  });
}

ipcMain.handle('ggm_fetch', async (_event, url) => {
  return await fetchUrl(url);
});

ipcMain.handle('ggm_readGuides', async () => {
  return await readGuides();
});

ipcMain.handle('ggm_writeGuides', async (_event, guides) => {
  await writeGuides(guides);
  return true;
});

function fetchUrlViaBrowserWindow(url) {
  return new Promise((resolve, reject) => {
    const iconPng = getIconPngPath() || undefined;

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: true,
      backgroundColor: '#1b2838',
      icon: iconPng,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'import_preload.cjs')
      }
    });

    const wcId = win.webContents.id;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for import (60s).'));
    }, 60000);

    const onImport = (event, text) => {
      if (event.sender.id !== wcId) return;
      cleanup();
      resolve(String(text || ''));
    };

    function cleanup() {
      clearTimeout(timeout);
      ipcMain.removeListener('ggm_import_text', onImport);
      if (!win.isDestroyed()) {
        try {
          win.close();
        } catch {}
      }
    }

    ipcMain.on('ggm_import_text', onImport);

    win.loadURL(url).catch((err) => {
      cleanup();
      reject(err);
    });

    win.webContents.on('did-finish-load', async () => {
      try {
        await win.webContents.executeJavaScript(`
          (function(){
            function extract(){
              const pre = document.querySelector('pre');
              if (pre && pre.innerText && pre.innerText.trim()) return pre.innerText;
              return (document.body && document.body.innerText) ? document.body.innerText : '';
            }
            if (document.getElementById('ggm-import-overlay')) return;
            const btn = document.createElement('button');
            btn.id = 'ggm-import-overlay';
            btn.textContent = 'Import guide into Guide Manager';
            btn.style.cssText = 'position:fixed; top:12px; right:12px; z-index:999999; padding:12px 16px; font-size:14px; border:0; border-radius:8px; background:#66c0f4; color:#000; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.35);';
            btn.onclick = () => window.GGMImport.send(extract());
            document.documentElement.appendChild(btn);
          })();
        `);
      } catch {
        // ignore
      }
    });
  });
}

ipcMain.handle('ggm_fetch_browser', async (_event, url) => {
  return await fetchUrlViaBrowserWindow(url);
});

app.whenReady().then(() => {
  createWindow();
  if (ENABLE_TRAY) createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});