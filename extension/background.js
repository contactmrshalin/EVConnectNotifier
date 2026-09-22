import { fetchLocations, login, refreshSession, expiresAt } from './lib/api.js';
import { scan } from './lib/scanner.js';
import { getSettings, saveSettings, getState, setState } from './lib/settings.js';

const POLL_ALARM = 'poll';
const KEEP_ALIVE_ALARM = 'keep-alive';
const KEEP_ALIVE_MINUTES = 12 * 60;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function reschedule() {
  const { pollingMinutes } = await getSettings();
  await chrome.alarms.clearAll();
  if (pollingMinutes > 0) {
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: pollingMinutes, delayInMinutes: pollingMinutes });
  } else {
    chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: KEEP_ALIVE_MINUTES, delayInMinutes: KEEP_ALIVE_MINUTES });
  }
}

async function refreshTokens() {
  const pair = await refreshSession(await getSettings());
  return saveSettings(pair);
}

async function ensureSession() {
  const settings = await getSettings();
  if (!settings.refreshToken) return settings;
  const expiry = expiresAt(settings.apiToken);
  const stale = !settings.apiToken || (expiry !== null && expiry - Date.now() < TOKEN_REFRESH_MARGIN_MS);
  return stale ? refreshTokens() : settings;
}

function describeError(error) {
  if (error.refreshTokenInvalid) return 'Session ended — sign in again in Options.';
  return error.message;
}

async function updateBadge() {
  const settings = await getSettings();
  const { availableIds, error } = await getState();
  if (error) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
    return;
  }
  const text = settings.pollingMinutes === 0 ? '' : String(availableIds.length);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#2eb860' });
}

async function notify(title, message) {
  const level = await chrome.notifications.getPermissionLevel();
  if (level !== 'granted') {
    throw new Error('Chrome is blocking notifications for this extension. Enable them in Chrome and in your OS notification settings.');
  }
  return new Promise((resolve, reject) => {
    chrome.notifications.create(`evc-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 2,
    }, (id) => {
      const failure = chrome.runtime.lastError;
      if (failure || !id) reject(new Error(failure?.message ?? 'Notification was not shown.'));
      else resolve(id);
    });
  });
}

export async function poll() {
  try {
    let settings = await ensureSession();
    let payload;
    try {
      payload = await fetchLocations(settings);
    } catch (error) {
      if (!error.unauthorized || !settings.refreshToken) throw error;
      settings = await refreshTokens();
      payload = await fetchLocations(settings);
    }

    const connectors = scan(payload);
    const previous = await getState();
    const nowAvailable = connectors.filter((c) => c.available).map((c) => c.id);
    const newly = connectors.filter((c) => nowAvailable.includes(c.id) && !previous.availableIds.includes(c.id));

    // previous.updatedAt null means this is the first successful poll, so only baseline.
    if (previous.updatedAt && newly.length > 0) {
      const labels = newly.map((c) => c.label);
      await notify(
        labels.length === 1 ? 'Charger available' : `${labels.length} chargers available`,
        labels.slice(0, 5).join('\n')
      ).catch(async (failure) => {
        await setState({ notificationError: failure.message });
      });
    }

    await setState({
      connectors,
      availableIds: nowAvailable,
      error: null,
      updatedAt: Date.now(),
    });
  } catch (error) {
    await setState({ error: describeError(error) });
  }
  await updateBadge();
}

async function keepAlive() {
  const { refreshToken } = await getSettings();
  if (!refreshToken) return;
  try {
    await refreshTokens();
    await setState({ error: null });
  } catch (error) {
    await setState({ error: describeError(error) });
  }
  await updateBadge();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
  if (alarm.name === KEEP_ALIVE_ALARM) keepAlive();
});

chrome.runtime.onInstalled.addListener(async () => {
  await reschedule();
  const { refreshToken, apiToken } = await getSettings();
  if (!refreshToken && !apiToken) chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  await reschedule();
  const { pollingMinutes } = await getSettings();
  if (pollingMinutes > 0) poll();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'poll':
        await poll();
        return sendResponse({ ok: true, state: await getState() });
      case 'state':
        return sendResponse({ ok: true, state: await getState(), settings: await getSettings() });
      case 'sign-in': {
        const pair = await login(await getSettings(), message.email, message.password);
        const settings = await saveSettings({ ...pair, email: message.email });
        await setState({ connectors: [], availableIds: [], error: null, updatedAt: null });
        await reschedule();
        if (settings.pollingMinutes > 0) await poll();
        else await updateBadge();
        return sendResponse({ ok: true, expiresAt: expiresAt(pair.refreshToken) });
      }
      case 'sign-out':
        await saveSettings({ apiToken: '', refreshToken: '' });
        await setState({ connectors: [], availableIds: [], error: null, updatedAt: null });
        await chrome.alarms.clearAll();
        await updateBadge();
        return sendResponse({ ok: true });
      case 'save-settings': {
        await saveSettings(message.patch);
        await reschedule();
        await updateBadge();
        return sendResponse({ ok: true, settings: await getSettings() });
      }
      case 'test-notification':
        await notify('Charger Availability Notifier', 'Notifications are working.');
        return sendResponse({ ok: true });
      default:
        return sendResponse({ ok: false, error: 'Unknown request' });
    }
  })().catch((error) => sendResponse({ ok: false, error: describeError(error) }));
  return true;
});
