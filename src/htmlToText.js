export function normalizeGuideUrl(url) {
  // For GameFAQs, try printable view (?print=1), which is often the plain text format.
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
