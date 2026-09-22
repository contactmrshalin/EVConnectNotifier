const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}

async function load() {
  const response = await chrome.runtime.sendMessage({ type: 'state' });
  if (!response?.ok) return;
  const { settings } = response;

  $('pollingMinutes').value = String(settings.pollingMinutes);
  $('networkId').value = settings.networkId;
  $('email').value = settings.email;

  const signedIn = Boolean(settings.refreshToken || settings.apiToken);
  $('signedIn').hidden = !signedIn;
  $('signInForm').hidden = signedIn;
  if (signedIn) $('account').textContent = `Signed in as ${settings.email || 'your account'}.`;
}

$('signIn').addEventListener('click', async () => {
  setStatus('Signing in…');
  const response = await chrome.runtime.sendMessage({
    type: 'sign-in',
    email: $('email').value.trim(),
    password: $('password').value,
  });
  $('password').value = '';
  if (!response?.ok) return setStatus(response?.error ?? 'Sign in failed.', true);
  setStatus(
    response.expiresAt
      ? `Signed in — session valid until ${new Date(response.expiresAt).toLocaleDateString()}.`
      : 'Signed in.'
  );
  await load();
});

$('signOut').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'sign-out' });
  setStatus('Signed out.');
  await load();
});

$('save').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({
    type: 'save-settings',
    patch: {
      pollingMinutes: Number($('pollingMinutes').value),
      networkId: $('networkId').value.trim(),
    },
  });
  setStatus('Saved.');
  await load();
});

$('test').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'test-notification' });
  if (response?.ok) setStatus('Test notification sent.');
  else setStatus(response?.error ?? 'Notification failed.', true);
});

load();
