import { useEffect, useRef, useState } from 'react';
import { PenLine, Upload, Undo2, Eraser, Save } from 'lucide-react';
import { Button, Modal, Seg } from './ui';

type Pt = { x: number; y: number; t: number };
type Stroke = { pts: Pt[]; color: string; width: number };

const INKS = [
  { value: '#111111', label: 'Black' },
  { value: '#1b3a8c', label: 'Blue' },
];

/** Trim transparent edges of a canvas and return a PNG (Uint8Array). */
async function trimToPng(src: HTMLCanvasElement, pad = 8): Promise<Uint8Array | null> {
  const ctx = src.getContext('2d')!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  const blob: Blob = await new Promise((r) => out.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, scale: number) {
  const p = s.pts;
  if (!p.length) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length < 3) {
    ctx.beginPath();
    ctx.arc(p[0].x * scale, p[0].y * scale, (s.width * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Pressure-like effect: faster strokes are thinner
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const dt = Math.max(1, b.t - a.t);
    const speed = dist / dt; // px per ms
    const w = s.width * Math.max(0.45, Math.min(1.25, 1.2 - speed * 0.35));
    ctx.lineWidth = w * scale;
    ctx.beginPath();
    ctx.moveTo(((a.x + b.x) / 2) * scale, ((a.y + b.y) / 2) * scale);
    ctx.quadraticCurveTo(b.x * scale, b.y * scale, ((b.x + c.x) / 2) * scale, ((b.y + c.y) / 2) * scale);
    ctx.stroke();
  }
}

export function SignaturePad({ onClose, onSave }: { onClose: () => void; onSave: (png: Uint8Array) => Promise<void> }) {
  const [mode, setMode] = useState<'draw' | 'import'>('draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(INKS[0].value);
  const [width, setWidth] = useState(2.6);
  const [imported, setImported] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState(185);
  const [recolor, setRecolor] = useState(true);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const importCanvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);
  const W = 680, H = 240;

  // ---- drawing ----
  const redraw = (extra?: Stroke | null) => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) drawStroke(ctx, s, ratio);
    if (extra) drawStroke(ctx, extra, ratio);
  };
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = W * ratio;
    c.height = H * ratio;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, mode]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, t: e.timeStamp };
  };
  const down = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    current.current = { pts: [pos(e)], color, width };
    redraw(current.current);
  };
  const move = (e: React.PointerEvent) => {
    if (!current.current) return;
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const r = canvas.current!.getBoundingClientRect();
      current.current.pts.push({ x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H, t: ev.timeStamp });
    }
    redraw(current.current);
  };
  const up = () => {
    const done = current.current;
    current.current = null;
    if (done) setStrokes((s) => [...s, done]);
  };

  // ---- import ----
  const pickImage = (file: File) => {
    const img = new Image();
    img.onload = () => setImported(img);
    img.src = URL.createObjectURL(file);
  };
  useEffect(() => {
    const c = importCanvas.current;
    if (!c || !imported) return;
    const scale = Math.min(1, 1600 / imported.naturalWidth);
    c.width = Math.round(imported.naturalWidth * scale);
    c.height = Math.round(imported.naturalHeight * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(imported, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const ink = recolor ? hex(color) : null;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (d[i + 3] < 10 || lum >= threshold) {
        d[i + 3] = 0; // paper -> transparent
      } else {
        // soft edge: darker = more opaque
        d[i + 3] = Math.min(255, Math.round(((threshold - lum) / threshold) * 255 * 1.6));
        if (ink) [d[i], d[i + 1], d[i + 2]] = ink;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [imported, threshold, recolor, color, mode]);

  const save = async () => {
    setSaving(true);
    try {
      let png: Uint8Array | null = null;
      if (mode === 'draw') {
        const off = document.createElement('canvas');
        const scale = 3; // high resolution so it prints crisply
        off.width = W * scale;
        off.height = H * scale;
        const ctx = off.getContext('2d')!;
        for (const s of strokes) drawStroke(ctx, s, scale);
        png = await trimToPng(off, 12);
      } else if (importCanvas.current && imported) {
        png = await trimToPng(importCanvas.current, 6);
      }
      if (!png) return;
      await onSave(png);
    } finally {
      setSaving(false);
    }
  };

  const canSave = mode === 'draw' ? strokes.length > 0 : !!imported;

  return (
    <Modal title="Your signature" onClose={onClose} size="mid" icon={<PenLine size={19} color="var(--accent)" />}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Save size={15} />} busy={saving} disabled={!canSave} onClick={save}>Save signature</Button></>}>
      <div className="modal-body col" style={{ gap: 14 }}>
        <div className="row">
          <Seg value={mode} onChange={setMode} options={[{ value: 'draw', label: <><PenLine size={14} /> Draw</> }, { value: 'import', label: <><Upload size={14} /> Import image</> }]} />
          <div className="spacer" />
          <Seg value={color} onChange={setColor} options={INKS.map((i) => ({ value: i.value, label: <><span className="dot" style={{ background: i.value, border: '1px solid #fff4' }} />{i.label}</> }))} />
        </div>

        {mode === 'draw' ? (
          <>
            <div className="sig-paper">
              <canvas
                ref={canvas}
                style={{ width: '100%', aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              />
              <div className="sig-line"><span>X</span></div>
            </div>
            <div className="row">
              <span className="small muted">Sign with a mouse, touchpad, touchscreen or pen.</span>
              <div className="spacer" />
              <span className="small muted">Pen</span>
              <input type="range" min={1.2} max={5} step={0.2} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 110 }} />
              <Button size="sm" icon={<Undo2 size={14} />} disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))}>Undo</Button>
              <Button size="sm" icon={<Eraser size={14} />} disabled={!strokes.length} onClick={() => setStrokes([])}>Clear</Button>
            </div>
          </>
        ) : (
          <>
            <label className="drop" style={{ padding: imported ? 12 : 26, display: 'block' }}>
              <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])} />
              {imported ? (
                <div className="sig-checker"><canvas ref={importCanvas} style={{ maxWidth: '100%', maxHeight: 220, display: 'block', margin: '0 auto' }} /></div>
              ) : (
                <>
                  <div className="big-ico"><Upload size={24} /></div>
                  <b>Choose a photo or scan of your signature</b>
                  <div className="muted small" style={{ marginTop: 6 }}>Sign on white paper with a dark pen. PNG or JPG. The paper background is removed automatically.</div>
                </>
              )}
            </label>
            {imported && (
              <div className="row wrap">
                <span className="small muted">Background removal</span>
                <input type="range" min={120} max={245} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 180 }} />
                <label className="toggle small"><input type="checkbox" checked={recolor} onChange={(e) => setRecolor(e.target.checked)} /><span className="track" /> Recolor ink</label>
                <div className="spacer" />
                <Button size="sm" onClick={() => setImported(null)}>Choose another</Button>
              </div>
            )}
          </>
        )}
        <div className="callout small">
          <PenLine size={16} color="var(--blue)" style={{ flex: 'none' }} />
          <div>Your signature is stored encrypted for your Windows account only, and is placed wherever a template has a <span className="mono">{'{signature}'}</span> tag. You choose per document whether to sign, and each use is recorded in the audit log.</div>
        </div>
      </div>
    </Modal>
  );
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
