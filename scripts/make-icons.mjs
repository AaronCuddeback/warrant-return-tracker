// Renders the app icon (SVG) to PNG/ICO. Original artwork - no agency branding.
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'resources', 'icons');
mkdirSync(out, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3a63"/><stop offset="1" stop-color="#0b1a30"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7d27a"/><stop offset="1" stop-color="#d99a2b"/></linearGradient>
  </defs>
  <path d="M128 10 L226 44 V118 C226 182 184 226 128 246 C72 226 30 182 30 118 V44 Z" fill="url(#g)" stroke="url(#gold)" stroke-width="10" stroke-linejoin="round"/>
  <g transform="translate(70 62)">
    <path d="M0 8 a8 8 0 0 1 8 -8 h70 l30 30 v108 a8 8 0 0 1 -8 8 h-92 a8 8 0 0 1 -8 -8 z" fill="#f4f6fb"/>
    <path d="M78 0 v22 a8 8 0 0 0 8 8 h22" fill="#c9d3e3"/>
    <rect x="16" y="42" width="62" height="8" rx="4" fill="#8aa0bf"/>
    <rect x="16" y="60" width="76" height="8" rx="4" fill="#8aa0bf"/>
    <rect x="16" y="78" width="48" height="8" rx="4" fill="#8aa0bf"/>
  </g>
  <circle cx="168" cy="178" r="40" fill="#0b1a30" stroke="url(#gold)" stroke-width="9"/>
  <path d="M168 154 V180 L184 192" fill="none" stroke="#f7d27a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
writeFileSync(join(out, 'icon.svg'), svg);
writeFileSync(join(out, 'app.png'), render(256));
writeFileSync(join(out, 'app-512.png'), render(512));
writeFileSync(join(out, 'tray.png'), render(32));
writeFileSync(join(out, 'tray@2x.png'), render(64));
const ico = await pngToIco([16, 24, 32, 48, 64, 128, 256].map(render));
writeFileSync(join(out, 'icon.ico'), ico);
console.log('icons written to', out);
