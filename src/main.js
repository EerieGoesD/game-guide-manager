// C:\Users\eerie\Documents\GitHub\game-guide-manager\src\main.js
import './style.css';
import { getBridge } from './bridge.js';
import { normalizeGuideUrl, extractTextFromHtml } from './htmlToText.js';

import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

// Viewport fix: Ensure proper viewport after modal dismissals
function resetViewport() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
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

// Find state (Trim screen)
let findMatches = [];
let findIndex = -1;

// Import state
let pendingImport = null; // { data, hashHex, guideCount }

// Saved-guides selection mode
let selectMode = false;
let selectedGuideIds = new Set();

// Reader state
let isFullscreen = false;
let readerTheme = 'dark'; // 'dark', 'light', 'contrast'
let wordColors = {}; // { word: color }

const app = document.getElementById('app');

app.innerHTML = `
  <div class="container">

    <div id="mainScreen" class="screen active">
      <h1>🎮 Game Guide Manager</h1>

      <div class="main-menu">
        <div class="menu-button" id="btnLoadNew">
          <h3>📥 Load New Guide</h3>
          <p>From file, paste, or URL</p>
        </div>

        <div class="menu-button" id="btnSaved">
          <h3>📚 My Saved Guides</h3>
          <p id="guideCount">0 guides</p>
        </div>

        <div class="menu-button" id="btnIO">
          <h3>📦 Import / Export</h3>
          <p>Move guides between devices</p>
        </div>
      </div>

      <p class="help-text">
        Platform: <strong id="platformLabel"></strong>
      </p>

      <div class="footer">
        <a href="https://linktr.ee/eeriegoesd" target="_blank" rel="noreferrer">Made by EERIE</a>
        <a href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">Buy Me a Coffee ☕</a>
      </div>
    </div>

    <div id="ioScreen" class="screen">
      <h1>📦 Import / Export Saved Guides</h1>

      <div class="button-group">
        <button id="backToMainIO">← Back</button>
      </div>

      <div class="selection-helper">
        <div class="io-tabs">
          <button class="secondary" id="tabExport">Export</button>
          <button class="secondary" id="tabImport">Import</button>
        </div>

        <div id="exportPane" style="margin-top:16px;">
          <h2>Export</h2>
          <p class="help-text">
            Generates a code containing all your saved guides. Copy it to another device and import there.
          </p>

          <div class="button-group">
            <button id="btnGenerateExport">Generate Export Code</button>
            <button class="secondary" id="btnCopyExport" disabled>Copy</button>
          </div>

          <div class="selection-info">
            <strong>Guides:</strong> <span id="exportCount">0</span><br>
            <strong>SHA-256:</strong> <span id="exportHash">—</span>
          </div>

          <label>Export Code:</label>
          <textarea id="exportCode" class="codebox" readonly placeholder="Click 'Generate Export Code'"></textarea>
        </div>

        <div id="importPane" style="margin-top:16px; display:none;">
          <h2>Import</h2>
          <p class="help-text">
            Paste an export code here. Then choose whether to replace or merge with your current guides.
          </p>

          <label>Paste Export Code:</label>
          <textarea id="importCode" class="codebox" placeholder="Paste code here..."></textarea>

          <div class="button-group">
            <button id="btnValidateImport">Validate</button>
            <button class="secondary" id="btnClearImport">Clear</button>
          </div>

          <div id="importStatus"></div>

          <div id="importActions" style="display:none; margin-top:16px;">
            <div class="selection-info">
              <strong>Import contains:</strong> <span id="importGuideCount">0</span> guides<br>
              <strong>SHA-256:</strong> <span id="importHash">—</span>
            </div>

            <div class="button-group">
              <button class="danger" id="btnImportReplace">Delete all current saved guides and import</button>
              <button id="btnImportMerge">Keep current saved guides and import</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="loadScreen" class="screen">
      <h1>📥 Load New Guide</h1>

      <div class="button-group">
        <button id="backToMain">← Back</button>
      </div>

      <div class="selection-helper">
        <h2>Choose Source</h2>

        <div class="button-group">
          <button id="btnLoadFile">📄 Load from File</button>
          <button id="btnPaste">📋 Paste Text</button>
          <button id="btnUrl">🌐 Load from URL</button>
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
            On Android/iOS (Capacitor) and Desktop (Electron), this uses native networking (no browser CORS).
            Some sites still block automated access; use Paste Text if it fails.
          </p>
          <input type="text" id="urlInput" placeholder="https://gamefaqs.gamespot.com/...">
          <button id="btnUrlLoad">Load</button>
          <div id="loadError"></div>
        </div>

        <div id="loadingIndicator" class="loading" style="display:none">Loading guide...</div>
      </div>
    </div>

    <div id="extractScreen" class="screen">
      <h1>✂️ Trim Guide</h1>

      <div class="button-group">
        <button id="backToLoad">← Back</button>
        <button class="secondary" id="btnResetTrim">Reset to Full</button>
        <button class="secondary" id="btnFind">Find</button>
        <button id="btnPreview">Preview</button>
        <button id="btnGoSave">Continue to Save</button>
      </div>

      <div class="selection-helper">
        <h2>Edit the guide text</h2>
        <p class="help-text">
          Remove unwanted parts by deleting text directly (Backspace/Delete on keyboard or phone).
        </p>

        <div class="selection-info">
          <strong>Original Lines:</strong> <span id="totalLines">0</span><br>
          <strong>Current Lines:</strong> <span id="currentLines">0</span><br>
          <strong>Start Line (estimated):</strong> <span id="startLineLabel">1</span><br>
          <strong>End Line (estimated):</strong> <span id="endLineLabel">1</span>
        </div>

        <label>Trimmed Content (editable):</label>

        <div id="findBar" class="findbar" aria-label="Find in guide">
          <input type="text" id="findQuery" placeholder="Find text… (Enter = Next, Shift+Enter = Prev)" autocomplete="off" />
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
        <button id="backToTrim">← Back</button>
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
      <h1>💾 Save Guide</h1>

      <div class="selection-helper">
        <h2>Name Your Guide</h2>

        <label>Guide Name:</label>
        <input type="text" id="guideName" placeholder="e.g., Ratchet & Clank - Walkthrough">
        <p class="help-text">Stored locally on this device.</p>

        <div class="button-group">
          <button id="btnFinalSave">Save Guide</button>
          <button class="secondary" id="backToTrim2">← Back</button>
        </div>
      </div>
    </div>

    <div id="savedScreen" class="screen">
      <h1>📚 My Saved Guides</h1>

      <div class="button-group">
        <button id="backToMain2">← Back</button>
        <button class="secondary" id="btnSelectDelete">Select + Delete guides</button>
        <button class="danger" id="btnDeleteSelected" style="display:none;">Delete Selected (0)</button>
        <button class="secondary" id="btnCancelSelect" style="display:none;">Cancel</button>
      </div>

      <div id="savedGuidesList" class="guide-grid"></div>
    </div>

    <div id="readerScreen" class="screen">
      <div class="button-group">
        <button id="backToGuides">← Back to Guides</button>
        <button class="secondary" id="btnFullscreen">⛶ Fullscreen</button>
        <button class="secondary" id="btnTheme">🎨 Theme</button>
        <button class="secondary" id="btnWordColors">🖍️ Word Colors</button>
        <button class="danger" id="btnDelete">🗑️ Delete Guide</button>
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
    </div>

    <div id="toast" class="toast" role="status" aria-live="polite">
      <span class="toast-title" id="toastTitle">Saved</span>
      <span id="toastMessage"></span>
      <button class="toast-close" id="toastClose" aria-label="Close">×</button>
    </div>

    <!-- Themed modal confirm -->
    <div id="modal" class="modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-card">
        <div class="modal-title" id="modalTitle">Confirm</div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-actions">
          <button class="secondary" id="modalCancel">Cancel</button>
          <button id="modalOk">OK</button>
        </div>
      </div>
    </div>

    <!-- Word colors modal -->
    <div id="wordColorsModal" class="modal" style="display:none" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="modal-title">Word Highlighting</div>
        <div class="modal-body">
          <p class="help-text">Assign colors to specific words in your guide. All instances of the word will be highlighted.</p>
          
          <div class="word-highlight-form">
            <div class="form-row">
              <div style="flex: 1;">
                <label>Word to highlight:</label>
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

    <!-- Support modal (startup) -->
    <div id="supportModal" class="modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="supportTitle">
      <div class="modal-card modal-compact">
        <button class="modal-x" id="supportClose" aria-label="Close">×</button>
        <div class="modal-title" id="supportTitle">Support</div>
        <div class="modal-body" id="supportBody">
          Made by EERIE<br>
          <a href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">
            Buy&nbsp;Me&nbsp;a&nbsp;Coffee&nbsp;☕
          </a>
        </div>
      </div>
    </div>

  </div>
`;

document.getElementById('platformLabel').textContent = bridge.platform || 'unknown';

/* -----------------------------
   Support modal
--------------------------------*/
let supportKeyHandler = null;
function showSupportModal() {
  const modal = document.getElementById('supportModal');
  const btn = document.getElementById('supportClose');

  modal.style.display = 'flex';
  modal.classList.add('show');

  const close = () => hideSupportModal();

  const onBackdrop = (e) => {
    if (e.target === modal) close();
  };

  supportKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
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

/* -----------------------------
   Toast
--------------------------------*/
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

/* -----------------------------
   Themed Confirm Modal (replaces native confirm)
--------------------------------*/
let modalResolve = null;

function themedConfirm({
  title = 'Confirm',
  message = '',
  okText = 'OK',
  cancelText = 'Cancel',
  danger = false
} = {}) {
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

  if (modalResolve) {
    try { modalResolve(false); } catch {}
  }
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

/* -----------------------------
   Screen management
--------------------------------*/
async function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  // Reset viewport on screen change (fixes layout issues)
  resetViewport();

  if (screenId === 'savedScreen') {
    await loadSavedGuides();
    updateSelectDeleteUI();
  }
  if (screenId === 'previewScreen') {
    setPreviewProgressUI(0);
  }
  if (screenId === 'ioScreen') {
    await refreshExportMetaOnly();
  }
}

function showUrlLoader() {
  document.getElementById('urlLoader').style.display = 'block';
  document.getElementById('textPaster').style.display = 'none';
}

function showTextPaster() {
  document.getElementById('textPaster').style.display = 'block';
  document.getElementById('urlLoader').style.display = 'none';
}

/* -----------------------------
   Saved Guides: Select + Delete
--------------------------------*/
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
    message: `Delete ${count} selected guide${count === 1 ? '' : 's'}?\nThis cannot be undone.`,
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

/* -----------------------------
   Import / Export
--------------------------------*/
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
  
  // Reset viewport when switching tabs
  resetViewport();
}

async function refreshExportMetaOnly() {
  const guides = await bridge.readGuides();
  document.getElementById('exportCount').textContent = String(guides.length);
}

function setImportStatus(html) {
  document.getElementById('importStatus').innerHTML = html || '';
}

function showImportActions(show) {
  document.getElementById('importActions').style.display = show ? 'block' : 'none';
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateExportCode() {
  const guides = await bridge.readGuides();

  const data = {
    v: 1,
    app: 'ggm',
    exportedAt: new Date().toISOString(),
    guides
  };

  const json = JSON.stringify(data);
  const hashHex = await sha256Hex(json);
  const bytes = new TextEncoder().encode(json);
  const payload = base64UrlEncodeBytes(bytes);

  const code = `GGM1:${payload}:${hashHex}`;

  document.getElementById('exportCode').value = code;
  document.getElementById('exportHash').textContent = hashHex;
  document.getElementById('exportCount').textContent = String(guides.length);
  document.getElementById('btnCopyExport').disabled = !code;
  
  // Reset viewport after generation
  resetViewport();
}

async function copyExportCode() {
  const ta = document.getElementById('exportCode');
  const value = ta.value || '';
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    showToast('Copied', 'Export code copied');
    return;
  } catch {
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied', 'Export code copied');
    } catch {
      showToast('Copy', 'Select All and copy manually');
    }
  }
}

async function validateImportCode() {
  const raw = (document.getElementById('importCode').value || '').trim();
  pendingImport = null;
  showImportActions(false);
  setImportStatus('');

  if (!raw) {
    setImportStatus(`<div class="error"><strong>❌ Paste an export code first.</strong></div>`);
    return;
  }

  const parts = raw.split(':');
  if (parts.length !== 3 || parts[0] !== 'GGM1') {
    setImportStatus(`<div class="error"><strong>❌ Invalid format.</strong><br>Expected: <code>GGM1:&lt;payload&gt;:&lt;sha256&gt;</code></div>`);
    return;
  }

  const payload = parts[1];
  const hashHex = parts[2];

  try {
    const bytes = base64UrlDecodeToBytes(payload);
    const json = new TextDecoder().decode(bytes);

    const computed = await sha256Hex(json);
    if (computed !== hashHex) {
      setImportStatus(`<div class="error"><strong>❌ Hash mismatch.</strong><br>Code may be corrupted or incomplete.</div>`);
      return;
    }

    const data = JSON.parse(json);

    if (!data || data.v !== 1 || data.app !== 'ggm' || !Array.isArray(data.guides)) {
      setImportStatus(`<div class="error"><strong>❌ Unsupported export data.</strong></div>`);
      return;
    }

    pendingImport = { data, hashHex, guideCount: data.guides.length };

    setImportStatus(`
      <div class="success">
        <strong>✓ Valid export code</strong><br>
        Exported: ${escapeHtml(String(data.exportedAt || ''))}<br>
        Guides: ${data.guides.length}
      </div>
    `);

    document.getElementById('importGuideCount').textContent = String(data.guides.length);
    document.getElementById('importHash').textContent = hashHex;
    showImportActions(true);
  } catch (e) {
    setImportStatus(`<div class="error"><strong>❌ Failed to parse import.</strong><br>${escapeHtml(String(e?.message || e))}</div>`);
  }
  
  // Reset viewport after validation
  resetViewport();
}

function clearImportUI() {
  document.getElementById('importCode').value = '';
  setImportStatus('');
  showImportActions(false);
  pendingImport = null;
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
  clearImportUI();
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
  clearImportUI();
  await showScreen('mainScreen');
}

/* -----------------------------
   Find (Trim)
--------------------------------*/
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

/* -----------------------------
   Trim / Preview / Save
--------------------------------*/
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
  if (!content) return alert('Nothing to preview (trimmed content is empty).');

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
  // FIX: If no scroll needed (short guide), progress should be 100%
  const progress = maxScroll > 0 ? Math.round((c.scrollTop / maxScroll) * 100) : 100;
  setPreviewProgressUI(progress);
}

function setPreviewProgressUI(progress) {
  document.getElementById('previewProgressFill').style.width = progress + '%';
  document.getElementById('previewProgressText').textContent = progress + '%';
}

/* -----------------------------
   Loading sources
--------------------------------*/
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
      if (typeof bridge.fetchUrlBrowser === 'function' &&
          (msg.includes('HTTP 403') || msg.includes('Blocked by bot protection'))) {
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
    errorDiv.innerHTML = `<div class="success">✓ Loaded successfully!</div>`;
    
    // Reset viewport after successful load
    resetViewport();
    
    setTimeout(() => (errorDiv.innerHTML = ''), 2500);
    proceedToTrim();
  } catch (err) {
    loadingDiv.style.display = 'none';
    const msg = escapeHtml(String(err?.message || err || 'Unknown error'));
    errorDiv.innerHTML = `
      <div class="error">
        <strong>❌ Unable to load URL</strong><br><br>
        ${msg}<br><br>
        <p><strong>Try:</strong></p>
        <ol style="text-align:left; margin:10px 20px; line-height:1.8;">
          <li><strong>Paste Text</strong> (most reliable)</li>
          <li><strong>Load from File</strong> (download/save as .txt)</li>
        </ol>
      </div>
    `;
  }
}

/* -----------------------------
   Save + list + reader
--------------------------------*/
async function finalSaveGuide() {
  const name = document.getElementById('guideName').value.trim();
  if (!name) return alert('Please enter a guide name.');

  const content = (document.getElementById('editContent').value || '').trim();
  if (!content) return alert('Trimmed content is empty. Please keep some text before saving.');

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

  showToast('Saved', 'Guide saved successfully');
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
            <input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="Select guide">
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

  // Load word colors
  wordColors = guide.wordColors || {};

  document.getElementById('readerTitle').textContent = guide.name;
  
  // Apply word highlighting
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
    // No highlights, just plain text
    readerContent.textContent = content;
    return;
  }

  // Create HTML with highlighted words
  let html = escapeHtml(content);
  
  // Sort words by length (longest first) to avoid partial matches
  const sortedWords = Object.keys(wordColors).sort((a, b) => b.length - a.length);
  
  for (const word of sortedWords) {
    const color = wordColors[word];
    // Use word boundaries to match whole words only
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
    html = html.replace(regex, `<span style="background-color: ${color}; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  }
  
  readerContent.innerHTML = html;
}

async function updateReadingProgress() {
  if (currentGuideId == null) return;

  const c = document.getElementById('readerContent');
  const maxScroll = c.scrollHeight - c.clientHeight;
  // FIX: If no scroll needed (short guide), progress should be 100%
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
  exitFullscreen();
  showScreen('savedScreen');
}

async function deleteCurrentGuide() {
  if (!currentGuideId) return;

  const ok = await themedConfirm({
    title: 'Delete guide',
    message: 'Delete this guide?\nThis cannot be undone.',
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
  exitFullscreen();
  await showScreen('savedScreen');
}

async function updateGuideCount() {
  const guides = await bridge.readGuides();
  const count = guides.length;
  document.getElementById('guideCount').textContent = `${count} guide${count === 1 ? '' : 's'}`;
}

/* -----------------------------
   Fullscreen Mode
--------------------------------*/
function toggleFullscreen() {
  if (isFullscreen) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function enterFullscreen() {
  isFullscreen = true;
  document.body.classList.add('fullscreen');
  document.getElementById('btnFullscreen').textContent = '⛶ Exit Fullscreen';
  
  // Hide all buttons except fullscreen, theme, and word colors
  const buttons = document.querySelector('#readerScreen .button-group').children;
  for (const btn of buttons) {
    if (btn.id !== 'btnFullscreen' && btn.id !== 'btnTheme' && btn.id !== 'btnWordColors') {
      btn.style.display = 'none';
    }
  }
}

function exitFullscreen() {
  isFullscreen = false;
  document.body.classList.remove('fullscreen');
  document.getElementById('btnFullscreen').textContent = '⛶ Fullscreen';
  
  // Show all buttons again
  const buttons = document.querySelector('#readerScreen .button-group').children;
  for (const btn of buttons) {
    btn.style.display = '';
  }
}

/* -----------------------------
   Theme Switching
--------------------------------*/
function cycleTheme() {
  const themes = ['dark', 'light', 'contrast'];
  const currentIndex = themes.indexOf(readerTheme);
  const nextIndex = (currentIndex + 1) % themes.length;
  readerTheme = themes[nextIndex];
  
  const container = document.getElementById('readerContainer');
  container.className = 'reader-container';
  
  if (readerTheme === 'light') {
    container.classList.add('theme-light');
    document.getElementById('btnTheme').textContent = '🎨 Light';
  } else if (readerTheme === 'contrast') {
    container.classList.add('theme-contrast');
    document.getElementById('btnTheme').textContent = '🎨 High Contrast';
  } else {
    document.getElementById('btnTheme').textContent = '🎨 Dark';
  }
}

/* -----------------------------
   Word Colors
--------------------------------*/
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
  setTimeout(() => {
    modal.style.display = 'none';
  }, 200);
}

function refreshWordColorsList() {
  const list = document.getElementById('wordColorsList');
  
  if (!Object.keys(wordColors).length) {
    list.innerHTML = '<p class="help-text">No word highlights yet. Add some above!</p>';
    return;
  }
  
  list.innerHTML = Object.entries(wordColors).map(([word, color]) => `
    <div class="word-color-item">
      <div class="word-color-sample" style="background-color: ${color};"></div>
      <div class="word-color-text">${escapeHtml(word)}</div>
      <button class="danger word-color-remove" data-word="${escapeHtml(word)}">Remove</button>
    </div>
  `).join('');
  
  // Add remove handlers
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
    showToast('Error', 'Please enter a word');
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
  
  const guides = bridge.readGuides().then(guides => {
    const guide = guides.find(g => g.id === currentGuideId);
    if (guide) {
      applyWordHighlights(guide.content);
    }
  });
}

/* -----------------------------
   Utilities
--------------------------------*/
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

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

/* -----------------------------
   Wire up events
--------------------------------*/
document.getElementById('platformLabel').textContent = bridge.platform || 'unknown';

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
document.getElementById('btnTheme').addEventListener('click', cycleTheme);
document.getElementById('btnWordColors').addEventListener('click', showWordColorsModal);

// Word colors modal
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

// IO
document.getElementById('tabExport').addEventListener('click', () => setTab('export'));
document.getElementById('tabImport').addEventListener('click', () => setTab('import'));

document.getElementById('btnGenerateExport').addEventListener('click', generateExportCode);
document.getElementById('btnCopyExport').addEventListener('click', copyExportCode);

document.getElementById('btnValidateImport').addEventListener('click', validateImportCode);
document.getElementById('btnClearImport').addEventListener('click', clearImportUI);

document.getElementById('btnImportReplace').addEventListener('click', importReplaceAll);
document.getElementById('btnImportMerge').addEventListener('click', importMergeKeepCurrent);

setTab('export');

updateGuideCount();

// Listen for resize/orientation changes and reset viewport
window.addEventListener('resize', resetViewport);
window.addEventListener('orientationchange', () => {
  setTimeout(resetViewport, 100);
});

setTimeout(() => showSupportModal(), 0);
