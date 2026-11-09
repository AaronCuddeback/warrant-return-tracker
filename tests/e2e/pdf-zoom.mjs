// Checks the PDF viewer zoom in the real app: fit width, zoom in/out buttons, Ctrl + wheel.
// Usage: npm run build && node tests/e2e/pdf-zoom.mjs
import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'tests', 'e2e', 'out-zoom');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'data'), { recursive: true });

const lines = ['SEARCH WARRANT', 'Search Warrant No.: SW-2026-0500', 'Agency Case Number: 26-009999', 'Date issued: March 2, 2026', 'Hon. Test Judge'];
const stream = ['BT', '/F1 11 Tf', ...lines.map((l, i) => `1 0 0 1 60 ${740 - i * 18} Tm (${l}) Tj`), 'ET'].join('\n');
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offs = [];
objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const pdfPath = join(out, 'warrant.pdf');
writeFileSync(pdfPath, Buffer.from(pdf, 'latin1'));

const app = await electron.launch({ executablePath: join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [root], env: { ...process.env, WRT_DATA_DIR: join(out, 'data') } });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, pdfPath);
const fails = [];
const expect = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails.push(m); };

await page.waitForSelector('text=Welcome to Warrant Return Tracker');
await page.click('button:has-text("Continue")');
await page.locator('.field', { hasText: 'Full name' }).locator('input').fill('Test Officer');
await page.locator('.field', { hasText: 'Agency name' }).locator('input').fill('Test Agency');
await page.locator('.field', { hasText: 'County' }).first().locator('input').fill('Test');
await page.locator('.field', { hasText: 'Court name' }).locator('input').fill('Test Court');
await page.click('button:has-text("Continue")');
await page.click('button:has-text("Start tracking")');
await page.waitForSelector('.kpis');
await page.evaluate(() => { location.hash = '/new'; });
await page.click('.drop');
await page.waitForSelector('.viewer canvas', { timeout: 15000 });
await page.waitForTimeout(800);

const measure = () => page.evaluate(() => {
  const v = document.querySelector('.viewer');
  const c = v.querySelector('canvas');
  return { canvas: c.getBoundingClientRect().width, view: v.clientWidth, scrollW: v.scrollWidth, left: c.getBoundingClientRect().left - v.getBoundingClientRect().left, label: document.querySelector('.pdf-zoom').textContent };
});
const fit = await measure();
expect(Math.abs(fit.canvas - (fit.view - 28)) < 6 && fit.scrollW <= fit.view + 1, `starts at fit width (page ${fit.canvas}px in ${fit.view}px panel, ${fit.label})`);
await page.screenshot({ path: join(out, '1-fit.png') });

await page.click('button[title^="Zoom in"]');
await page.waitForTimeout(700);
const z1 = await measure();
expect(z1.canvas > fit.canvas * 1.2, `zoom in enlarges the page (${fit.canvas} -> ${z1.canvas}px, ${z1.label})`);
expect(z1.scrollW > z1.view, 'zoomed page scrolls sideways instead of being squeezed');
expect(z1.left >= 0, `left edge of the zoomed page is not cut off (left offset ${z1.left.toFixed(1)})`);
await page.click('button[title^="Zoom in"]');
await page.waitForTimeout(700);
const z2 = await measure();
expect(z2.canvas > z1.canvas * 1.2, `zoom in again (${z2.canvas}px, ${z2.label})`);
await page.screenshot({ path: join(out, '2-zoomed.png') });

await page.click('button[title^="Zoom out"]');
await page.click('button[title^="Zoom out"]');
await page.click('button[title^="Zoom out"]');
await page.waitForTimeout(700);
const zo = await measure();
expect(zo.canvas < fit.canvas, `zoom out shrinks below fit (${zo.canvas}px, ${zo.label})`);

const box = await page.locator('.viewer').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.down('Control');
await page.mouse.wheel(0, -300);
await page.mouse.wheel(0, -300);
await page.keyboard.up('Control');
await page.waitForTimeout(800);
const zw = await measure();
expect(zw.canvas > zo.canvas, `Ctrl + wheel zooms in (${zo.canvas} -> ${zw.canvas}px, ${zw.label})`);

await page.click('button:has-text("Fit width")');
await page.waitForTimeout(700);
const back = await measure();
expect(Math.abs(back.canvas - fit.canvas) < 2, `Fit width returns to fit (${back.canvas}px)`);

await app.evaluate(({ app: a }) => a.exit(0));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL ZOOM CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
