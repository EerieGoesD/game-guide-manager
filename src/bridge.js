// C:\Users\eerie\Documents\GitHub\game-guide-manager\src\bridge.js
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const GUIDES_FILE = 'guides.json';
const InteractiveImport = registerPlugin('InteractiveImport');

function looksLikeBotBlock(html) {
  if (!html || typeof html !== 'string') return false;
  const s = html.toLowerCase();
  return (
    s.includes('_cf_chl_opt') ||
    s.includes('challenge-platform') ||
    s.includes('attention required') ||
    s.includes('enable javascript and cookies to continue') ||
    s.includes('cf-challenge') ||
    s.includes('cloudflare')
  );
}

export function getBridge() {
  // Electron preload bridge
  if (window.GuideBridge && typeof window.GuideBridge.fetchUrl === 'function') {
    return window.GuideBridge;
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
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Safari',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

      const data = res.data;
      const text = typeof data === 'string' ? data : JSON.stringify(data);

      if (looksLikeBotBlock(text)) {
        throw new Error('Blocked by bot protection (try Paste text).');
      }

      return text;
    },

    async fetchUrlBrowser(url) {
      const out = await InteractiveImport.open({ url });
      const text = (out && out.text) ? String(out.text) : '';
      if (!text.trim()) throw new Error('Import returned empty content.');
      return text;
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