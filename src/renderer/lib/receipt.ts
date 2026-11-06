import { openPdf } from './pdf';

/** Most pages a receipt may add to a return (matches the main-process limit). */
export const MAX_RECEIPT_PAGES = 40;

async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.88): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not convert the page to an image');
  return new Uint8Array(await blob.arrayBuffer());
}

function whiteCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/**
 * Turns a property receipt (PDF, JPEG or PNG) into one JPEG per page, rendered at `dpi`,
 * ready to be added to the return as full pages.
 */
export async function receiptPages(bytes: Uint8Array, dpi: number): Promise<Uint8Array[]> {
  const isPdf = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  if (isPdf) {
    const doc = await openPdf(bytes);
    try {
      if (doc.numPages > MAX_RECEIPT_PAGES) throw new Error(`The receipt has ${doc.numPages} pages; at most ${MAX_RECEIPT_PAGES} can be added to a return.`);
      const out: Uint8Array[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: dpi / 72 });
        const { canvas } = whiteCanvas(vp.width, vp.height);
        await page.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
        out.push(await canvasToJpeg(canvas));
        page.cleanup();
      }
      return out;
    } finally {
      void doc.loadingTask.destroy();
    }
  }
  // Photo or scan of the receipt: one page. Letter at `dpi` is the largest size worth keeping.
  const bmp = await createImageBitmap(new Blob([bytes.slice()]));
  const maxSide = 11 * dpi;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const { canvas, ctx } = whiteCanvas(bmp.width * scale, bmp.height * scale);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return [await canvasToJpeg(canvas)];
}
