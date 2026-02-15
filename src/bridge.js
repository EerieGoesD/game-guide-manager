import axios from 'axios';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const GUIDES_FILE = 'guides.json';

/**
 * Bridge API used by the UI:
 * - fetchUrl(url) -> string
 * - readGuides()  -> Guide[]
 * - writeGuides(guides) -> void
 *
 * Implementations:
 * 1) Electron: window.GuideBridge injected by preload (preferred)
 * 2) Capacitor (Android/iOS): native HTTP + filesystem
 * 3) Web fallback: localStorage + browser fetch (may fail due to CORS)
 */
export function getBridge() {
  if (window.GuideBridge && typeof window.GuideBridge.fetchUrl === 'function') {
    return window.GuideBridge; // Electron
  }

  if (Capacitor?.isNativePlatform?.()) {
    return capacitorBridge();
  }

  return webBridge();
}

function capacitorBridge() {
  return {
    platform: 'capacitor',

    async fetchUrl(url) {
      const res = await CapacitorHttp.request({
        url,
        method: 'GET',
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,text/plain,*/*'
        }
      });

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = res.data;
      return typeof data === 'string' ? data : JSON.stringify(data);
    },

    async readGuides() {
      try {
        const r = await Filesystem.readFile({
          path: GUIDES_FILE,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        const txt = r.data || '[]';
        return JSON.parse(txt);
      } catch {
        return [];
      }
    },

    async writeGuides(guides) {
      await Filesystem.writeFile({
        path: GUIDES_FILE,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        data: JSON.stringify(guides)
      });
    }
  };
}

function webBridge() {
  return {
    platform: 'web',

    async fetchUrl(url) {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    },

    async readGuides() {
      return JSON.parse(localStorage.getItem('gameGuides') || '[]');
    },

    async writeGuides(guides) {
      localStorage.setItem('gameGuides', JSON.stringify(guides));
    }
  };
}
