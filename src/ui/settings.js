// ui/settings.js — the Settings dialog: AI key and model, double-check mode, price source, accuracy.

import { app, allItems } from '../state.js';
import { saveSettings } from '../settings.js';
import { APP_VERSION } from '../config.js';
import { MODELS, createAi, directTransport, modelShortName } from '../recognize/ai.js';
import { PROVIDERS } from '../providers/index.js';
import { accuracyByModel } from '../stats.js';
import { THEMES, applyTheme } from '../theme.js';
import { $, esc, clamp, parseMoney } from './dom.js';

function statsHtml() {
  const rows = accuracyByModel(allItems());
  if (!rows.length) return 'No scans yet. Accuracy shows here once you scan and confirm cards.';
  return `<table class="stats2"><tr><th>Reader</th><th>Scans</th><th>Fixed by hand</th><th>Accuracy</th></tr>${rows.map((r) =>
    `<tr><td>${esc(modelShortName(r.model))}</td><td>${r.scans}</td><td>${r.corrected + r.failed}</td><td>${r.accuracy}%</td></tr>`).join('')}</table>`;
}

export function initSettings(onSaved) {
  $('aiModel').innerHTML = Object.entries(MODELS).map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
  $('providerSel').innerHTML = Object.values(PROVIDERS).map((p) =>
    `<option value="${p.id}"${p.id === 'scrydex' ? ' disabled' : ''}>${esc(p.label)}${p.id === 'tcgplayer' ? ' · recommended' : p.id === 'tcgdex' ? ' · not verified yet' : p.id === 'scrydex' ? ' · not built yet' : ''}</option>`).join('');

  $('themeSel').innerHTML = Object.entries(THEMES).map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
  // Preview the theme as soon as it's picked; Cancel puts the saved one back.
  $('themeSel').addEventListener('change', () => applyTheme($('themeSel').value));

  $('settingsBtn').addEventListener('click', () => {
    const s = app.settings;
    $('themeSel').value = s.theme || 'dark';
    $('aiKeyInput').value = s.aiKey;
    $('aiModel').value = s.model;
    $('verifyMode').value = s.verify;
    $('providerSel').value = s.provider;
    $('tcgKeyInput').value = s.tcgKey;
    $('defPct').value = s.defaultPct;
    $('testResult').textContent = '';
    $('statsBox').innerHTML = statsHtml();
    const nm = app.live && app.live.enabled ? 'Near Mint prices: live from TCGplayer' : 'Near Mint prices: not set up (daily prices)';
    $('aboutLine').textContent = `EZScanner v${APP_VERSION} · data is saved on this phone${app.storage.persistent ? '' : ' (not saving: private browsing?)'} · ${nm}`;
    $('settings').showModal();
  });
  $('settingsCancel').addEventListener('click', () => $('settings').close());
  $('settings').addEventListener('close', () => applyTheme(app.settings.theme)); // Cancel, Esc or Save
  $('settingsSave').addEventListener('click', () => {
    const d = parseMoney($('defPct').value);
    saveSettings(app.settings, {
      theme: $('themeSel').value,
      aiKey: $('aiKeyInput').value.trim(),
      model: $('aiModel').value,
      verify: $('verifyMode').value,
      provider: $('providerSel').value,
      tcgKey: $('tcgKeyInput').value.trim(),
      defaultPct: d == null ? app.settings.defaultPct : clamp(d, 0, 100),
    });
    $('settings').close();
    onSaved();
  });
  $('testKey').addEventListener('click', async () => {
    const key = $('aiKeyInput').value.trim();
    if (!key) { $('testResult').textContent = 'Paste a key first.'; return; }
    $('testResult').textContent = 'Testing…';
    try {
      await createAi(directTransport(() => key)).ping($('aiModel').value);
      $('testResult').textContent = '✓ Key works.';
    } catch (e) {
      $('testResult').textContent = '✗ ' + e.message;
    }
  });
}
