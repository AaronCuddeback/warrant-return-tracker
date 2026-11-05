import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { openPdf } from '../lib/pdf';
import { Button } from './ui';

export function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.25);
  const [pages, setPages] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    setErr('');
    (async () => {
      try {
        const doc = await openPdf(bytes);
        if (cancelled) return;
        setPages(doc.numPages);
        const ratio = window.devicePixelRatio || 1;
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width * ratio);
          canvas.height = Math.floor(vp.height * ratio);
          canvas.style.width = `${Math.floor(vp.width)}px`;
          el.appendChild(canvas);
          await page.render({ canvas, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
        }
        void doc.loadingTask.destroy();
      } catch (e) {
        if (!cancelled) setErr(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, scale]);

  return (
    <div className="col" style={{ height: '100%', gap: 8 }}>
      <div className="row">
        <span className="muted small">{pages ? `${pages} page${pages > 1 ? 's' : ''}` : 'Loading...'}</span>
        <div className="spacer" />
        <Button size="sm" iconOnly variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} icon={<ZoomOut size={15} />} title="Zoom out" />
        <span className="small mono">{Math.round(scale * 80)}%</span>
        <Button size="sm" iconOnly variant="ghost" onClick={() => setScale((s) => Math.min(3, s + 0.25))} icon={<ZoomIn size={15} />} title="Zoom in" />
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
