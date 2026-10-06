'use strict';
const path = require('path');
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const settings = require('./settings');
const opensearch = require('./opensearch');

const PAGE = path.join(__dirname, 'renderer', 'index.html');

// Russian UI: also makes datetime-local inputs use the dd.mm.yyyy, 24h format
// whatever the OS locale is.
app.commandLine.appendSwitch('lang', 'ru');
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#11141a',
    title: 'oslog',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.loadFile(PAGE);
  win.on('closed', () => { win = null; });
}

// The page must never navigate away or open windows; external links go to the browser.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

// ---------- IPC ----------
// Every handler returns {ok, data} / {ok:false, error}; preload turns it back
// into a resolved / rejected promise. Only our own page may call.
function handle(name, fn) {
  ipcMain.handle('osapi:' + name, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      return { ok: false, error: 'запрещено' };
    }
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  });
}

function connFrom(s, password) {
  if (!s.url) throw new Error('не задан URL OpenSearch');
  return { url: s.url, username: s.username, password, caPath: s.caPath, insecure: s.insecure };
}

handle('getSettings', () => settings.getPublic());

handle('saveSettings', (patch) => settings.save(patch));

// Tests the values currently in the form (not yet saved); an empty password
// field means "use the stored one".
handle('testConnection', (patch) => {
  const { settings: s, password } = settings.validate(patch || {});
  const pw = password !== undefined ? password : settings.getPassword();
  return opensearch.testConnection(connFrom(s, pw), s.index);
});

// One search at a time: a new one (or stopSearch) aborts the running one,
// which then resolves with what it has loaded.
let running = null;
handle('search', async (req) => {
  const { id } = req || {};
  if (!Number.isSafeInteger(id)) throw new Error('неверный запрос');
  if (running) running.abort();
  const ctl = new AbortController();
  running = ctl;
  try {
    const s = settings.load();
    const conn = connFrom(s, settings.getPassword());
    return await opensearch.searchLogs(conn, req, {
      signal: ctl.signal,
      onProgress: (p) => {
        if (win && !win.isDestroyed()) win.webContents.send('osapi:progress', Object.assign({ id }, p));
      },
    });
  } finally {
    if (running === ctl) running = null;
  }
});
handle('stopSearch', () => { if (running) running.abort(); return true; });
handle('cacheStats', () => ({ enabled: false, hits: 0, bytes: 0 }));
handle('clearCache', () => ({ enabled: false, removed: 0 }));

// ---------- lifecycle ----------
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
