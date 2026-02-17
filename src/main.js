// C:\Users\eerie\Documents\GitHub\game-guide-manager\src\main.js
import './style.css';
import { getBridge } from './bridge.js';
import { normalizeGuideUrl, extractTextFromHtml } from './htmlToText.js';
import { encodeGuidesBackupToString, decodeGuidesBackupFromString } from './backup.js';
import { extractTextFromPdfArrayBuffer } from './pdfToText.js';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { CapgoFilePicker as FilePicker } from '@capgo/capacitor-file-picker';

// Viewport fix
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

// Import state (backup)
let pendingImport = null;

// Selection mode
let selectMode = false;
let selectedGuideIds = new Set();

// Reader state
let isFullscreen = false;
let readerTheme = 'dark';
let wordColors = {};

// Backup meta (no files, no codes UI)
let lastBackupMeta = null; // { createdAt, bytes, encrypted, guideCount }
const PRIVATEBIN_HOSTS = [
  'https://privatebin.net',
  'https://bin.nixnet.services',
  'https://paste.i2pd.xyz'
];

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
          <p>Sync guides between devices</p>
        </div>
      </div>

      <p class="help-text">
        Platform: <strong id="platformLabel"></strong>
      </p>

      <div class="footer">
        <div class="footer-line">
          Made by <a class="footer-eerie" href="https://linktr.ee/eeriegoesd" target="_blank" rel="noreferrer">EERIE</a>
        </div>
        <a class="footer-coffee" href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">Buy Me a Coffee ☕</a>
      </div>
    </div>

    <div id="ioScreen" class="screen">
      <h1>📦 Import / Export Saved Guides</h1>

      <div class="button-group">
        <button id="backToMainIO">← Back</button>
      </div>

      <div class="selection-helper">
        <div class="io-tabs">
          <button class="secondary" id="tabExport" type="button">Export</button>
          <button class="secondary" id="tabImport" type="button">Import</button>
        </div>

        <div id="exportPane" style="margin-top:16px;">
          <h2>Share Backup (recommended)</h2>
<p class="help-text">
            Creates an encrypted backup of all your guides and generates a secure link.
            The link expires in 1 week. Share it to your other device, then paste it in the Import tab.
          </p>

<div class="button-group">

            <button id="btnGenerateLink" type="button">🔗 Generate Link</button>
          </div>

          <div id="generatedLinkSection" style="display:none; margin-top:12px;">
            <label>Backup link(s) — share each one to your other device:</label>
            <textarea id="generatedLinkBox" readonly class="export-textarea" style="min-height:80px;"></textarea>
            <div class="button-group">
              <button id="btnCopyLink" class="secondary" type="button">Copy All Links</button>
            </div>
            <p class="help-text">
              🔒 Encrypted on your device before upload. The server never sees your content.
              Links expire after 1 week. On your other device, paste each link separately and tap <strong>Merge</strong>.
            </p>
          </div>

<div class="selection-info">
            <strong>Guides:</strong> <span id="exportCount">0</span><br>
            <strong>Last backup:</strong> <span id="backupMeta">None</span>
          </div>
        </div>

        <div id="importPane" style="margin-top:16px; display:none;">
        
          <h2>Import Backup</h2>
          <p class="help-text">
            On the device you exported from, share the backup to any app (Notes/Messages/Email), then copy the entire backup text.
            On this device, tap “Paste Backup” to load it.
          </p>

<label for="importLinkInput">Paste your backup link:</label>
          <input type="text" id="importLinkInput" placeholder="https://privatebin.net/?abc123#..." autocomplete="off">
          <p class="help-text">🔓 Decryption happens entirely on your device.</p>

          <div class="button-group">
            <button id="btnImportFromLink" type="button">📥 Import from Link</button>
            <button class="secondary" id="btnClearImport" type="button">Clear</button>
          </div>

          <div id="importStatus"></div>

          <div id="importActions" style="display:none; margin-top:16px;">
            <div class="selection-info">
              <strong>Import contains:</strong> <span id="importGuideCount">0</span> guides
            </div>

            <div class="button-group">
              <button class="danger" id="btnImportReplace" type="button">Delete all and import</button>
              <button id="btnImportMerge" type="button">Keep current and import</button>
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

        <div class="button-group equal-width" id="loadSourceButtons">
          <button id="btnLoadFile" type="button">📄 Load from File</button>
          <button id="btnPaste" type="button">📋 Paste Text</button>
          <button id="btnUrl" type="button">🌐 Load from URL</button>
        </div>

      <input type="file" id="fileInput" style="display:none">

        <div id="textPaster" style="display:none; margin-top: 20px;">
          <label>Paste Guide Text:</label>
          <p class="help-text">Most reliable (works on all platforms).</p>
          <textarea id="pasteArea" placeholder="Paste guide text here..." style="min-height: 280px;"></textarea>
          <button id="btnPasteContinue" type="button">Continue</button>
        </div>

        <div id="urlLoader" style="display:none; margin-top: 20px;">
          <label>Enter URL:</label>
          <p class="help-text">
            On Android/iOS and Desktop, this uses native networking (no CORS issues).
          </p>
          <input type="text" id="urlInput" placeholder="https://gamefaqs.gamespot.com/...">
          <button id="btnUrlLoad" type="button">Load</button>
          <div id="loadError"></div>
        </div>

        <div id="loadingIndicator" class="loading" style="display:none">Loading guide...</div>
      </div>
    </div>

    <div id="extractScreen" class="screen">
      <h1>✂️ Trim Guide</h1>

      <div class="button-group">
        <button id="backToLoad" type="button">← Back</button>
        <button class="secondary" id="btnResetTrim" type="button">Reset to Full</button>
        <button class="secondary" id="btnFind" type="button">Find</button>
        <button id="btnPreview" type="button">Preview</button>
        <button id="btnGoSave" type="button">Continue to Save</button>
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
          <button id="findPrev" class="secondary" type="button">Prev</button>
          <button id="findNext" class="secondary" type="button">Next</button>
          <button id="findClose" class="secondary" type="button">Close</button>
        </div>

        <textarea id="editContent" placeholder="Guide text will appear here..."></textarea>
      </div>
    </div>

    <div id="previewScreen" class="screen">
      <div class="button-group">
        <button id="backToTrim" type="button">← Back</button>
        <button id="btnPreviewContinue" type="button">Continue to Save</button>
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
          <button id="btnFinalSave" type="button">Save Guide</button>
          <button class="secondary" id="backToTrim2" type="button">← Back</button>
        </div>
      </div>
    </div>

    <div id="savedScreen" class="screen">
      <h1>📚 My Saved Guides</h1>

      <div class="button-group">
        <button id="backToMain2" type="button">← Back</button>
        <button class="secondary" id="btnSelectDelete" type="button">Select + Delete</button>
        <button class="danger" id="btnDeleteSelected" type="button" style="display:none;">Delete Selected (0)</button>
        <button class="secondary" id="btnCancelSelect" type="button" style="display:none;">Cancel</button>
      </div>

      <div id="savedGuidesList" class="guide-grid"></div>
    </div>

    <div id="readerScreen" class="screen">
      <div class="button-group" id="readerButtonGroup">
        <button id="backToGuides" type="button">← Back</button>
        <button class="secondary btn-fixed-width" id="btnFullscreen" type="button">⛶ Fullscreen</button>
        <button class="secondary btn-fixed-width" id="btnTheme" type="button">🎨 Theme</button>
        <button class="secondary" id="btnWordColors" type="button">🖍️ Colors</button>
        <button class="danger" id="btnDelete" type="button">🗑️ Delete</button>
      </div>

      <div class="reader-container" id="readerContainer">
        <div class="reader-header">
          <div class="reader-header-top">
            <div class="reader-title" id="readerTitle"></div>
            <div class="reader-header-actions" id="readerHeaderActions" style="display:none;">
              <button class="secondary reader-icon-btn" id="btnThemeInline" type="button" title="Theme">🎨</button>
              <button class="secondary reader-icon-btn" id="btnWordColorsInline" type="button" title="Colors">🖍️</button>
              <button class="fullscreen-exit-btn reader-icon-btn" id="fullscreenExitBtn" type="button" title="Exit Fullscreen">✕</button>
            </div>
          </div>
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

    <div id="toast" class="toast">
      <span class="toast-title" id="toastTitle">Saved</span>
      <span id="toastMessage"></span>
      <button class="toast-close" id="toastClose" type="button">×</button>
    </div>

    <div id="modal" class="modal" style="display:none">
      <div class="modal-card">
        <div class="modal-title" id="modalTitle">Confirm</div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-actions">
          <button class="secondary" id="modalCancel" type="button">Cancel</button>
          <button id="modalOk" type="button">OK</button>
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
            <button id="btnAddWordColor" type="button">Add Highlight</button>
          </div>

          <div class="word-colors-list" id="wordColorsList"></div>
        </div>
        <div class="modal-actions">
          <button class="secondary" id="wordColorsClose" type="button">Close</button>
        </div>
      </div>
    </div>

    <div id="supportModal" class="modal" style="display:none">
      <div class="modal-card modal-compact">
        <button class="modal-x" id="supportClose" type="button">×</button>
        <div class="modal-title" id="supportTitle">Support</div>
        <div class="modal-body" id="supportBody">
          Made by <a href="https://linktr.ee/eeriegoesd" target="_blank" rel="noreferrer">EERIE</a><br>
          <a href="https://buymeacoffee.com/eeriegoesd" target="_blank" rel="noreferrer">
            Buy&nbsp;Me&nbsp;a&nbsp;Coffee&nbsp;☕
          </a>
        </div>
      </div>
    </div>

  </div>
`;

const fileInput = document.getElementById('fileInput');

const isIOS =
  Capacitor?.getPlatform?.() === 'ios' ||
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

fileInput.accept = 'application/pdf,text/plain,.pdf,.txt';

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
  supportKeyHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
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

/* Import / Export: Share Backup (primary, no files, no codes UI) */

function setTab(which) {
  const exportPane = document.getElementById('exportPane');
  const importPane = document.getElementById('importPane');
  const tabExport = document.getElementById('tabExport');
  const tabImport = document.getElementById('tabImport');

  const isExport = which === 'export';
  exportPane.style.display = isExport ? 'block' : 'none';
  importPane.style.display = isExport ? 'none' : 'block';

  tabExport.classList.toggle('active', isExport);
  tabImport.classList.toggle('active', !isExport);
  tabExport.disabled = false;
  tabImport.disabled = false;

  resetViewport();
}

async function refreshExportMetaOnly() {
  const guides = await bridge.readGuides();
  document.getElementById('exportCount').textContent = String(guides.length);

  document.getElementById('backupMeta').textContent = lastBackupMeta
    ? `${lastBackupMeta.createdAt} (${Math.round(lastBackupMeta.bytes / 1024)} KB)${lastBackupMeta.encrypted ? ' 🔒' : ''}`
    : 'None';
}

function setImportStatus(html) {
  document.getElementById('importStatus').innerHTML = html || '';
}

function showImportActions(show) {
  document.getElementById('importActions').style.display = show ? 'block' : 'none';
}

function clearImportUI() {
  const linkInput = document.getElementById('importLinkInput');
  if (linkInput) linkInput.value = '';

  setImportStatus('');
  showImportActions(false);
  pendingImport = null;
  resetViewport();
}

async function generateShareLink() {
  const guides = await bridge.readGuides();
  if (!guides.length) {
    showToast('Nothing to export', 'You have no saved guides.');
    return;
  }

  const btn = document.getElementById('btnGenerateLink');
  btn.textContent = 'Checking size...';
  btn.disabled = true;

  try {
    // Check total size first
    const { text: fullText } = await encodeGuidesBackupToString(guides, '');
    const totalBytes = new TextEncoder().encode(fullText).length;
    const CHUNK_BYTE_LIMIT = 6_000_000; // 6 MB per link, safe under PrivateBin's 10 MB

    // Split guides into chunks that each stay under the byte limit
    const chunks = [];
    let currentChunk = [];
    let currentBytes = 0;

    for (const guide of guides) {
      const { text: singleText } = await encodeGuidesBackupToString([guide], '');
      const guideBytes = new TextEncoder().encode(singleText).length;

      if (currentBytes + guideBytes > CHUNK_BYTE_LIMIT && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [guide];
        currentBytes = guideBytes;
      } else {
        currentChunk.push(guide);
        currentBytes += guideBytes;
      }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    if (chunks.length > 1) {
      const ok = await themedConfirm({
        title: `Library is large — ${chunks.length} links needed`,
        message: `Your library is too large for one link. We'll generate ${chunks.length} links.\n\nOn import, paste each one and tap "Merge".`,
        okText: 'Continue',
        cancelText: 'Cancel'
      });
      if (!ok) {
        btn.textContent = '🔗 Generate Link';
        btn.disabled = false;
        return;
      }
    }

    const links = [];
    for (let i = 0; i < chunks.length; i++) {
      btn.textContent = `Uploading ${i + 1} / ${chunks.length}...`;

      const { text } = await encodeGuidesBackupToString(chunks[i], '');
      const { payloadB64, keyB64 } = await pbEncrypt(text);

      const body = JSON.stringify({
        v: 2,
        ct: payloadB64,
        adata: [[], 'plaintext', 0, 0],
        meta: { expire: '1week' }
      });

let result = null;
      for (const host of PRIVATEBIN_HOSTS) {
        
        try {
          const raw = await fetch(host, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'JSONHttpRequest'
            },
            body
          });
          const candidate = await raw.json();
          if (candidate.status === 0) {
            result = { ...candidate, _host: host };
            break;
          }
        } catch {}
      }
      if (!result) throw new Error(`Upload failed for batch ${i + 1}: all hosts unavailable`);
links.push(`${result._host}/?${result.id}#${keyB64}`);
}

    document.getElementById('generatedLinkBox').value = links.join('\n');
    document.getElementById('generatedLinkSection').style.display = 'block';

    try { await navigator.clipboard.writeText(links.join('\n')); } catch {}

    lastBackupMeta = {
      createdAt: new Date().toLocaleString(),
      bytes: totalBytes,
      encrypted: true,
      guideCount: guides.length
    };
    await refreshExportMetaOnly();

    const msg = links.length > 1
      ? `${links.length} encrypted links generated and copied`
      : 'Encrypted link generated and copied';
    showToast('Done!', `🔒 ${msg} — expires in 1 week`);

  } catch (e) {
    showToast('Error', String(e?.message || e));
  } finally {
    btn.textContent = '🔗 Generate Link';
    btn.disabled = false;
  }
}

async function validateBackupText(text, pass) {
  if (pass === undefined) pass = (document.getElementById('backupPassImport')?.value || '').trim();

  try {
    const data = await decodeGuidesBackupFromString(text, pass);

    const guideCount = Array.isArray(data?.guides) ? data.guides.length : 0;
    pendingImport = { data, guideCount };

    setImportStatus(`
      <div class="success">
        <strong>✓ Backup loaded!</strong><br>
        Exported: ${escapeHtml(String(data.exportedAt || ''))}<br>
        Guides: ${guideCount}
      </div>
    `);

    document.getElementById('importGuideCount').textContent = String(guideCount);
    showImportActions(true);
  } catch (e) {
    setImportStatus(`<div class="error"><strong>❌ Import failed</strong><br>${escapeHtml(String(e?.message || e))}</div>`);
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
  if (!pendingImport?.data) return;

  const list = Array.isArray(pendingImport.data.guides) ? pendingImport.data.guides : [];
  const imported = list.map(g => ({
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
  await showScreen('mainScreen');}

async function importMergeKeepCurrent() {
  if (!pendingImport?.data) return;

  const current = await bridge.readGuides();
  const existingIds = new Set(current.map(g => Number(g.id)));

  const list = Array.isArray(pendingImport.data.guides) ? pendingImport.data.guides : [];
  const imported = list.map(g => {
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

async function importFromLink() {
  const raw = (document.getElementById('importLinkInput')?.value || '').trim();
  if (!raw) {
    setImportStatus(`<div class="error">❌ Paste a link first</div>`);
    return;
  }

  let pasteId, keyB64;
  try {
    const u = new URL(raw);
    pasteId = u.search.replace('?', '');
    keyB64  = u.hash.replace('#', '');
    if (!pasteId || !keyB64) throw new Error();
  } catch {
    setImportStatus(`<div class="error">❌ Not a valid backup link</div>`);
    return;
  }

  setImportStatus(`<div class="help-text">⏳ Fetching encrypted backup...</div>`);
  showImportActions(false);
  pendingImport = null;

  try {
// The host is embedded in the link the user pasted, so use it directly
    const fetchUrl = `${new URL(raw).origin}/?${pasteId}`;
    const resp = await fetch(fetchUrl, {
      headers: { 'X-Requested-With': 'JSONHttpRequest' }
    });
    const result = await resp.json();
    if (result.status !== 0) throw new Error(result.message || 'Fetch failed');

    setImportStatus(`<div class="help-text">🔓 Decrypting on your device...</div>`);

    const plaintext = await pbDecrypt(result.ct, keyB64);
    await validateBackupText(plaintext);

  } catch (e) {
    setImportStatus(`<div class="error">❌ ${escapeHtml(String(e?.message || e))}</div>`);
  }
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
  const file = event.target.files?.[0];
  if (!file) return;

  const isPdf =
    file.type === 'application/pdf' ||
    /\.pdf$/i.test(file.name || '');

    const isText =
  (file.type && file.type.startsWith('text/')) ||
  /\.txt$/i.test(file.name || '');

if (!isPdf && !isText) {
  alert('Unsupported file type. Please select a PDF or TXT file.');
  event.target.value = '';
  return;
}

  if (isPdf) {
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const text = await extractTextFromPdfArrayBuffer(buf);
        loadedContent = (text || '').trim();
        if (!loadedContent) throw new Error('No text found in this PDF (it may be scanned).');
        proceedToTrim();
      } catch (e) {
        alert(`PDF import failed: ${String(e?.message || e)}`);
      }
    })();
    return;
  }

  // existing TXT path:
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
    errorDiv.innerHTML = `<div class="success">✓ Loaded!</div>`;
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
  showToast('Saved', 'Guide saved!');
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
    html = html.replace(regex, `<span style="background-color: ${color}; padding: 2px 4px; border-radius: 3px;">$&</span>`);
  }
  readerContent.innerHTML = html;
}

let lastPersist = 0;
let pendingPersist = null;

async function updateReadingProgress() {
  if (currentGuideId == null) return;
  const c = document.getElementById('readerContent');
  const maxScroll = c.scrollHeight - c.clientHeight;
  const progress = maxScroll > 0 ? Math.round((c.scrollTop / maxScroll) * 100) : 100;
  setProgressUI(progress);

  const now = Date.now();
  if (now - lastPersist < 500) {
    pendingPersist = progress;
    return;
  }
  lastPersist = now;

  const guides = await bridge.readGuides();
  const guide = guides.find(g => g.id === currentGuideId);
  if (guide) {
    guide.progress = progress;
    await bridge.writeGuides(guides);
  }
}

setInterval(async () => {
  if (pendingPersist == null || currentGuideId == null) return;
  const progress = pendingPersist;
  pendingPersist = null;
  lastPersist = Date.now();
  const guides = await bridge.readGuides();
  const guide = guides.find(g => g.id === currentGuideId);
  if (guide) {
    guide.progress = progress;
    await bridge.writeGuides(guides);
  }
}, 750);

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

/* FULLSCREEN MODE */
function toggleFullscreen() {
  if (isFullscreen) exitFullscreen();
  else enterFullscreen();
}

function enterFullscreen() {
  isFullscreen = true;
  document.body.classList.add('fullscreen');

  const actions = document.getElementById('readerHeaderActions');
  if (actions) actions.style.display = 'flex';

  // Hide external controls (they get covered by the fixed reader container anyway)
  const buttonGroup = document.getElementById('readerButtonGroup');
  if (buttonGroup) buttonGroup.style.display = 'none';
}

function exitFullscreen() {
  isFullscreen = false;
  document.body.classList.remove('fullscreen');

  const actions = document.getElementById('readerHeaderActions');
  if (actions) actions.style.display = 'none';

  const buttonGroup = document.getElementById('readerButtonGroup');
  if (buttonGroup) buttonGroup.style.display = '';
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
    if (btn) btn.textContent = '🎨 Light';
  } else if (readerTheme === 'contrast') {
    container.classList.add('theme-contrast');
    if (btn) btn.textContent = '🎨 Contrast';
  } else {
    if (btn) btn.textContent = '🎨 Theme';
  }
}

/* Word Colors */
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
      <button class="danger word-color-remove" data-word="${escapeHtml(word)}" type="button">Remove</button>
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

/* PrivateBin crypto */
function bytesToBase64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbEncrypt(plaintext) {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const keyB64 = bytesToBase64(rawKey)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  const payloadB64 = bytesToBase64(combined);
  return { payloadB64, keyB64 };
}

async function pbDecrypt(payloadB64, keyB64) {
  const rawKey = base64urlToBytes(keyB64);
  const key = await crypto.subtle.importKey(
    'raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']
  );
  const bin = atob(payloadB64);
  const combined = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) combined[i] = bin.charCodeAt(i);
  const iv = combined.slice(0, 12);
  const cipherBuf = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
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

function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64ToArrayBuffer(b64) {
  return base64ToUint8Array(b64).buffer;
}

function base64ToText(b64) {
  const bytes = base64ToUint8Array(b64);
  return new TextDecoder('utf-8').decode(bytes);
}

async function pickFileNative() {
const result = await FilePicker.pickFiles({
  types: ['application/pdf', 'text/plain'],
  limit: 1,
  readData: true
});

  const f = result?.files?.[0];
  if (!f) return;

  const name = f.name || '';
  const mime = f.mimeType || '';
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name);

  if (isPdf) {
    const buf = f.data ? base64ToArrayBuffer(f.data) : null;
    if (!buf) throw new Error('Could not read PDF data.');
    const text = await extractTextFromPdfArrayBuffer(buf);
    loadedContent = (text || '').trim();
    if (!loadedContent) throw new Error('No text found in this PDF (may be scanned).');
    proceedToTrim();
    return;
  }

  const isText =
  (mime && mime.startsWith('text/')) ||
  mime === 'text/plain' ||
  /\.txt$/i.test(name);

if (isText) {
  if (!f.data) throw new Error('Could not read text data.');
  loadedContent = base64ToText(f.data).trim();
  if (!loadedContent) throw new Error('Text file was empty.');
  proceedToTrim();
  return;
}

throw new Error('Unsupported file type. Please pick a PDF or TXT.');
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

document.getElementById('btnLoadFile').addEventListener('click', async () => {
  try {
    if (Capacitor?.isNativePlatform?.() && Capacitor.getPlatform() === 'ios') {
      await pickFileNative();
      return;
    }
    document.getElementById('fileInput').click(); // web/desktop fallback
  } catch (e) {
    alert(`File pick failed: ${String(e?.message || e)}`);
  }
});
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
document.getElementById('btnThemeInline').addEventListener('click', cycleTheme);
document.getElementById('btnWordColorsInline').addEventListener('click', showWordColorsModal);

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

// Import/Export
document.getElementById('tabExport').addEventListener('click', () => setTab('export'));
document.getElementById('tabImport').addEventListener('click', () => setTab('import'));

document.getElementById('btnGenerateLink').addEventListener('click', generateShareLink);
document.getElementById('btnImportFromLink').addEventListener('click', importFromLink);
document.getElementById('btnCopyLink').addEventListener('click', () => {
  const val = document.getElementById('generatedLinkBox')?.value;
  if (val) navigator.clipboard.writeText(val).then(() => showToast('Copied', 'All links copied'));
});

document.getElementById('btnClearImport').addEventListener('click', clearImportUI);
document.getElementById('btnImportReplace').addEventListener('click', importReplaceAll);
document.getElementById('btnImportMerge').addEventListener('click', importMergeKeepCurrent);

setTab('export');
updateGuideCount();

window.addEventListener('resize', resetViewport);
window.addEventListener('orientationchange', () => {
  setTimeout(resetViewport, 100);
});

setTimeout(() => showSupportModal(), 0);