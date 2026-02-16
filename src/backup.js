// src/backup.js
import pako from 'pako';

const PBKDF2_ITERS = 150_000;

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKeyFromPassword(password, saltBytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto unavailable (crypto.subtle). Cannot encrypt/decrypt backup.');
  }
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytesAesGcm(bytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);

  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    bytes
  );

  return {
    alg: 'aes-256-gcm+pbkdf2',
    iters: PBKDF2_ITERS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ctBuf))
  };
}

async function decryptBytesAesGcm(encObj, password) {
  if (!password) throw new Error('PASSWORD_REQUIRED');
  const salt = base64ToBytes(encObj.salt);
  const iv = base64ToBytes(encObj.iv);
  const ct = base64ToBytes(encObj.ct);

  const key = await deriveKeyFromPassword(password, salt);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  );
  return new Uint8Array(ptBuf);
}

/**
 * Returns a JSON string (the backup file contents).
 * Contains compressed guides; encrypted if password provided.
 */
export async function encodeGuidesBackupToString(guides, password) {
  const payload = {
    v: 1,
    fmt: 'ggm-backup',
    app: 'ggm',
    exportedAt: new Date().toISOString(),
    guides
  };

  const json = JSON.stringify(payload);
  const compressed = pako.deflate(json, { level: 9 }); // Uint8Array

  const pass = (password || '').trim();
  if (pass) {
    const enc = await encryptBytesAesGcm(compressed, pass);
    const envelope = {
      v: 1,
      fmt: 'ggm-backup',
      compressed: true,
      encrypted: true,
      enc
    };
    const text = JSON.stringify(envelope);
    return { text, encrypted: true };
  }

  // No password -> not encrypted (still compressed)
  const envelope = {
    v: 1,
    fmt: 'ggm-backup',
    compressed: true,
    encrypted: false,
    data: bytesToBase64(compressed)
  };
  const text = JSON.stringify(envelope);
  return { text, encrypted: false };
}

/**
 * Takes the backup JSON string, returns parsed payload {v, app, exportedAt, guides}.
 */
export async function decodeGuidesBackupFromString(backupText, password) {
  let envelope;
  try {
    envelope = JSON.parse(backupText);
  } catch {
    throw new Error('Invalid backup file (not JSON).');
  }

  if (!envelope || envelope.fmt !== 'ggm-backup' || envelope.v !== 1) {
    throw new Error('Invalid backup file format/version.');
  }

  let compressedBytes;
  if (envelope.encrypted) {
    try {
      compressedBytes = await decryptBytesAesGcm(envelope.enc, (password || '').trim());
    } catch (e) {
      if (String(e?.message || e) === 'PASSWORD_REQUIRED') throw new Error('Password required for this backup.');
      throw new Error('Wrong password or corrupted backup.');
    }
  } else {
    if (!envelope.data) throw new Error('Backup file missing data.');
    compressedBytes = base64ToBytes(envelope.data);
  }

  let json;
  try {
    json = pako.inflate(compressedBytes, { to: 'string' });
  } catch {
    throw new Error('Backup data corrupted (decompress failed).');
  }

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new Error('Backup payload corrupted (parse failed).');
  }

  if (!payload || payload.fmt !== 'ggm-backup' || payload.v !== 1 || payload.app !== 'ggm' || !Array.isArray(payload.guides)) {
    throw new Error('Backup payload invalid.');
  }

  return payload;
}