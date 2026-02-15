import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const GUIDES_FILE = 'guides.json';

const UA_DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const UA_IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const COMMON_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

function looksLikeBotBlock(content) {
  if (typeof content !== 'string') return false;
  const t = content.toLowerCase();
  return (
    t.includes('_cf_chl_opt') ||
    t.includes('challenge-platform') ||
    t.includes('enable javascript and cookies') ||
    t.includes('access denied') ||
    t.includes('request blocked')
  );
}

export function getBridge() {
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
    platform: Capacitor.getPlatform?.() || 'capacitor',

    async fetchUrl(url) {
      let res = await CapacitorHttp.request({
        url,
        method: 'GET',
        responseType: 'text',
        headers: { ...COMMON_HEADERS, 'User-Agent': UA_DESKTOP_CHROME }
      });

      if (res?.status === 403) {
        res = await CapacitorHttp.request({
          url,
          method: 'GET',
          responseType: 'text',
          headers: { ...COMMON_HEADERS, 'User-Agent': UA_IOS_SAFARI }
        });
      }

      if (!res || typeof res.status !== 'number') {
        throw new Error('Network error (no status).');
      }
      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = res.data;
      const text = typeof data === 'string' ? data : JSON.stringify(data);

      if (looksLikeBotBlock(text)) {
        throw new Error('Blocked by bot protection (try Paste Text).');
      }

      return text;
    },

    async readGuides() {
      try {
        const r = await Filesystem.readFile({
          path: GUIDES_FILE,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return JSON.parse(r.data || '[]');
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