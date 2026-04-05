const ext = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  backendUrl: 'http://localhost:3000',
  token: '',
  user: null,
  monitoringEnabled: false,
  minimumSeverity: 'HIGH',
  scanCooldownMinutes: 15,
  lastScanStatus: 'Idle',
  lastScanAt: null,
  lastScanResult: null
};

function storageGet(keys) {
  return new Promise((resolve) => ext.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => ext.storage.local.set(values, resolve));
}

function runtimeSendMessage(message) {
  return new Promise((resolve) => ext.runtime.sendMessage(message, resolve));
}

const backendUrlInput = document.getElementById('backendUrl');
const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');
const monitoringEnabledInput = document.getElementById('monitoringEnabled');
const minimumSeverityInput = document.getElementById('minimumSeverity');
const scanCooldownMinutesInput = document.getElementById('scanCooldownMinutes');
const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const saveButton = document.getElementById('saveButton');
const scanNowButton = document.getElementById('scanNowButton');
const connectionStatus = document.getElementById('connectionStatus');
const lastScanStatus = document.getElementById('lastScanStatus');
const lastScanMeta = document.getElementById('lastScanMeta');

function normalizeBackendUrl(url) {
  return String(url || DEFAULT_SETTINGS.backendUrl).trim().replace(/\/+$/, '');
}

function updateConnectionStatus(settings) {
  if (settings.user?.email) {
    connectionStatus.textContent = `Connected as ${settings.user.email}`;
  } else {
    connectionStatus.textContent = 'Not connected.';
  }
}

function updateLastScanStatus(settings) {
  lastScanStatus.textContent = settings.lastScanStatus || 'Idle';
  if (settings.lastScanAt) {
    const date = new Date(settings.lastScanAt);
    lastScanMeta.textContent = `Last scan at ${date.toLocaleString()}`;
  } else {
    lastScanMeta.textContent = 'No scan has run yet.';
  }
}

async function loadSettings() {
  const settings = await storageGet(DEFAULT_SETTINGS);

  backendUrlInput.value = normalizeBackendUrl(settings.backendUrl);
  monitoringEnabledInput.checked = Boolean(settings.monitoringEnabled);
  minimumSeverityInput.value = settings.minimumSeverity || 'HIGH';
  scanCooldownMinutesInput.value = String(settings.scanCooldownMinutes || 15);

  updateConnectionStatus(settings);
  updateLastScanStatus(settings);
}

async function triggerImmediateScan() {
  try {
    lastScanStatus.textContent = 'Scanning current tab...';
    await runtimeSendMessage({ type: 'scan-after-connect' });
  } catch {
    // Swallow popup-trigger scan errors; loadSettings will show the latest extension state.
  } finally {
    await loadSettings();
  }
}

connectButton.addEventListener('click', async () => {
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!backendUrl || !identifier || !password) {
    connectionStatus.textContent = 'Enter backend URL, user ID/email, and password.';
    return;
  }

  connectionStatus.textContent = 'Connecting...';

  try {
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      connectionStatus.textContent = data.error || 'Failed to connect.';
      return;
    }

    await storageSet({
      backendUrl,
      token: data.token,
      user: data.user,
      monitoringEnabled: true
    });

    passwordInput.value = '';
    identifierInput.value = '';
    await triggerImmediateScan();
  } catch (error) {
    connectionStatus.textContent = error instanceof Error ? error.message : 'Unable to reach DarkScan AI.';
  }
});

disconnectButton.addEventListener('click', async () => {
  await storageSet({
    token: '',
    user: null,
    monitoringEnabled: false
  });
  await runtimeSendMessage({ type: 'clear-badge' });
  await loadSettings();
});

saveButton.addEventListener('click', async () => {
  await storageSet({
    backendUrl: normalizeBackendUrl(backendUrlInput.value),
    monitoringEnabled: monitoringEnabledInput.checked,
    minimumSeverity: minimumSeverityInput.value,
    scanCooldownMinutes: Math.max(1, Number(scanCooldownMinutesInput.value) || 15)
  });
  if (monitoringEnabledInput.checked) {
    await triggerImmediateScan();
  } else {
    await loadSettings();
  }
});

scanNowButton.addEventListener('click', async () => {
  lastScanStatus.textContent = 'Scanning current tab...';
  const result = await runtimeSendMessage({ type: 'scan-active-tab' });
  if (result?.reason) {
    lastScanStatus.textContent = result.reason;
  }
  await loadSettings();
});

loadSettings();
