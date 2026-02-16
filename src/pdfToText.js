// src/pdfToText.js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractTextFromPdfArrayBuffer(arrayBuffer) {
  const task = getDocument({ data: arrayBuffer });
  const pdf = await task.promise;

  const parts = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const tc = await page.getTextContent();

    // Build lines using hasEOL when available; otherwise fall back to spaces.
    let line = '';
    const lines = [];
    for (const item of tc.items || []) {
      const str = (item?.str ?? '').toString();
      if (!str) continue;

      line += str;

      if (item?.hasEOL) {
        lines.push(line.trimEnd());
        line = '';
      } else {
        line += ' ';
      }
    }
    if (line.trim()) lines.push(line.trim());

    parts.push(lines.join('\n').trim());
  }

  // Clean up
  if (typeof task.destroy === 'function') await task.destroy();

  return parts.filter(Boolean).join('\n\n');
}