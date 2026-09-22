const TEXT_FIELDS = [
  'apiToken',
  'refreshToken',
  'email',
  'baseUrl',
  'locationsPath',
  'authPath',
  'networkId',
  'appVersion',
];

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  const status = $('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

const loaded = {};

async function load() {
  const settings = await window.evc.getSettings();
  for (const field of TEXT_FIELDS) {
    loaded[field] = settings[field] ?? '';
    $(field).value = loaded[field];
  }
  $('pollingMinutes').value = String(settings.pollingMinutes);
  $('playSound').checked = Boolean(settings.playSound);
  $('startAtLogin').checked = Boolean(settings.startAtLogin);
}

function collect() {
  const patch = {};
  // Untouched fields are omitted so a stale form cannot clobber an auto-rotated token.
  for (const field of TEXT_FIELDS) {
    const value = $(field).value.trim();
    if (value !== loaded[field]) patch[field] = value;
  }
  patch.pollingMinutes = Number($('pollingMinutes').value);
  patch.playSound = $('playSound').checked;
  patch.startAtLogin = $('startAtLogin').checked;
  return patch;
}

$('save').addEventListener('click', async () => {
  await window.evc.saveSettings(collect());
  await load();
  setStatus('Saved. Polling restarted.');
});

$('login').addEventListener('click', async () => {
  setStatus('Signing in…');
  try {

    await window.evc.saveSettings(collect());
    const { expiresAt } = await window.evc.login($('email').value.trim(), $('password').value);
    $('password').value = '';
    await load();
    setStatus(
      expiresAt
        ? `Signed in — session valid until ${new Date(expiresAt).toLocaleDateString()}.`
        : 'Signed in — tokens saved.'
    );
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

$('test').addEventListener('click', async () => {
  await window.evc.testNotification();
  setStatus('Test notification sent.');
});

load().catch((error) => setStatus(error.message, true));
