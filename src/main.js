// C:\Users\eerie\Documents\GitHub\game-guide-manager\src\main.js
import './style.css';

import { getBridge } from './bridge.js';
import { normalizeGuideUrl, extractTextFromHtml } from './htmlToText.js';
import { encodeGuidesBackupToString, decodeGuidesBackupFromString } from './backup.js';

import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import pako from 'pako';

// Viewport fix (avoids iOS viewport bugs after modal screens)
function resetViewport() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
  }
}

(async () => {
  if (Capacitor?.isNativePlatform?.()) {
    try { await StatusBar.setOverlaysWebView({ overlay: false }); } catch {}
    try { await StatusBar.setBackgroundColor({ color: '#1b2838' }); } catch {}
  }
})();

const bridge = getBridge();

// State
let loadedContent = '';
let originalLines = [];
let currentGuideId = null;

// Find state
let findMatches = [];
let findIndex = -1;

// Selection mode
let selectMode = false;
let selectedGuideIds = new Set();

// Reader state
let isFullscreen = false;
let readerTheme = 'dark';
let wordColors = {};

// Import / Export state
let pendingImport = null; // { data, guideCount }
let lastBackup = null; // { path, uri, createdAt, bytes, encrypted }

const app = document.getElementById('app');

app.innerHTML = `
  <div class="container">

    <div id="mainScreen" class="screen active">
      <h1>Game Guide Manager</h1>

      <div class="main-menu">
        <div class="menu-button" id="btnLoadNew">
          <h3>Load New Guide</h3>
          <p>From file, paste, or URL</p>
        </div>

        <div class="menu-button" id="btnSaved">
          <h3>My Saved Guides</h3>
          <p id="guideCount">0 guides</p>
        </div>

        <div class="menu-button" id="btnIO">
          <h3>Import / Export</h3>
          <p>Sync guides between devices</p>
        </div>
      </div>

      <p class="help-text">
        Platform: <strong id="platformLabel"></strong>
      </p>

      <div class="footer">
        <a href="https://linktr.ee/eeriegoesd" target="_blank" rel="noreferrer">Made by EERIE</a>
        <a href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">Buy Me a Coffee</a>
      </div>
    </div>

    <div id="ioScreen" class="screen">
      <h1>Import / Export Saved Guides</h1>

      <div class="button-group">
        <button id="backToMainIO">Back</button>
      </div>

      <div class="selection-helper">
        <div class="io-tabs">
          <button class="secondary" id="tabExport">Export</button>
          <button class="secondary" id="tabImport">Import</button>
        </div>

        <div id="exportPane" style="margin-top:16px;">
          <h2>Backup File (recommended)</h2>
          <p class="help-text">
            Creates a compressed backup file. If you set a password, it is encrypted. Share it to your other device.
          </p>

          <label>Backup password (optional but recommended):</label>
          <input type="text" id="backupPassExport" placeholder="Choose a password you will remember">

          <div class="button-group">
            <button id="btnCreateBackup">Create Backup File</button>
            <button class="secondary" id="btnShareBackup" disabled>Share Backup</button>
          </div>

          <div class="selection-info">
            <strong>Guides:</strong> <span id="exportCount">0</span><br>
            <strong>Last backup:</strong> <span id="backupMeta">None</span>
          </div>

          <hr style="margin:16px 0; border:0; border-top:2px solid #417a9b;">

          <h2>Export Code (legacy)</h2>
          <p class="help-text">
            For small exports only. Large libraries will produce huge codes.
          </p>

          <div class="button-group">
            <button id="btnGenerateExport">Generate Code</button>
            <button class="secondary" id="btnCopyExport" disabled>Copy Code</button>
            <button class="secondary" id="btnShareExport" disabled>Share</button>
          </div>

          <label>Export Code:</label>
          <textarea id="exportCode" class="export-textarea" readonly placeholder="Click 'Generate Code'"></textarea>
        </div>

        <div id="importPane" style="margin-top:16px; display:none;">
          <h2>Import Backup File (recommended)</h2>
          <p class="help-text">
            Select a .ggm backup file and import by replacing or merging.
          </p>

          <label>Backup password (if you set one):</label>
          <input type="text" id="backupPassImport" placeholder="Enter password (if any)">

          <div class="button-group">
            <button id="btnPickBackup">Choose Backup File</button>
            <button class="secondary" id="btnClearImport">Clear</button>
          </div>

          <input type="file" id="backupFileInput" accept=".ggm,application/json,text/plain" style="display:none">

          <div id="importStatus"></div>

          <div id="importActions" style="display:none; margin-top:16px;">
            <div class="selection-info">
              <strong>Import contains:</strong> <span id="importGuideCount">0</span> guides
            </div>

            <div class="button-group">
              <button class="danger" id="btnImportReplace">Delete all and import</button>
              <button id="btnImportMerge">Keep current and import</button>
            </div>
          </div>

          <hr style="margin:16px 0; border:0; border-top:2px solid #417a9b;">

          <h2>Import Code (legacy)</h2>
          <p class="help-text">
            Paste a small export code here.
          </p>

          <label>Paste Export Code:</label>
          <textarea id="importCode" class="export-textarea" placeholder="Paste code here..."></textarea>

          <div class="button-group">
            <button id="btnValidateImport">Validate Code</button>
          </div>
        </div>
      </div>
    </div>

    <div id="loadScreen" class="screen">
      <h1>Load New Guide</h1>

      <div class="button-group">
        <button id="backToMain">Back</button>
      </div>

      <div class="selection-helper">
        <h2>Choose Source</h2>

        <div class="button-group">
          <button id="btnLoadFile">Load from File</button>
          <button id="btnPaste">Paste Text</button>
          <button id="btnUrl">Load from URL</button>
        </div>

        <input type="file" id="fileInput" accept=".txt,.text" style="display:none">

        <div id="textPaster" style="display:none; margin-top: 20px;">
          <label>Paste Guide Text:</label>
          <p class="help-text">Most reliable (works on all platforms).</p>
          <textarea id="pasteArea" placeholder="Paste guide text here..." style="min-height: 280px;"></textarea>
          <button id="btnPasteContinue">Continue</button>
        </div>

        <div id="urlLoader" style="display:none; margin-top: 20px;">
          <label>Enter URL:</label>
          <p class="help-text">
            On Android/iOS and Desktop, this uses native networking (no CORS issues).
          </p>
          <input type="text" id="urlInput" placeholder="https://gamefaqs.gamespot.com/...">
          <button id="btnUrlLoad">Load</button>
          <div id="loadError"></div>
        </div>

        <div id="loadingIndicator" class="loading" style="display:none">Loading guide...</div>
      </div>
    </div>

    <div id="extractScreen" class="screen">
      <h1>Trim Guide</h1>

      <div class="button-group">
        <button id="backToLoad">Back</button>
        <button class="secondary" id="btnResetTrim">Reset to Full</button>
        <button class="secondary" id="btnFind">Find</button>
        <button id="btnPreview">Preview</button>
        <button id="btnGoSave">Continue to Save</button>
      </div>

      <div class="selection-helper">
        <h2>Edit the guide text</h2>
        <p class="help-text">
          Remove unwanted parts by deleting text directly.
        </p>

        <div class="selection-info">
          <strong>Original Lines:</strong> <span id="totalLines">0</span><br>
          <strong>Current Lines:</strong> <span id="currentLines">0</span><br>
          <strong>Start Line:</strong> <span id="startLineLabel">1</span><br>
          <strong>End Line:</strong> <span id="endLineLabel">1</span>
        </div>

        <label>Trimmed Content (editable):</label>

        <div id="findBar" class="findbar">
          <input type="text" id="findQuery" placeholder="Find text..." autocomplete="off" />
          <span class="meta" id="findMeta">0/0</span>
          <button id="findPrev" class="secondary">Prev</button>
          <button id="findNext" class="secondary">Next</button>
          <button id="findClose" class="secondary">Close</button>
        </div>

        <textarea id="editContent" placeholder="Guide text will appear here..."></textarea>
      </div>
    </div>

    <div id="previewScreen" class="screen">
      <div class="button-group">
        <button id="backToTrim">Back</button>
        <button id="btnPreviewContinue">Continue to Save</button>
      </div>

      <div class="reader-container">
        <div class="reader-header">
          <div class="reader-title">Preview</div>
          <div class="reader-progress">
            <div class="reader-progress-bar">
              <div class="reader-progress-fill" id="previewProgressFill"></div>
            </div>
            <div class="reader-progress-text" id="previewProgressText">0%</div>
          </div>
        </div>
        <div class="reader-content" id="previewContent"></div>
      </div>
    </div>

    <div id="saveScreen" class="screen">
      <h1>Save Guide</h1>

      <div class="selection-helper">
        <h2>Name Your Guide</h2>

        <label>Guide Name:</label>
        <input type="text" id="guideName" placeholder="e.g., Ratchet & Clank - Walkthrough">
        <p class="help-text">Stored locally on this device.</p>

        <div class="button-group">
          <button id="btnFinalSave">Save Guide</button>
          <button class="secondary" id="backToTrim2">Back</button>
        </div>
      </div>
    </div>

    <div id="savedScreen" class="screen">
      <h1>My Saved Guides</h1>

      <div class="button-group">
        <button id="backToMain2">Back</button>
        <button class="secondary" id="btnSelectDelete">Select + Delete</button>
        <button class="danger" id="btnDeleteSelected" style="display:none;">Delete Selected (0)</button>
        <button class="secondary" id="btnCancelSelect" style="display:none;">Cancel</button>
      </div>

      <div id="savedGuidesList" class="guide-grid"></div>
    </div>

    <div id="readerScreen" class="screen">
      <div class="button-group" id="readerButtonGroup">
        <button id="backToGuides">Back</button>
        <button class="secondary btn-fixed-width" id="btnFullscreen">Fullscreen</button>
        <button class="secondary btn-fixed-width" id="btnTheme">Theme</button>
        <button class="secondary" id="btnWordColors">Colors</button>
        <button class="danger" id="btnDelete">Delete</button>
      </div>

      <div class="reader-container" id="readerContainer">
        <div class="reader-header">
          <div class="reader-title" id="readerTitle"></div>
          <div class="reader-progress">
            <div class="reader-progress-bar">
              <div class="reader-progress-fill" id="readerProgressFill"></div>
            </div>
            <div class="reader-progress-text" id="readerProgressText">0%</div>
          </div>
        </div>
        <div class="reader-content" id="readerContent"></div>
      </div>

      <button id="fullscreenExitBtn" class="fullscreen-exit-btn" style="display:none;">Exit Fullscreen</button>
    </div>

    <div id="toast" class="toast">
      <span class="toast-title" id="toastTitle">Saved</span>
      <span id="toastMessage"></span>
      <button class="toast-close" id="toastClose">x</button>
    </div>

    <div id="modal" class="modal" style="display:none">
      <div class="modal-card">
        <div class="modal-title" id="modalTitle">Confirm</div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-actions">
          <button class="secondary" id="modalCancel">Cancel</button>
          <button id="modalOk">OK</button>
        </div>
      </div>
    </div>

    <div id="wordColorsModal" class="modal" style="display:none">
      <div class="modal-card">
        <div class="modal-title">Word Highlighting</div>
        <div class="modal-body">
          <p class="help-text">Assign colors to specific words. All instances will be highlighted.</p>

          <div class="word-highlight-form">
            <div class="form-row">
              <div style="flex: 1;">
                <label>Word:</label>
                <input type="text" id="wordInput" placeholder="Enter word...">
              </div>
              <div>
                <label>Color:</label>
                <input type="color" id="colorInput" value="#ffff00">
              </div>
            </div>
            <button id="btnAddWordColor">Add Highlight</button>
          </div>

          <div class="word-colors-list" id="wordColorsList"></div>
        </div>
        <div class="modal-actions">
          <button class="secondary" id="wordColorsClose">Close</button>
        </div>
      </div>
    </div>

    <div id="supportModal" class="modal" style="display:none">
      <div class="modal-card modal-compact">
        <button class="modal-x" id="supportClose">x</button>
        <div class="modal-title" id="supportTitle">Support</div>
        <div class="modal-body" id="supportBody">
          Made by EERIE<br>
          <a href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">
            Buy Me a Coffee
          </a>
        </div>
      </div>
    </div>

  </div>
`;

document.getElementById('platformLabel').textContent = bridge.platform || 'unknown';

/* Support modal */
let supportKeyHandler = null;
function showSupportModal() {
  const modal = document.getElementById('supportModal');
  const btn = document.getElementById('supportClose');
  modal.style.display = 'flex';
  modal.classList.add('show');
  const close = () => hideSupportModal();
  const onBackdrop = (e) => { if (e.target === modal) close(); };
  supportKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  btn.addEventListener('click', close, { once: true });
  modal.addEventListener('click', onBackdrop, { once: true });
  document.addEventListener('keydown', supportKeyHandler, true);
  setTimeout(() => btn.focus(), 0);
}

function hideSupportModal() {
  const modal = document.getElementById('supportModal');
  modal.classList.remove('show');
  modal.style.display = 'none';
  if (supportKeyHandler) {
    document.removeEventListener('keydown', supportKeyHandler, true);
    supportKeyHandler = null;
  }
}

/* Toast */
let toastTimer = null;
function showToast(title, message, ms = 2200) {
  const toast = document.getElementById('toast');
  document.getElementById('toastTitle').textContent = title || '';
  document.getElementById('toastMessage').textContent = message || '';
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

document.getElementById('toastClose').addEventListener('click', () => {
  const toast = document.getElementById('toast');
  toast.classList.remove('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
});

/* Modal */
let modalResolve = null;

function themedConfirm({ title = 'Confirm', message = '', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const btnOk = document.getElementById('modalOk');
  const btnCancel = document.getElementById('modalCancel');

  titleEl.textContent = title;
  bodyEl.textContent = message;
  btnOk.textContent = okText;
  btnCancel.textContent = cancelText;
  btnOk.classList.toggle('danger', !!danger);
  modal.style.display = 'flex';
  modal.classList.add('show');

  if (modalResolve) { try { modalResolve(false); } catch {} }
  modalResolve = null;

  return new Promise((resolve) => {
    modalResolve = resolve;

    const done = (result) => {
      modal.classList.remove('show');
      modal.style.display = 'none';
      titleEl.textContent = '';
      bodyEl.textContent = '';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      btnOk.classList.remove('danger');
      const r = modalResolve;
      modalResolve = null;
      if (r) r(result);
    };

    const onOk = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); done(true); };
    const onCancel = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); done(false); };
    const onBackdrop = (e) => { if (e.target === modal) done(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => btnOk.focus(), 0);
  });
}

/* Screen management */
async function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  resetViewport();

  if (screenId === 'savedScreen') {
    await loadSavedGuides();
    updateSelectDeleteUI();
  }
  if (screenId === 'previewScreen') setPreviewProgressUI(0);
  if (screenId === 'ioScreen') await refreshExportMetaOnly();
}

function showUrlLoader() {
  document.getElementById('urlLoader').style.display = 'block';
  document.getElementById('textPaster').style.display = 'none';
}

function showTextPaster() {
  document.getElementById('textPaster').style.display = 'block';
  document.getElementById('urlLoader').style.display = 'none';
}

/* Select + Delete */
function setSelectMode(on) {
  selectMode = on;
  selectedGuideIds.clear();
  updateSelectDeleteUI();
  loadSavedGuides();
}

function updateSelectDeleteUI() {
  const btnDel = document.getElementById('btnDeleteSelected');
  const btnCancel = document.getElementById('btnCancelSelect');
  if (selectMode) {
    btnDel.style.display = 'inline-block';
    btnCancel.style.display = 'inline-block';
    updateDeleteSelectedLabel();
  } else {
    btnDel.style.display = 'none';
    btnCancel.style.display = 'none';
  }
}

function updateDeleteSelectedLabel() {
  const btn = document.getElementById('btnDeleteSelected');
  btn.textContent = `Delete Selected (${selectedGuideIds.size})`;
}

function toggleGuideSelection(id) {
  if (selectedGuideIds.has(id)) selectedGuideIds.delete(id);
  else selectedGuideIds.add(id);
  updateDeleteSelectedLabel();
  const card = document.querySelector(`.guide-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('selected', selectedGuideIds.has(id));
    const cb = card.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selectedGuideIds.has(id);
  }
}

async function deleteSelectedGuides() {
  const count = selectedGuideIds.size;
  if (!count) return;
  const ok = await themedConfirm({
    title: 'Delete selected guides',
    message: `Delete ${count} guide${count === 1 ? '' : 's'}?\nCannot be undone.`,
    okText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return;
  const guides = await bridge.readGuides();
  const remaining = guides.filter(g => !selectedGuideIds.has(Number(g.id)));
  await bridge.writeGuides(remaining);
  showToast('Deleted', `Deleted ${count} guide${count === 1 ? '' : 's'}`);
  await updateGuideCount();
  selectedGuideIds.clear();
  await loadSavedGuides();
  updateSelectDeleteUI();
}

/* Import / Export: Backup file (primary) */
function setTab(which) {
  const exportPane = document.getElementById('exportPane');
  const importPane = document.getElementById('importPane');
  const tabExport = document.getElementById('tabExport');
  const tabImport = document.getElementById('tabImport');

  if (which === 'export') {
    exportPane.style.display = 'block';
    importPane.style.display = 'none';
    tabExport.disabled = true;
    tabImport.disabled = false;
  } else {
    exportPane.style.display = 'none';
    importPane.style.display = 'block';
    tabExport.disabled = false;
    tabImport.disabled = true;
  }
  resetViewport();
}

async function refreshExportMetaOnly() {
  const guides = await bridge.readGuides();
  document.getElementById('exportCount').textContent = String(guides.length);
  document.getElementById('backupMeta').textContent = lastBackup
    ? `${lastBackup.createdAt} (${Math.round(lastBackup.bytes / 1024)} KB)${lastBackup.encrypted ? ' (encrypted)' : ''}`
    : 'None';
}

function setImportStatus(html) {
  document.getElementById('importStatus').innerHTML = html || '';
}

function showImportActions(show) {
  document.getElementById('importActions').style.display = show ? 'block' : 'none';
}

async function createBackupFile() {
  const guides = await bridge.readGuides();
  const pass = (document.getElementById('backupPassExport')?.value || '').trim();

  if (!pass) {
    const ok = await themedConfirm({
      title: 'No password set',
      message: 'This backup will NOT be encrypted. Anyone with the file can read it.\nContinue?',
      okText: 'Continue',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
  }

  const { text, encrypted } = await encodeGuidesBackupToString(guides, pass);
  const bytes = new TextEncoder().encode(text).length;

  if (lastBackup?.path) {
    try { await Filesystem.deleteFile({ path: lastBackup.path, directory: Directory.Cache }); } catch {}
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `ggm-backup-${stamp}.ggm`;

  // IMPORTANT: encoding must be UTF8, otherwise Capacitor assumes base64
  await Filesystem.writeFile({
    path: filename,
    directory: Directory.Cache,
    data: text,
    encoding: Encoding.UTF8
  });

  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

  lastBackup = {
    path: filename,
    uri,
    createdAt: new Date().toLocaleString(),
    bytes,
    encrypted
  };

  document.getElementById('btnShareBackup').disabled = false;
  await refreshExportMetaOnly();
  showToast('Backup ready', encrypted ? 'Encrypted backup created' : 'Backup created (not encrypted)');
}

async function shareBackupFile() {
  if (!lastBackup) {
    await createBackupFile();
    if (!lastBackup) return;
  }
  try {
    await Share.share({
      title: 'Game Guide Manager Backup',
      url: lastBackup.uri,
      dialogTitle: 'Share backup'
    });
    showToast('Shared', 'Backup shared');
  } catch {
    // ignore cancel
  }
}

function clearImportUI() {
  const codeEl = document.getElementById('importCode');
  if (codeEl) codeEl.value = '';
  const passEl = document.getElementById('backupPassImport');
  if (passEl) passEl.value = '';
  const fileInput = document.getElementById('backupFileInput');
  if (fileInput) fileInput.value = '';
  setImportStatus('');
  showImportActions(false);
  pendingImport = null;
  resetViewport();
}

async function handleBackupFileChosen(file) {
  pendingImport = null;
  showImportActions(false);
  setImportStatus('');

  const pass = (document.getElementById('backupPassImport')?.value || '').trim();

  let text;
  try { text = await file.text(); }
  catch {
    setImportStatus('<div class="error"><strong>Could not read file</strong></div>');
    return;
  }

  try {
    const data = await decodeGuidesBackupFromString(text, pass);
    pendingImport = { data, guideCount: data.guides.length };

    setImportStatus(`
      <div class="success">
        <strong>Valid backup!</strong><br>
        Exported: ${escapeHtml(String(data.exportedAt || ''))}<br>
        Guides: ${data.guides.length}
      </div>
    `);

    document.getElementById('importGuideCount').textContent = String(data.guides.length);
    showImportActions(true);
  } catch (e) {
    setImportStatus(`<div class="error"><strong>Import failed</strong><br>${escapeHtml(String(e?.message || e))}</div>`);
  }

  resetViewport();
}

/* Legacy: compressed codes (small exports only) */
function uint8ToB64(u8) {
  // Chunk to avoid call stack / arg limits
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function generateExportCode() {
  const guides = await bridge.readGuides();
  const data = { v: 1, app: 'ggm', exportedAt: new Date().toISOString(), guides };
  const json = JSON.stringify(data);

  const compressed = pako.deflate(json, { level: 9 });
  const base64 = uint8ToB64(compressed);
  const code = `GGM2:${base64}`;

  document.getElementById('exportCode').value = code;
  document.getElementById('btnCopyExport').disabled = false;
  document.getElementById('btnShareExport').disabled = false;

  showToast('Generated', `Code for ${guides.length} guide${guides.length === 1 ? '' : 's'}`);
  resetViewport();
}

async function copyExportCode() {
  const ta = document.getElementById('exportCode');
  const value = ta.value || '';
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    showToast('Copied', 'Export code copied');
  } catch {
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied', 'Export code copied');
    } catch {
      showToast('Copy', 'Select all and copy manually');
    }
  }
}

async function shareExportCode() {
  const code = document.getElementById('exportCode').value || '';
  if (!code) return;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Game Guide Export', text: code });
      showToast('Shared', 'Export code shared');
    } catch (e) {
      if (e?.name !== 'AbortError') copyExportCode();
    }
  } else {
    copyExportCode();
  }
}

async function validateImportCode() {
  let raw = (document.getElementById('importCode').value || '').trim();
  pendingImport = null;
  showImportActions(false);
  setImportStatus('');

  if (!raw) {
    setImportStatus('<div class="error"><strong>Paste code first</strong></div>');
    return;
  }

  raw = raw.replace(/\s+/g, '');
  if (!raw.startsWith('GGM2:')) {
    setImportStatus('<div class="error"><strong>Invalid format</strong><br>Expected: GGM2:...</div>');
    return;
  }

  const base64 = raw.substring(5);

  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const decompressed = pako.inflate(bytes, { to: 'string' });
    const data = JSON.parse(decompressed);

    if (!data || data.v !== 1 || data.app !== 'ggm' || !Array.isArray(data.guides)) {
      setImportStatus('<div class="error"><strong>Invalid data</strong></div>');
      return;
    }

    pendingImport = { data, guideCount: data.guides.length };

    setImportStatus(`
      <div class="success">
        <strong>Valid code!</strong><br>
        Exported: ${escapeHtml(String(data.exportedAt || ''))}<br>
        Guides: ${data.guides.length}
      </div>
    `);

    document.getElementById('importGuideCount').textContent = String(data.guides.length);
    showImportActions(true);
  } catch (e) {
    setImportStatus(`<div class="error"><strong>Failed to parse</strong><br>${escapeHtml(String(e?.message || e))}</div>`);
  }

  resetViewport();
}

function makeUniqueId(existing) {
  let id = Date.now();
  while (existing.has(id)) id += 1;
  existing.add(id);
  return id;
}

async function importReplaceAll() {
  if (!pendingImport) return;
  const imported = pendingImport.data.guides.map(g => ({
    id: Number(g.id) || Date.now(),
    name: String(g.name || 'Untitled'),
    content: String(g.content || ''),
    progress: Number(g.progress) || 0,
    dateAdded: String(g.dateAdded || new Date().toISOString()),
    wordColors: g.wordColors || {}
  }));
  await bridge.writeGuides(imported);
  showToast('Imported', `Imported ${imported.length} guides`);
  await updateGuideCount();
  pendingImport = null;
  showImportActions(false);
  setImportStatus('');
  await showScreen('mainScreen');
}

async function importMergeKeepCurrent() {
  if (!pendingImport) return;
  const current = await bridge.readGuides();
  const existingIds = new Set(current.map(g => Number(g.id)));
  const imported = pendingImport.data.guides.map(g => {
    const obj = {
      id: Number(g.id) || 0,
      name: String(g.name || 'Untitled'),
      content: String(g.content || ''),
      progress: Number(g.progress) || 0,
      dateAdded: String(g.dateAdded || new Date().toISOString()),
      wordColors: g.wordColors || {}
    };
    if (!obj.id || existingIds.has(obj.id)) obj.id = makeUniqueId(existingIds);
    else existingIds.add(obj.id);
    return obj;
  });
  const merged = current.concat(imported);
  await bridge.writeGuides(merged);
  showToast('Imported', `Imported ${imported.length} guides (merged)`);
  await updateGuideCount();
  pendingImport = null;
  showImportActions(false);
  setImportStatus('');
  await showScreen('mainScreen');
}

/* Find */
function isFindOpen() {
  return document.getElementById('findBar').classList.contains('show');
}

function openFind() {
  const bar = document.getElementById('findBar');
  bar.classList.add('show');
  const edit = document.getElementById('editContent');
  const q = document.getElementById('findQuery');
  const sel = edit.value.substring(edit.selectionStart || 0, edit.selectionEnd || 0).trim();
  if (sel && !q.value) q.value = sel;
  computeFindMatches();
  if (findMatches.length) findIndex = 0;
  updateFindMeta();
  scrollToCurrentMatch();
  q.focus();
  q.select();
}

function closeFind() {
  const bar = document.getElementById('findBar');
  bar.classList.remove('show');
  findMatches = [];
  findIndex = -1;
  updateFindMeta();
}

function computeFindMatches() {
  const query = (document.getElementById('findQuery').value || '').trim();
  const text = document.getElementById('editContent').value || '';
  findMatches = [];
  if (!query) {
    findIndex = -1;
    updateFindMeta();
    return;
  }
  const hay = text.toLowerCase();
  const nee = query.toLowerCase();
  let pos = 0;
  while (true) {
    const idx = hay.indexOf(nee, pos);
    if (idx === -1) break;
    findMatches.push({ start: idx, end: idx + query.length });
    pos = idx + Math.max(1, query.length);
  }
  if (findIndex >= findMatches.length) findIndex = findMatches.length - 1;
  if (findIndex < 0 && findMatches.length) findIndex = 0;
  updateFindMeta();
}

function updateFindMeta() {
  const meta = document.getElementById('findMeta');
  const total = findMatches.length;
  const current = total && findIndex >= 0 ? (findIndex + 1) : 0;
  meta.textContent = `${current}/${total}`;
}

function scrollToMatch(match) {
  if (!match) return;
  const edit = document.getElementById('editContent');
  try {
    const before = edit.value.slice(0, match.start);
    const lineNo = (before.match(/\n/g) || []).length;
    const lh = parseFloat(getComputedStyle(edit).lineHeight) || 24;
    edit.scrollTop = Math.max(0, (lineNo - 2) * lh);
  } catch {}
}

function scrollToCurrentMatch() {
  if (findIndex < 0 || findIndex >= findMatches.length) return;
  scrollToMatch(findMatches[findIndex]);
}

function findNext() {
  computeFindMatches();
  if (!findMatches.length) return;
  findIndex = (findIndex + 1) % findMatches.length;
  updateFindMeta();
  scrollToCurrentMatch();
  document.getElementById('findQuery').focus();
}

function findPrev() {
  computeFindMatches();
  if (!findMatches.length) return;
  findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
  updateFindMeta();
  scrollToCurrentMatch();
  document.getElementById('findQuery').focus();
}

/* Trim / Preview / Save */
function proceedToTrim() {
  if (!loadedContent) return alert('No content loaded.');
  originalLines = loadedContent.split('\n');
  document.getElementById('totalLines').textContent = String(originalLines.length);
  const edit = document.getElementById('editContent');
  edit.value = loadedContent;
  closeFind();
  updateTrimInfo();
  showScreen('extractScreen');
  setTimeout(() => {
    edit.focus();
    edit.setSelectionRange(0, 0);
  }, 50);
}

function resetTrim() {
  if (!loadedContent) return;
  const edit = document.getElementById('editContent');
  edit.value = loadedContent;
  if (isFindOpen()) {
    computeFindMatches();
    scrollToCurrentMatch();
  }
  updateTrimInfo();
}

function updateTrimInfo() {
  const text = document.getElementById('editContent').value || '';
  const lines = text.split('\n');
  document.getElementById('currentLines').textContent = String(lines.length);
  const first = lines.find(l => l.trim().length > 0) ?? '';
  const last = findLast(lines, l => l.trim().length > 0) ?? '';
  let start = 1;
  let end = originalLines.length || 1;
  if (first && originalLines.length) {
    const idx = originalLines.findIndex(l => l === first);
    if (idx >= 0) start = idx + 1;
  }
  if (last && originalLines.length) {
    const idx = findLastIndex(originalLines, l => l === last);
    if (idx >= 0) end = idx + 1;
  }
  start = clamp(start, 1, originalLines.length || 1);
  end = clamp(end, 1, originalLines.length || 1);
  document.getElementById('startLineLabel').textContent = String(start);
  document.getElementById('endLineLabel').textContent = String(end);
}

function openPreview() {
  const text = document.getElementById('editContent').value || '';
  const content = text.trim();
  if (!content) return alert('Nothing to preview.');
  const preview = document.getElementById('previewContent');
  preview.textContent = content;
  showScreen('previewScreen');
  setTimeout(() => {
    preview.scrollTop = 0;
    setPreviewProgressUI(0);
  }, 50);
}

function updatePreviewProgress() {
  const c = document.getElementById('previewContent');
  const maxScroll = c.scrollHeight - c.clientHeight;
  const progress = maxScroll > 0 ? Math.round((c.scrollTop / maxScroll) * 100) : 100;
  setPreviewProgressUI(progress);
}

function setPreviewProgressUI(progress) {
  document.getElementById('previewProgressFill').style.width = progress + '%';
  document.getElementById('previewProgressText').textContent = progress + '%';
}

/* Load sources */
function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    loadedContent = e.target.result || '';
    proceedToTrim();
  };
  reader.readAsText(file);
}

function loadFromPaste() {
  const text = document.getElementById('pasteArea').value.trim();
  if (!text) return alert('Please paste some text first.');
  loadedContent = text;
  document.getElementById('pasteArea').value = '';
  proceedToTrim();
}

async function loadFromUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return alert('Please enter a URL.');
  const errorDiv = document.getElementById('loadError');
  const loadingDiv = document.getElementById('loadingIndicator');
  errorDiv.innerHTML = '';
  loadingDiv.style.display = 'block';

  try {
    const target = normalizeGuideUrl(url);
    let content;
    try {
      content = await bridge.fetchUrl(target);
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (
        typeof bridge.fetchUrlBrowser === 'function' &&
        (msg.includes('HTTP 403') || msg.includes('Blocked by bot protection'))
      ) {
        content = await bridge.fetchUrlBrowser(target);
      } else {
        throw e;
      }
    }

    if (/<html[\s>]/i.test(content) || /<pre[\s>]/i.test(content)) {
      content = extractTextFromHtml(content);
    }
    loadedContent = (content || '').trim();
    if (!loadedContent) throw new Error('Loaded content was empty.');
    loadingDiv.style.display = 'none';
    errorDiv.innerHTML = '<div class="success">Loaded!</div>';
    resetViewport();
    setTimeout(() => (errorDiv.innerHTML = ''), 2500);
    proceedToTrim();
  } catch (err) {
    loadingDiv.style.display = 'none';
    const msg = escapeHtml(String(err?.message || err || 'Unknown error'));
    errorDiv.innerHTML = `
      <div class="error">
        <strong>Unable to load URL</strong><br><br>
        ${msg}<br><br>
        <p><strong>Try:</strong></p>
        <ol style="text-align:left; margin:10px 20px; line-height:1.8;">
          <li><strong>Paste Text</strong></li>
          <li><strong>Load from File</strong></li>
        </ol>
      </div>
    `;
  }
}

/* Save + list + reader */
async function finalSaveGuide() {
  const name = document.getElementById('guideName').value.trim();
  if (!name) return alert('Please enter a guide name.');
  const content = (document.getElementById('editContent').value || '').trim();
  if (!content) return alert('Content is empty.');
  const guides = await bridge.readGuides();
  guides.push({
    id: Date.now(),
    name,
    content,
    progress: 0,
    dateAdded: new Date().toISOString(),
    wordColors: {}
  });
  await bridge.writeGuides(guides);

  loadedContent = '';
  originalLines = [];
  currentGuideId = null;
  document.getElementById('guideName').value = '';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlLoader').style.display = 'none';
  document.getElementById('textPaster').style.display = 'none';
  document.getElementById('editContent').value = '';

  showToast('Saved', 'Guide saved');
  await updateGuideCount();
  await showScreen('mainScreen');
}

async function loadSavedGuides() {
  const guides = await bridge.readGuides();
  const container = document.getElementById('savedGuidesList');

  if (!guides.length) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:50px; color:#8b929a;">
        <h3 style="color:#66c0f4; margin-bottom:10px;">No saved guides yet</h3>
        <p>Load a guide to get started.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = guides.map(g => {
    const isSelected = selectedGuideIds.has(Number(g.id));
    const cls = `guide-card ${selectMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`;
    return `
      <div class="${cls}" data-id="${g.id}">
        ${selectMode ? `
          <div class="guide-select">
            <input type="checkbox" ${isSelected ? 'checked' : ''}>
          </div>
        ` : ''}
        <h3>${escapeHtml(g.name)}</h3>
        <div class="progress-info">Progress: ${g.progress}%</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width:${g.progress}%"></div>
        </div>
        <small style="color:#8b929a;">Added: ${new Date(g.dateAdded).toLocaleDateString()}</small>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.guide-card').forEach(card => {
    const id = Number(card.dataset.id);
    const cb = card.querySelector('input[type="checkbox"]');
    if (cb) {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGuideSelection(id);
      });
    }
    card.addEventListener('click', () => {
      if (selectMode) toggleGuideSelection(id);
      else openGuide(id);
    });
  });

  updateSelectDeleteUI();
}

async function openGuide(id) {
  currentGuideId = id;
  const guides = await bridge.readGuides();
  const guide = guides.find(g => g.id === id);
  if (!guide) return;

  wordColors = guide.wordColors || {};
  document.getElementById('readerTitle').textContent = guide.name;
  applyWordHighlights(guide.content);
  setProgressUI(guide.progress);

  await showScreen('readerScreen');

  setTimeout(() => {
    const c = document.getElementById('readerContent');
    const maxScroll = c.scrollHeight - c.clientHeight;
    const scrollPos = (guide.progress / 100) * Math.max(0, maxScroll);
    c.scrollTop = scrollPos;
  }, 50);
}

function applyWordHighlights(content) {
  const readerContent = document.getElementById('readerContent');
  if (!Object.keys(wordColors).length) {
    readerContent.textContent = content;
    return;
  }
  let html = escapeHtml(content);
  const sortedWords = Object.keys(wordColors).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    const color = wordColors[word];
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
    html = html.replace(
      regex,
      `<span style="background-color: ${color}; padding: 2px 4px; border-radius: 3px;">$&</span>`
    );
  }
  readerContent.innerHTML = html;
}

async function updateReadingProgress() {
  if (currentGuideId == null) return;
  const c = document.getElementById('readerContent');
  const maxScroll = c.scrollHeight - c.clientHeight;
  const progress = maxScroll > 0 ? Math.round((c.scrollTop / maxScroll) * 100) : 100;
  setProgressUI(progress);
  const guides = await bridge.readGuides();
  const guide = guides.find(g => g.id === currentGuideId);
  if (guide) {
    guide.progress = progress;
    await bridge.writeGuides(guides);
  }
}

function setProgressUI(progress) {
  document.getElementById('readerProgressFill').style.width = progress + '%';
  document.getElementById('readerProgressText').textContent = progress + '%';
}

function closeReader() {
  currentGuideId = null;
  wordColors = {};
  if (isFullscreen) exitFullscreen();
  showScreen('savedScreen');
}

async function deleteCurrentGuide() {
  if (!currentGuideId) return;
  const ok = await themedConfirm({
    title: 'Delete guide',
    message: 'Delete this guide?\nCannot be undone.',
    okText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return;
  const guides = await bridge.readGuides();
  const next = guides.filter(g => g.id !== currentGuideId);
  await bridge.writeGuides(next);
  currentGuideId = null;
  wordColors = {};
  await updateGuideCount();
  if (isFullscreen) exitFullscreen();
  await showScreen('savedScreen');
}

async function updateGuideCount() {
  const guides = await bridge.readGuides();
  const count = guides.length;
  document.getElementById('guideCount').textContent = `${count} guide${count === 1 ? '' : 's'}`;
}

/* Fullscreen */
function toggleFullscreen() {
  if (isFullscreen) exitFullscreen();
  else enterFullscreen();
}

function enterFullscreen() {
  isFullscreen = true;
  document.body.classList.add('fullscreen');

  const exitBtn = document.getElementById('fullscreenExitBtn');
  exitBtn.style.display = 'block';

  const btn = document.getElementById('btnFullscreen');
  btn.textContent = 'Exit';

  const buttonGroup = document.getElementById('readerButtonGroup');
  Array.from(buttonGroup.children).forEach(button => {
    if (button.id !== 'btnFullscreen' && button.id !== 'btnTheme' && button.id !== 'btnWordColors') {
      button.style.display = 'none';
    }
  });
}

function exitFullscreen() {
  isFullscreen = false;
  document.body.classList.remove('fullscreen');

  const exitBtn = document.getElementById('fullscreenExitBtn');
  exitBtn.style.display = 'none';

  const btn = document.getElementById('btnFullscreen');
  btn.textContent = 'Fullscreen';

  const buttonGroup = document.getElementById('readerButtonGroup');
  Array.from(buttonGroup.children).forEach(button => { button.style.display = ''; });
}

/* Theme */
function cycleTheme() {
  const themes = ['dark', 'light', 'contrast'];
  const currentIndex = themes.indexOf(readerTheme);
  const nextIndex = (currentIndex + 1) % themes.length;
  readerTheme = themes[nextIndex];

  const container = document.getElementById('readerContainer');
  container.className = 'reader-container';

  const btn = document.getElementById('btnTheme');
  if (readerTheme === 'light') {
    container.classList.add('theme-light');
    btn.textContent = 'Light';
  } else if (readerTheme === 'contrast') {
    container.classList.add('theme-contrast');
    btn.textContent = 'Contrast';
  } else {
    btn.textContent = 'Dark';
  }
}

/* Word colors */
function showWordColorsModal() {
  const modal = document.getElementById('wordColorsModal');
  modal.style.display = 'flex';
  modal.classList.add('show');
  refreshWordColorsList();
  document.getElementById('wordInput').focus();
}

function hideWordColorsModal() {
  const modal = document.getElementById('wordColorsModal');
  modal.classList.remove('show');
  setTimeout(() => { modal.style.display = 'none'; }, 200);
}

function refreshWordColorsList() {
  const list = document.getElementById('wordColorsList');
  if (!Object.keys(wordColors).length) {
    list.innerHTML = '<p class="help-text">No highlights yet.</p>';
    return;
  }
  list.innerHTML = Object.entries(wordColors).map(([word, color]) => `
    <div class="word-color-item">
      <div class="word-color-sample" style="background-color: ${color};"></div>
      <div class="word-color-text">${escapeHtml(word)}</div>
      <button class="danger word-color-remove" data-word="${escapeHtml(word)}">Remove</button>
    </div>
  `).join('');
  list.querySelectorAll('.word-color-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = btn.dataset.word;
      delete wordColors[word];
      saveWordColors();
      refreshWordColorsList();
      reapplyContent();
    });
  });
}

async function addWordColor() {
  const word = document.getElementById('wordInput').value.trim();
  const color = document.getElementById('colorInput').value;
  if (!word) {
    showToast('Error', 'Enter a word');
    return;
  }
  wordColors[word] = color;
  await saveWordColors();
  document.getElementById('wordInput').value = '';
  document.getElementById('colorInput').value = '#ffff00';
  refreshWordColorsList();
  reapplyContent();
  showToast('Added', `Highlight added for "${word}"`);
}

async function saveWordColors() {
  if (!currentGuideId) return;
  const guides = await bridge.readGuides();
  const guide = guides.find(g => g.id === currentGuideId);
  if (guide) {
    guide.wordColors = wordColors;
    await bridge.writeGuides(guides);
  }
}

function reapplyContent() {
  if (!currentGuideId) return;
  bridge.readGuides().then(guides => {
    const guide = guides.find(g => g.id === currentGuideId);
    if (guide) applyWordHighlights(guide.content);
  });
}

/* Utilities */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function findLast(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return arr[i];
  }
  return undefined;
}
function findLastIndex(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* Wire up events */
document.getElementById('btnLoadNew').addEventListener('click', () => showScreen('loadScreen'));
document.getElementById('btnSaved').addEventListener('click', () => showScreen('savedScreen'));
document.getElementById('btnIO').addEventListener('click', () => showScreen('ioScreen'));

document.getElementById('backToMain').addEventListener('click', () => showScreen('mainScreen'));
document.getElementById('backToMain2').addEventListener('click', () => {
  if (selectMode) setSelectMode(false);
  showScreen('mainScreen');
});
document.getElementById('backToMainIO').addEventListener('click', () => showScreen('mainScreen'));
document.getElementById('backToLoad').addEventListener('click', () => showScreen('loadScreen'));
document.getElementById('backToGuides').addEventListener('click', closeReader);

document.getElementById('btnSelectDelete').addEventListener('click', () => setSelectMode(true));
document.getElementById('btnCancelSelect').addEventListener('click', () => setSelectMode(false));
document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedGuides);

document.getElementById('btnLoadFile').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', handleFileLoad);

document.getElementById('btnPaste').addEventListener('click', showTextPaster);
document.getElementById('btnUrl').addEventListener('click', showUrlLoader);

document.getElementById('btnPasteContinue').addEventListener('click', loadFromPaste);
document.getElementById('btnUrlLoad').addEventListener('click', loadFromUrl);

document.getElementById('btnResetTrim').addEventListener('click', resetTrim);
document.getElementById('btnFind').addEventListener('click', openFind);

document.getElementById('btnPreview').addEventListener('click', openPreview);
document.getElementById('btnGoSave').addEventListener('click', () => showScreen('saveScreen'));

document.getElementById('backToTrim').addEventListener('click', () => showScreen('extractScreen'));
document.getElementById('btnPreviewContinue').addEventListener('click', () => showScreen('saveScreen'));
document.getElementById('backToTrim2').addEventListener('click', () => showScreen('extractScreen'));

document.getElementById('btnFinalSave').addEventListener('click', finalSaveGuide);
document.getElementById('btnDelete').addEventListener('click', deleteCurrentGuide);

// Reader controls
document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('fullscreenExitBtn').addEventListener('click', exitFullscreen);
document.getElementById('btnTheme').addEventListener('click', cycleTheme);
document.getElementById('btnWordColors').addEventListener('click', showWordColorsModal);

// Word colors
document.getElementById('wordColorsClose').addEventListener('click', hideWordColorsModal);
document.getElementById('btnAddWordColor').addEventListener('click', addWordColor);
document.getElementById('wordInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addWordColor();
  }
});

document.getElementById('previewContent').addEventListener('scroll', updatePreviewProgress);
document.getElementById('readerContent').addEventListener('scroll', updateReadingProgress);

document.getElementById('editContent').addEventListener('input', () => {
  updateTrimInfo();
  if (isFindOpen()) {
    computeFindMatches();
    scrollToCurrentMatch();
  }
});

document.getElementById('findClose').addEventListener('click', closeFind);
document.getElementById('findNext').addEventListener('click', findNext);
document.getElementById('findPrev').addEventListener('click', findPrev);

document.getElementById('findQuery').addEventListener('input', () => {
  computeFindMatches();
  if (findMatches.length) findIndex = 0;
  updateFindMeta();
  scrollToCurrentMatch();
  document.getElementById('findQuery').focus();
});

document.getElementById('findQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) findPrev();
    else findNext();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeFind();
  }
});

document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod && (e.key === 'f' || e.key === 'F')) {
    if (document.getElementById('extractScreen').classList.contains('active')) {
      e.preventDefault();
      openFind();
    }
  } else if (e.key === 'F3') {
    if (isFindOpen()) {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    }
  } else if (e.key === 'Escape' && isFullscreen) {
    e.preventDefault();
    exitFullscreen();
  }
}, true);

// Import/Export tabs
document.getElementById('tabExport').addEventListener('click', () => setTab('export'));
document.getElementById('tabImport').addEventListener('click', () => setTab('import'));

// Backup file
document.getElementById('btnCreateBackup').addEventListener('click', createBackupFile);
document.getElementById('btnShareBackup').addEventListener('click', shareBackupFile);
document.getElementById('btnPickBackup').addEventListener('click', () => {
  document.getElementById('backupFileInput').click();
});
document.getElementById('backupFileInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) await handleBackupFileChosen(file);
});

// Legacy code export/import
document.getElementById('btnGenerateExport').addEventListener('click', generateExportCode);
document.getElementById('btnCopyExport').addEventListener('click', copyExportCode);
document.getElementById('btnShareExport').addEventListener('click', shareExportCode);

document.getElementById('btnValidateImport').addEventListener('click', validateImportCode);
document.getElementById('btnClearImport').addEventListener('click', clearImportUI);

document.getElementById('btnImportReplace').addEventListener('click', importReplaceAll);
document.getElementById('btnImportMerge').addEventListener('click', importMergeKeepCurrent);

setTab('export');
updateGuideCount();

window.addEventListener('resize', resetViewport);
window.addEventListener('orientationchange', () => { setTimeout(resetViewport, 100); });

// show support modal on app open
setTimeout(() => showSupportModal(), 0);