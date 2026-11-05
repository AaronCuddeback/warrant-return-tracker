import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = (p: string) => new URL(`./pdfjs/${p}/`, location.href).href;

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(), // pdf.js transfers (detaches) the buffer
    standardFontDataUrl: assets('standard_fonts'),
    cMapUrl: assets('cmaps'),
    cMapPacked: true,
    wasmUrl: assets('wasm'),
  }).promise;
}

/** Text of the first few pages (warrant face page + signature page are usually early). */
export async function pdfText(bytes: Uint8Array, maxPages = 8): Promise<string> {
  const doc = await openPdf(bytes);
  try {
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let line = '';
      let lastY: number | null = null;
      for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
        const y = it.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 4) {
          parts.push(line);
          line = '';
        }
        line += (line && !line.endsWith(' ') ? ' ' : '') + it.str;
        if (it.hasEOL) {
          parts.push(line);
          line = '';
        }
        lastY = y ?? lastY;
      }
      if (line) parts.push(line);
      parts.push('');
    }
    return parts.join('\n');
  } finally {
    void doc.loadingTask.destroy();
  }
}
