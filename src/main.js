const path = require('path');
const { app, Tray, Menu, BrowserWindow, Notification, ipcMain, shell, nativeImage } = require('electron');
const store = require('./store');
const api = require('./api');
const { scan } = require('./scanner');

let tray = null;
let settingsWindow = null;
let pollTimer = null;
let keepAliveTimer = null;

const state = {
  ports: [],
  availableIds: new Set(),
  hasBaseline: false,
  error: null,
  updatedAt: null,
  polling: false,
  sessionExpiresAt: null,
};

app.setAppUserModelId('com.local.evconnect.notifier');
if (app.dock) app.dock.hide();

function trayIcon() {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', file));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: !store.load().playSound }).show();
}

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Swaps the rotating refresh token for a fresh API token and persists both.
async function refreshSession() {
  const pair = await api.refreshSession(store.load());
  store.save(pair);
  state.sessionExpiresAt = api.expiresAt(pair.refreshToken);
  return store.load();
}

async function ensureSession() {
  const settings = store.load();
  if (!settings.refreshToken) return settings;
  const expiry = api.expiresAt(settings.apiToken);
  const stale = !settings.apiToken || (expiry !== null && expiry - Date.now() < TOKEN_REFRESH_MARGIN_MS);
  return stale ? refreshSession() : settings;
}

async function poll() {
  if (state.polling) return;
  state.polling = true;
  updateTray();
  try {
    let settings = await ensureSession();
    let json;
    try {
      json = await api.fetchLocations(settings);
    } catch (error) {
      if (!error.unauthorized || !settings.refreshToken) throw error;
      settings = await refreshSession();
      json = await api.fetchLocations(settings);
    }
    const ports = scan(json);
    const nowAvailable = new Set(ports.filter((p) => p.available).map((p) => p.id));
    const newlyAvailable = ports.filter((p) => nowAvailable.has(p.id) && !state.availableIds.has(p.id));

    if (state.hasBaseline && newlyAvailable.length > 0) {
      const labels = newlyAvailable.map((p) => p.label);
      notify(
        labels.length === 1 ? 'Charger available' : `${labels.length} chargers available`,
        labels.slice(0, 5).join('\n')
      );
    }

    state.ports = ports;
    state.availableIds = nowAvailable;
    state.hasBaseline = true;
    state.error = null;
    state.updatedAt = new Date();
  } catch (error) {
    state.error = error.refreshTokenInvalid
      ? 'Refresh token rejected — paste a new one in Settings.'
      : error.message;
  } finally {
    state.polling = false;
    updateTray();
  }
}

const KEEP_ALIVE_MS = 12 * 60 * 60 * 1000;

// Paused mode still rotates the refresh token so the session is usable the next day.
async function keepAlive() {
  if (!store.load().refreshToken) return;
  try {
    await refreshSession();
    state.error = null;
  } catch (error) {
    state.error = error.refreshTokenInvalid
      ? 'Refresh token rejected — paste a new one in Settings.'
      : error.message;
  }
  updateTray();
}

function schedule() {
  if (pollTimer) clearInterval(pollTimer);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  const minutes = store.load().pollingMinutes;
  if (minutes > 0) {
    pollTimer = setInterval(poll, minutes * 60 * 1000);
  } else {
    keepAliveTimer = setInterval(keepAlive, KEEP_ALIVE_MS);
  }
}

function setPollingMinutes(minutes) {
  store.save({ pollingMinutes: minutes });
  schedule();
  updateTray();
}

function resetBaseline() {
  state.hasBaseline = false;
  state.availableIds = new Set();
}

function updateTray() {
  if (!tray) return;
  const settings = store.load();
  const availableCount = state.availableIds.size;

  const items = [];
  if (state.error) {
    items.push({ label: `⚠️ ${state.error}`.slice(0, 110), enabled: false });
  } else if (settings.pollingMinutes === 0) {
    items.push({ label: 'Polling paused — session kept alive', enabled: false });
  } else {
    items.push({ label: `${availableCount} of ${state.ports.length} connectors available`, enabled: false });
    for (const port of state.ports.filter((p) => p.available).slice(0, 12)) {
      items.push({ label: `• ${port.label}`.slice(0, 90), enabled: false });
    }
  }
  if (state.updatedAt) {
    items.push({ label: `Updated ${state.updatedAt.toLocaleTimeString()}`, enabled: false });
  }
  const sessionExpiry = state.sessionExpiresAt ?? api.expiresAt(settings.refreshToken);
  if (sessionExpiry) {
    items.push({ label: `Session valid until ${new Date(sessionExpiry).toLocaleDateString()}`, enabled: false });
  }

  items.push(
    { type: 'separator' },
    { label: state.polling ? 'Refreshing…' : 'Refresh Now', enabled: !state.polling, click: poll },
    {
      label: 'Polling Interval',
      submenu: [
        ...[5, 15, 30].map((minutes) => ({
          label: `${minutes} minutes`,
          type: 'radio',
          checked: settings.pollingMinutes === minutes,
          click: () => setPollingMinutes(minutes),
        })),
        { type: 'separator' },
        {
          label: 'Paused (keep session alive)',
          type: 'radio',
          checked: settings.pollingMinutes === 0,
          click: () => setPollingMinutes(0),
        },
      ],
    },
    { label: 'Settings…', click: openSettings },
    { label: 'Open Driver Portal', click: () => shell.openExternal(`${settings.baseUrl}/driver-portal`) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  );

  tray.setToolTip('EV Connect Notifier');
  tray.setContextMenu(Menu.buildFromTemplate(items));
  if (process.platform === 'darwin') {
    if (state.error) tray.setTitle(' !');
    else tray.setTitle(settings.pollingMinutes === 0 ? '' : ` ${availableCount}`);
  }
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    title: 'EV Connect Notifier Settings',
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  // External links must never open inside the app window.
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('settings:get', () => store.load());

ipcMain.handle('settings:save', (_event, patch) => {
  const settings = store.save(patch);
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.startAtLogin) });
  resetBaseline();
  schedule();
  if (settings.pollingMinutes > 0) poll();
  else updateTray();
  return settings;
});

ipcMain.handle('auth:login', async (_event, { email, password }) => {
  const pair = await api.login(store.load(), email, password);
  const settings = store.save({ ...pair, email });
  state.sessionExpiresAt = api.expiresAt(pair.refreshToken);
  resetBaseline();
  schedule();
  if (settings.pollingMinutes > 0) poll();
  else updateTray();
  return { expiresAt: state.sessionExpiresAt };
});

ipcMain.handle('notify:test', () => {
  notify('EV Connect Notifier', 'Notifications are working.');
  return true;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSettings);

  app.whenReady().then(() => {
    tray = new Tray(trayIcon());
    updateTray();
    const settings = store.load();
    // Only touch the login item when enabled; unsigned dev builds error on it.
    if (settings.startAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    if (!settings.apiToken && !settings.refreshToken) {
      openSettings();
    } else if (settings.pollingMinutes > 0) {
      poll();
    } else {
      keepAlive();
    }
    schedule();
  });

  app.on('window-all-closed', () => {
    // Tray app stays resident after the settings window closes.
  });
}
