const ext = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  backendUrl: 'http://localhost:3000',
  token: '',
  user: null,
  monitoringEnabled: false,
  emailReports: false,
  minimumSeverity: 'HIGH',
  scanCooldownMinutes: 15,
  lastScanStatus: 'Idle',
  lastScanAt: null,
  lastScanResult: null
};

const recentScans = new Map();
const severityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function storageGet(keys) {
  return new Promise((resolve) => ext.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => ext.storage.local.set(values, resolve));
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => ext.tabs.query(queryInfo, resolve));
}

function getTab(tabId) {
  return new Promise((resolve) => {
    ext.tabs.get(tabId, (tab) => {
      if (ext.runtime?.lastError) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

function normalizeBackendUrl(url) {
  return String(url || DEFAULT_SETTINGS.backendUrl).trim().replace(/\/+$/, '');
}

function shouldScanUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function getScanKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url || '');
  }
}

function meetsThreshold(actual, minimum) {
  return (severityOrder[actual] || 1) >= (severityOrder[minimum] || 3);
}

async function getSettings() {
  const saved = await storageGet(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    backendUrl: normalizeBackendUrl(saved.backendUrl || DEFAULT_SETTINGS.backendUrl)
  };
}

async function scanActiveTabNow({ force = true } = {}) {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (!tab) {
    return { skipped: true, reason: 'No active tab found.' };
  }

  return analyzeVisitedTab(tab, { force });
}

async function setBadgeForSeverity(severity) {
  if (!severity || severity === 'LOW') {
    await ext.action.setBadgeText({ text: '' });
    return;
  }

  await ext.action.setBadgeText({ text: '!' });
  await ext.action.setBadgeBackgroundColor({
    color: severity === 'HIGH' ? '#dc2626' : '#d97706'
  });
}

async function analyzeVisitedTab(tab, { force = false } = {}) {
  if (!tab?.url || !shouldScanUrl(tab.url)) {
    return { skipped: true, reason: 'Only http and https pages are scanned.' };
  }

  const settings = await getSettings();
  if (!settings.monitoringEnabled) {
    return { skipped: true, reason: 'Browser Guard is disabled.' };
  }
  if (!settings.token) {
    return { skipped: true, reason: 'Extension is not connected to DarkScan AI.' };
  }

  const scanKey = getScanKey(tab.url);
  const cooldownMs = Math.max(1, Number(settings.scanCooldownMinutes) || 15) * 60 * 1000;
  const lastScannedAt = recentScans.get(scanKey);

  if (!force && lastScannedAt && Date.now() - lastScannedAt < cooldownMs) {
    return { skipped: true, reason: 'Scan cooldown active for this page.' };
  }

  recentScans.set(scanKey, Date.now());

  try {
    const response = await fetch(`${settings.backendUrl}/api/extension/scan-visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.token}`
      },
      body: JSON.stringify({
        url: tab.url,
        page_title: tab.title || '',
        email_reports: settings.emailReports,
        minimum_severity: settings.minimumSeverity
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error || `Scan failed with status ${response.status}.`;
      await storageSet({
        lastScanStatus: message,
        lastScanAt: new Date().toISOString(),
        lastScanResult: data
      });
      return { skipped: true, reason: message };
    }

    const severity = data.analysis?.severity || data.threat?.severity || 'LOW';
    const hostname = (() => {
      try {
        return new URL(tab.url).hostname;
      } catch {
        return tab.url;
      }
    })();

    await storageSet({
      lastScanStatus: `${severity} result for ${hostname}`,
      lastScanAt: new Date().toISOString(),
      lastScanResult: data
    });

    if (meetsThreshold(severity, settings.minimumSeverity)) {
      await setBadgeForSeverity(severity);
    } else {
      await setBadgeForSeverity('LOW');
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach the DarkScan AI backend.';
    await storageSet({
      lastScanStatus: message,
      lastScanAt: new Date().toISOString()
    });
    return { skipped: true, reason: message };
  }
}

ext.runtime.onInstalled.addListener(async () => {
  const current = await storageGet(DEFAULT_SETTINGS);
  await storageSet({ ...DEFAULT_SETTINGS, ...current });
});

ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    analyzeVisitedTab(tab);
  }
});

ext.tabs.onActivated.addListener(async ({ tabId }) => {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (tab?.id === tabId) {
    analyzeVisitedTab(tab);
  }
});

if (ext.webNavigation?.onCompleted) {
  ext.webNavigation.onCompleted.addListener(async ({ tabId, frameId }) => {
    if (frameId !== 0) {
      return;
    }

    const tab = await getTab(tabId);
    if (tab) {
      analyzeVisitedTab(tab);
    }
  });
}

if (ext.webNavigation?.onHistoryStateUpdated) {
  ext.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, frameId }) => {
    if (frameId !== 0) {
      return;
    }

    const tab = await getTab(tabId);
    if (tab) {
      analyzeVisitedTab(tab);
    }
  });
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'scan-active-tab') {
    scanActiveTabNow({ force: true }).then(async (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message?.type === 'scan-after-connect') {
    scanActiveTabNow({ force: true }).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message?.type === 'clear-badge') {
    setBadgeForSeverity('LOW').then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
