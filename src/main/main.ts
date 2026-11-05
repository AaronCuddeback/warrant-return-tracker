import { app, BrowserWindow, Menu, Tray, nativeImage, powerMonitor, session, shell, nativeTheme, protocol, net } from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDirs, resourcePath } from './paths';
import { openDb, closeDb } from './db';
import { getSettings } from './settings';
import { ensureBuiltIns } from './templates';
import { registerIpc, broadcastChanged } from './ipc';
import { startReminders, stopReminders, checkNow, desktopNotify } from './reminders';
import { autoBackupIfDue } from './backup';
import { stats } from './repo';
import { log } from './log';
import type { Settings } from '../shared/types';

const APP_ID = 'org.wrt.warrantreturntracker';
const DEV_URL = process.env.WRT_DEV_URL;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayHintShown = false;
let idleTimer: NodeJS.Timeout | null = null;
let lockedByIdle = false;

app.setAppUserModelId(APP_ID);

// The UI is served from a private app:// scheme instead of file:// (standard Electron hardening;
// gives the page a real origin so the strict CSP and the PDF worker behave predictably).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
const UI_ORIGIN = 'app://ui';
const RENDERER_DIR = join(__dirname, 'renderer');

function registerAppProtocol() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.host !== 'ui') return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = normalize(join(RENDERER_DIR, rel));
    if (!file.startsWith(RENDERER_DIR + sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  void boot();
}

function icon(name: string) {
  return resourcePath('icons', name);
}

function showWindow(route?: string) {
  if (!win) createWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (route) win.webContents.send('navigate', route);
}

function createWindow() {
  const s = getSettings();
  const dark = s.app.theme === 'dark' || (s.app.theme === 'system' && nativeTheme.shouldUseDarkColors);
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: dark ? '#0b1220' : '#eef1f6',
    title: 'Warrant Return Tracker',
    icon: icon('app.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: dark ? '#0b1220' : '#eef1f6', symbolColor: dark ? '#cbd5e1' : '#1f2937', height: 40 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  win.setMenu(null);
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${UI_ORIGIN}/index.html`);

  const startHidden = process.argv.includes('--hidden') || (s.app.startMinimized && s.app.minimizeToTray);
  win.once('ready-to-show', () => {
    if (!startHidden) win?.show();
  });
  win.on('close', (e) => {
    if (!quitting && getSettings().app.minimizeToTray) {
      e.preventDefault();
      win?.hide();
      if (!trayHintShown) {
        trayHintShown = true;
        desktopNotify('Still running', 'Warrant Return Tracker keeps watching due dates from the system tray. Right-click the tray icon to quit.');
      }
    }
  });
  win.on('closed', () => {
    win = null;
  });
  win.on('focus', () => win?.flashFrame(false));
}

function buildTray() {
  const img = nativeImage.createFromPath(icon('tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Warrant Return Tracker');
  tray.on('click', () => showWindow());
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  let tip = 'Warrant Return Tracker';
  try {
    const st = stats();
    tip += `\n${st.overdue} overdue - ${st.dueSoon} due within 3 days - ${st.pending + st.executed} open`;
    if (st.overdue && win && !win.isFocused()) win.flashFrame(true);
  } catch {
    /* db not ready */
  }
  tray.setToolTip(tip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Warrant Return Tracker', click: () => showWindow() },
      { label: 'Add warrant...', click: () => showWindow('/new') },
      { type: 'separator' },
      { label: 'Check due dates now', click: () => void checkNow().then(refreshTray) },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function applyLoginItem(s: Settings) {
  if (!app.isPackaged) return;
  try {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({ openAtLogin: s.app.startOnLogin, path: exe, args: ['--hidden'] });
  } catch (e) {
    log('warn', 'could not set login item', e);
  }
}

function startIdleWatch() {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const s = getSettings();
    if (!s.app.lockEnabled || !s.app.hasPin || !win) return;
    const idle = powerMonitor.getSystemIdleTime();
    if (idle >= s.app.lockMinutes * 60) {
      if (!lockedByIdle) {
        lockedByIdle = true;
        win.webContents.send('lock');
      }
    } else lockedByIdle = false;
  }, 20_000);
}

function hardenSecurity() {
  // Deny every permission request (camera, mic, geolocation...). Nothing in the app needs one.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (e, url) => {
      if (DEV_URL && url.startsWith(DEV_URL)) return;
      if (url.startsWith(UI_ORIGIN + '/')) return;
      e.preventDefault();
    });
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });
}

async function boot() {
  await app.whenReady();
  try {
    ensureDirs();
    registerAppProtocol();
    hardenSecurity();
    await openDb();
    ensureBuiltIns();
  } catch (e) {
    log('error', 'startup failed', e);
    const { dialog } = await import('electron');
    dialog.showErrorBox('Warrant Return Tracker could not start', String((e as Error)?.message ?? e));
    app.quit();
    return;
  }
  registerIpc(() => win, (s) => {
    applyLoginItem(s);
    refreshTray();
  });
  createWindow();
  buildTray();
  applyLoginItem(getSettings());
  startIdleWatch();
  startReminders({ onClick: (id) => showWindow(`/warrant/${id}`), icon: icon('app.png') });
  autoBackupIfDue();
  setInterval(() => {
    autoBackupIfDue();
    refreshTray();
  }, 60 * 60 * 1000);

  // Re-check after sleep / unlock - laptops are often closed overnight.
  powerMonitor.on('resume', () => setTimeout(() => void checkNow().then(() => { refreshTray(); broadcastChanged(); }), 10_000));
  powerMonitor.on('unlock-screen', () => void checkNow().then(refreshTray));
  powerMonitor.on('lock-screen', () => {
    const s = getSettings();
    if (s.app.lockEnabled && s.app.hasPin) win?.webContents.send('lock');
  });
  log('info', `started v${app.getVersion()}`);
}

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  stopReminders();
  closeDb();
});
app.on('window-all-closed', () => {
  // keep running in tray when configured; otherwise quit
  if (!getSettings().app.minimizeToTray) app.quit();
});
