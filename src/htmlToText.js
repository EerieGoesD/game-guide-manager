// C:\Users\eerie\Documents\GitHub\game-guide-manager\src\htmlToText.js
export function normalizeGuideUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('gamefaqs.gamespot.com')) {
      if (!u.searchParams.has('print')) u.searchParams.set('print', '1');
      return u.toString();
    }
  } catch {}
  return url;
}

export function extractTextFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const pre = doc.querySelector('pre');
  if (pre && pre.textContent && pre.textContent.trim().length > 0) return pre.textContent;

  const main = doc.querySelector('main');
  if (main && main.textContent && main.textContent.trim().length > 0) return main.textContent;

  const bodyText = doc.body?.textContent || '';
  return bodyText;
}
