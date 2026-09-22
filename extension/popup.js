const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}

function render({ state, settings }) {
  $('pollingMinutes').value = String(settings.pollingMinutes);

  const available = state.connectors.filter((c) => c.available);
  $('summary').textContent = state.error
    ? 'Unable to check availability'
    : `${available.length} of ${state.connectors.length} connectors available`;

  $('list').replaceChildren(
    ...available.slice(0, 20).map((connector) => {
      const item = document.createElement('li');
      item.textContent = connector.label;
      if (connector.powerLevel) {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = connector.powerLevel.replace(/_/g, ' ');
        item.appendChild(meta);
      }
      return item;
    })
  );

  if (state.error) setStatus(state.error, true);
  else if (state.notificationError) setStatus(state.notificationError, true);
  else if (state.updatedAt) setStatus(`Updated ${new Date(state.updatedAt).toLocaleTimeString()}`);
  else setStatus('Not checked yet.');
}

async function load() {
  const response = await chrome.runtime.sendMessage({ type: 'state' });
  if (response?.ok) render(response);
}

$('refresh').addEventListener('click', async () => {
  setStatus('Checking…');
  await chrome.runtime.sendMessage({ type: 'poll' });
  await load();
});

$('pollingMinutes').addEventListener('change', async (event) => {
  await chrome.runtime.sendMessage({
    type: 'save-settings',
    patch: { pollingMinutes: Number(event.target.value) },
  });
  await load();
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

load();
