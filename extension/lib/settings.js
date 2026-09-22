export const DEFAULTS = {
  baseUrl: 'https://ops.evconnect.com',
  locationsPath: '/mobile/rest/v6/users/current/locations',
  authPath: '/mobile/rest/v6/auth',
  networkId: 'ev-connect',
  appVersion: '6.1.4',
  pollingMinutes: 15,
  email: '',
  apiToken: '',
  refreshToken: '',
};

export const POLLING_CHOICES = [5, 15, 30, 0];

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  const settings = { ...DEFAULTS, ...(stored.settings ?? {}) };
  if (!POLLING_CHOICES.includes(settings.pollingMinutes)) settings.pollingMinutes = 15;
  return settings;
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  if (!POLLING_CHOICES.includes(next.pollingMinutes)) next.pollingMinutes = 15;
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getState() {
  const stored = await chrome.storage.local.get('state');
  return {
    connectors: [],
    availableIds: [],
    error: null,
    notificationError: null,
    updatedAt: null,
    ...(stored.state ?? {}),
  };
}

export async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}
