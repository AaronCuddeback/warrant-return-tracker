import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { openPdf } from '../lib/pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from './ui';

/** PDF points to CSS pixels: at 100% a page shows at its printed size. */
const CSS_UNITS = 96 / 72;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  /** null = fit the page width to the panel; otherwise 1 = 100% (actual size). */
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [err, setErr] = useState('');
  const current = zoom ?? fitZoom;
  const zoomBy = (f: number) => setZoom((z) => clampZoom((z ?? fitZoom) * f));

  // Parse the PDF once per file; zooming only re-renders the pages.
  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setErr('');
    setZoom(null);
    openPdf(bytes).then(
      (d) => {
        if (alive) {
          loaded = d;
          setDoc(d);
        } else void d.loadingTask.destroy();
      },
      (e) => alive && setErr(String((e as Error)?.message ?? e)),
    );
    return () => {
      alive = false;
      if (loaded) void loaded.loadingTask.destroy();
    };
  }, [bytes]);

  // Follow the panel width (used by "fit width") and support Ctrl + mouse wheel zoom.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [err, fitZoom]);

  const fitWidth = zoom === null ? width : 0; // only re-render on resize while fitting
  useEffect(() => {
    const el = host.current;
    if (!el || !doc || !width) return;
    let cancelled = false;
    (async () => {
      const first = await doc.getPage(1);
      const base = first.getViewport({ scale: CSS_UNITS });
      const fit = clampZoom((width - 30) / base.width); // 14px padding each side + border
      if (cancelled) return;
      setFitZoom(fit);
      const z = zoom ?? fit;
      const ratio = window.devicePixelRatio || 1;
      // First render shows pages as they arrive; a zoom change swaps all pages at once (no flicker).
      const progressive = el.childElementCount === 0;
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        if (cancelled) return;
        const vp = page.getViewport({ scale: z * CSS_UNITS });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * ratio);
        canvas.height = Math.floor(vp.height * ratio);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        await page.render({ canvas, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
        if (cancelled) return;
        if (progressive) el.appendChild(canvas);
        else canvases.push(canvas);
      }
      if (!progressive) el.replaceChildren(...canvases);
    })().catch((e) => !cancelled && setErr(String((e as Error)?.message ?? e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, zoom, fitWidth]);

  const pages = doc?.numPages ?? 0;
  return (
    <div className="col" style={{ height: '100%', gap: 8 }}>
      <div className="row">
        <span className="muted small">{pages ? `${pages} page${pages > 1 ? 's' : ''}` : 'Loading...'}</span>
        <div className="spacer" />
        <Button size="sm" variant={zoom === null ? 'default' : 'ghost'} onClick={() => setZoom(null)} title="Fit the page to the panel width">Fit width</Button>
        <Button size="sm" iconOnly variant="ghost" onClick={() => zoomBy(1 / 1.25)} disabled={current <= MIN_ZOOM + 0.001} icon={<ZoomOut size={15} />} title="Zoom out (Ctrl + mouse wheel)" />
        <span className="small mono pdf-zoom">{Math.round(current * 100)}%</span>
        <Button size="sm" iconOnly variant="ghost" onClick={() => zoomBy(1.25)} disabled={current >= MAX_ZOOM - 0.001} icon={<ZoomIn size={15} />} title="Zoom in (Ctrl + mouse wheel)" />
      </div>
      {err ? <div className="callout danger">Could not display this PDF: {err}</div> : <div className="viewer" ref={host} />}
    </div>
  );
}

export function DocxViewer({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    setBusy(true);
    setErr('');
    renderAsync(new Blob([bytes.slice()]), el, undefined, {
      inWrapper: true,
      ignoreLastRenderedPageBreak: true,
      experimental: true,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    })
      .then(() => fit())
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setBusy(false));
    // Scale the page to the pane width (Letter pages are wider than the preview pane)
    function fit() {
      const wrap = el!.querySelector<HTMLElement>('.docx-wrapper');
      const page = el!.querySelector<HTMLElement>('section.docx');
      if (!wrap || !page) return;
      wrap.style.zoom = '1';
      const z = Math.min(1, (el!.clientWidth - 36) / page.offsetWidth);
      wrap.style.zoom = String(Math.max(0.3, z));
    }
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [bytes]);
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {busy && (
        <div className="row muted" style={{ position: 'absolute', top: 14, left: 16 }}>
          <Loader2 size={15} className="spin" /> Rendering preview...
        </div>
      )}
      {err && <div className="callout danger">Preview unavailable: {err}</div>}
      <div className="docx-host" ref={host} />
    </div>
  );
}
