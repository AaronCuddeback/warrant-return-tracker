// Captures the README screenshots and the walkthrough GIF by driving the real app with fictional demo data.
// Usage: npm run build && node scripts/capture-showcase.mjs
// Needs ffmpeg on PATH for the GIF. Output: docs/screenshots/*.png, docs/walkthrough.gif
// Everything shown (officer, agency, court, judge, people, signature) is made up.
import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// A neutral location, because the generated file's path is visible in the walkthrough.
const work = process.platform === 'win32' ? 'C:/Users/Public/Documents/WRT Demo' : join(tmpdir(), 'wrt-showcase');
rmSync(work, { recursive: true, force: true });
const dataDir = join(work, 'data');
const docsDir = join(work, 'Returns');
const framesDir = join(work, 'frames');
const shotsDir = join(root, 'docs', 'screenshots');
for (const d of [dataDir, docsDir, framesDir, shotsDir]) mkdirSync(d, { recursive: true });

// ---------- fictional demo data ----------
const isoOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const longDate = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
const year = new Date().getFullYear();
const yy = String(year).slice(2);
const JUDGE = 'Hon. Eleanor M. Price';

function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 740;
  const content = ['BT', '/F1 11 Tf'];
  for (const l of lines) { content.push(`1 0 0 1 60 ${y} Tm (${esc(l)}) Tj`); y -= l === '' ? 10 : 18; }
  content.push('ET');
  const stream = content.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const WN = `SW-${year}-0412`;
const CN = `${yy}-005218`;
const warrantPdf = join(work, `Signed Warrant ${WN}.pdf`);
writeFileSync(warrantPdf, makePdf([
  'SUPERIOR COURT OF CALIFORNIA, COUNTY OF RIVERBEND',
  'SEARCH WARRANT AND AFFIDAVIT',
  '',
  `Search Warrant No.: ${WN}`,
  `Agency Case Number: ${CN}`,
  '',
  'THE PEOPLE OF THE STATE OF CALIFORNIA TO ANY PEACE OFFICER IN THE COUNTY OF RIVERBEND:',
  'Proof by affidavit having been made before me, you are commanded to search:',
  'Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, for records',
  'associated with the account jdoe.example@gmail.com.',
  'Suspect: John Michael Doe',
  '',
  `Date and time issued: ${longDate(-3)} at 10:42 AM`,
  JUDGE,
  'Judge of the Superior Court',
]));

// ---------- launch ----------
const app = await electron.launch({
  executablePath: join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  env: { ...process.env, WRT_DATA_DIR: dataDir, WRT_AUDIT_USER: 'javery' },
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
await app.evaluate(({ dialog, shell }, { pdf, docs }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pdf] });
  dialog.showSaveDialog = async (_w, o) => {
    const opts = o || _w;
    return { canceled: false, filePath: `${docs}\\${String(opts.defaultPath || 'out').split(/[\\/]/).pop()}` };
  };
  shell.openPath = async () => '';
  shell.openExternal = async () => {};
}, { pdf: warrantPdf, docs: docsDir });

const wait = (ms) => page.waitForTimeout(ms);
const waitExtracted = () => page.waitForFunction(() => [...document.querySelectorAll('.field')].some((f) => f.textContent.includes('Search warrant #') && f.querySelector('input')?.value), null, { timeout: 15000 }).catch(() => console.log('extraction not detected'));
const go = async (hash, ms = 900) => { await page.evaluate((h) => { location.hash = h; }, hash); await wait(ms); };
const shot = async (name) => { await wait(400); await page.screenshot({ path: join(shotsDir, `${name}.png`) }); console.log('screenshot', name); };

// A visible mouse pointer for the GIF (screenshots don't include the OS cursor).
async function installCursor() {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '26px', height: '26px', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-60px,-60px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.55))' });
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L14.8 22.6 L11.3 15.2 L18 15.2 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%', border: '3px solid #f5b43a', zIndex: '2147483646', pointerEvents: 'none', opacity: '0', transition: 'opacity .35s, transform .35s' });
    document.body.append(c, ring);
    document.addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    document.addEventListener('mousedown', (e) => {
      ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px) scale(.5)`;
      requestAnimationFrame(() => { ring.style.transition = 'opacity .45s, transform .45s'; ring.style.opacity = '0'; ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px) scale(1.4)`; });
    }, true);
  });
}
let mouse = { x: 720, y: 450 };
async function glide(x, y, steps = 16) {
  const sx = mouse.x, sy = mouse.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
    await wait(14);
  }
  mouse = { x, y };
}
async function clickOn(locator, pause = 260) {
  const l = locator.first();
  try {
    await l.scrollIntoViewIfNeeded({ timeout: 8000 });
  } catch (e) {
    await page.screenshot({ path: join(work, 'error.png') });
    throw e;
  }
  const b = await l.boundingBox();
  await glide(b.x + b.width / 2, b.y + b.height / 2);
  await wait(pause);
  await l.click();
  mouse = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function typeInto(locator, text, delay = 28) {
  await clickOn(locator, 150);
  await locator.first().press('Control+a');
  await locator.first().pressSequentially(text, { delay });
}

// Frame recorder: grabs screenshots back to back with timestamps.
const rec = { on: false, frames: [], loop: null };
function startRecording() {
  rec.on = true;
  const t0 = Date.now();
  rec.loop = (async () => {
    let i = 0;
    while (rec.on) {
      const f = join(framesDir, `f${String(i++).padStart(5, '0')}.jpg`);
      const t = Date.now() - t0;
      try { await page.screenshot({ path: f, type: 'jpeg', quality: 92 }); rec.frames.push({ f, t }); } catch { /* page busy */ }
    }
    rec.frames.push({ f: rec.frames.at(-1).f, t: Date.now() - t0 });
  })();
}
async function stopRecording() { rec.on = false; await rec.loop; }

// ---------- setup (not recorded) ----------
await page.waitForSelector('text=Welcome to Warrant Return Tracker');
await page.click('button:has-text("Continue")');
const fill = async (label, value) => page.locator('.field', { has: page.locator(`label:text-is("${label}")`) }).locator('input').first().fill(value);
await fill('Title / rank', 'Detective');
await page.locator('.field', { hasText: 'Full name' }).locator('input').fill('Jordan Avery');
await fill('Badge / ID #', '4521');
await fill('Phone', '(555) 010-0142');
await page.locator('.field', { hasText: 'Agency name' }).locator('input').fill("Riverbend County Sheriff's Office");
await fill('Short name', 'RCSO');
await fill('Unit / division', 'Digital Forensics Unit');
await page.locator('.field', { hasText: 'County' }).first().locator('input').fill('Riverbend');
await page.locator('.field', { hasText: 'Court name' }).locator('input').fill('Superior Court of California, County of Riverbend');
await shot('setup-profile');
await page.click('button:has-text("Continue")');
await page.click('button:has-text("Start tracking")');
await page.waitForSelector('.kpis');

// Draw a made-up signature ("J. Avery"-style scribble).
await go('/settings/signature', 500);
await page.click('button:has-text("Add signature")');
const pad = await page.locator('.sig-paper canvas').boundingBox();
const P = (fx, fy) => [pad.x + pad.width * fx, pad.y + pad.height * fy];
async function stroke(points) {
  await page.mouse.move(...P(...points[0]));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...P(...p), { steps: 3 });
  await page.mouse.up();
}
const J = []; for (let i = 0; i <= 24; i++) { const t = i / 24; J.push([0.2 + 0.03 * Math.sin(t * 3), 0.2 + 0.55 * t - (t > 0.75 ? (t - 0.75) * 0.9 : 0)]); }
for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); J.push([0.19 - 0.06 * Math.sin(a), 0.62 + 0.12 * Math.cos(a) * -1]); }
await stroke(J);
await stroke([[0.17, 0.22], [0.27, 0.18], [0.33, 0.2]]);
const name = []; for (let i = 0; i <= 90; i++) { const t = i / 90; name.push([0.3 + 0.48 * t, 0.58 - 0.16 * Math.abs(Math.sin(t * Math.PI * 4.5)) * (1 - 0.35 * t) - 0.04 * Math.sin(t * 9)]); }
await stroke(name);
const tail = []; for (let i = 0; i <= 30; i++) { const t = i / 30; tail.push([0.26 + 0.6 * t, 0.74 - 0.08 * Math.sin(t * Math.PI) + 0.03 * t]); }
await stroke(tail);
await page.click('.modal-foot button:has-text("Save signature")');
await page.waitForSelector('.sig-show img');
await shot('settings-signature');

// Seed a realistic caseload around today.
await page.evaluate(async ({ d, judge }) => {
  const base = { warrantType: 'premises', targets: '', judge, court: '', receivedDate: null, executedDate: null, dueRule: '', locations: '', provider: '', items: [], itemsText: '', investigationNature: '', notes: '', assignedTo: 'Det. Avery', tags: '', status: 'pending', notificationRequired: false, notificationServedDate: null, filedDate: null, snoozeUntil: null };
  const list = [
    { warrantNumber: d.y + '-0377', caseNumber: d.yy + '-004871', targets: 'Marcus Reyes', locations: '1182 Cedar Hollow Rd, Riverbend, CA', signedDate: d.m14, returnDueDate: d.m4, status: 'executed', executedDate: d.m10, tags: 'narcotics' },
    { warrantNumber: d.y + '-0389', caseNumber: d.yy + '-004902', targets: 'Apple iCloud - jlee.example@icloud.com', warrantType: 'provider', provider: 'Apple Inc.', signedDate: d.m10, returnDueDate: d.p0, notificationRequired: true, executedDate: d.m8, status: 'executed', investigationNature: 'identity theft (PC 530.5)' },
    { warrantNumber: d.y + '-0395', caseNumber: d.yy + '-005010', targets: 'Kayla Brooks', signedDate: d.m8, returnDueDate: d.p2, warrantType: 'vehicle', locations: '2019 Toyota Tacoma, CA 8ABC123', tags: 'burglary' },
    { warrantNumber: d.y + '-0401', caseNumber: d.yy + '-005077', targets: 'Devon Clarke', signedDate: d.m5, returnDueDate: d.p5, warrantType: 'device', notificationRequired: true, locations: 'Samsung Galaxy S24, IMEI 350000000000001' },
    { warrantNumber: d.y + '-0408', caseNumber: d.yy + '-005140', targets: 'Unknown - Snapchat user "rb_wolf22"', warrantType: 'provider', provider: 'Snap Inc.', signedDate: d.m1, returnDueDate: d.p9 },
    { warrantNumber: d.y + '-0410', caseNumber: d.yy + '-005166', targets: 'Tyler Nguyen', signedDate: d.p0, returnDueDate: d.p10, locations: '4410 Willow Bend Dr, Riverbend, CA' },
    { warrantNumber: d.y + '-0352', caseNumber: d.yy + '-004610', targets: 'Sofia Martinez', signedDate: d.m30, returnDueDate: d.m20, executedDate: d.m28, filedDate: d.m22, status: 'filed', locations: '77 Harbor St, Apt 4, Riverbend, CA' },
  ];
  for (const w of list) await window.wrt.createWarrant({ ...base, ...w, warrantNumber: 'SW-' + w.warrantNumber });
}, { judge: JUDGE, d: { y: String(year), yy, m30: isoOffset(-30), m28: isoOffset(-28), m22: isoOffset(-22), m20: isoOffset(-20), m14: isoOffset(-14), m10: isoOffset(-10), m8: isoOffset(-8), m5: isoOffset(-5), m4: isoOffset(-4), m1: isoOffset(-1), p0: isoOffset(0), p2: isoOffset(2), p5: isoOffset(5), p9: isoOffset(9), p10: isoOffset(10) } });

// ---------- walkthrough GIF (recorded) ----------
await go('/dashboard', 1200);
await installCursor();
await page.mouse.move(mouse.x, mouse.y);
startRecording();
await wait(1800);
await glide(560, 330); await wait(700);
await glide(900, 420); await wait(700);

// 1. intake: drop the signed warrant, fields are read from the PDF
await clickOn(page.locator('button:has-text("Add Warrant")'));
await wait(900);
await clickOn(page.locator('.drop'));
await waitExtracted();
await wait(1200);
await page.evaluate(() => { document.getElementById('demo-cursor').style.visibility = 'hidden'; });
await shot('intake');
await page.evaluate(() => { document.getElementById('demo-cursor').style.visibility = 'visible'; });
await wait(800);
await typeInto(page.locator('.field', { hasText: 'Target(s)' }).locator('input'), 'John Michael Doe');
await wait(900);
await clickOn(page.locator('button:has-text("Save warrant")'));
await page.waitForSelector('.detail-head');
await wait(2200);

// 2. return: dates, property taken with saved text, live preview, signed .docx
await clickOn(page.locator('button:has-text("Generate return")'));
await page.waitForSelector('.wizard');
await wait(1000);
await page.locator('.field', { hasText: 'Search conducted on' }).locator('input').fill(isoOffset(-1));
await wait(1400);
await clickOn(page.locator('.modal-foot button:has-text("Next")'));
await wait(800);
await clickOn(page.locator('button:has-text("Add item")'));
const rows = page.locator('.wizard .item-row:not(.tiny)');
await typeInto(rows.nth(0).locator('input').nth(0), '1');
await typeInto(rows.nth(0).locator('textarea'), 'Certificate of authenticity (business records declaration)', 22);
await wait(700);
const sugg = page.locator('.wizard .callout.violet', { hasText: 'Electronic data from service provider' });
await clickOn(sugg.locator('button:has-text("Add")'));
await wait(2200);
await clickOn(page.locator('.modal-foot button:has-text("Next")'));
await wait(3400);
await glide(1000, 560, 22); await wait(1600);
await clickOn(page.locator('.modal-foot button:has-text("Generate")'));
await page.waitForSelector('text=Return generated', { timeout: 15000 });
await wait(2400);
await clickOn(page.locator('.modal-foot button:has-text("Done")'));
await wait(1600);

// 3. everything at a glance
await clickOn(page.locator('.nav-btn:has-text("Calendar")'));
await wait(2200);
await page.keyboard.press('Control+k');
await wait(500);
await page.keyboard.type('reyes', { delay: 90 });
await wait(1200);
await page.keyboard.press('Enter');
await wait(2400);
await stopRecording();
console.log('frames', rec.frames.length);

// ---------- static screenshots ----------
await page.evaluate(() => document.getElementById('demo-cursor')?.remove());
await page.mouse.move(1430, 890);
await go('/dashboard', 1200);
await shot('dashboard');
await go('/warrants', 900);
await shot('warrants');
await go('/calendar', 900);
await shot('calendar');
const wid = await page.evaluate(async (wn) => ((r) => (Array.isArray(r) ? r : r.data))(await window.wrt.listWarrants({ view: 'all' })).find((w) => w.warrantNumber === wn)?.id, WN).catch(() => null);
await go(`/warrant/${wid ?? 1}`, 1200);
await shot('warrant-detail');
await page.click('.tab:has-text("Documents")').catch(() => {});
await wait(1500);
await shot('warrant-documents');
await page.click('.tab:has-text("Activity")').catch(() => {});
await shot('warrant-activity');

await go('/warrants', 600);
const reyes = await page.evaluate(async () => ((r) => (Array.isArray(r) ? r : r.data))(await window.wrt.listWarrants({ view: 'all' })).find((w) => w.targets === 'Marcus Reyes')?.id).catch(() => null);
await go(`/warrant/${reyes ?? 2}`, 1200);
await page.click('button:has-text("Generate return")');
await page.waitForSelector('.wizard');
await page.locator('.field', { hasText: 'Search conducted on' }).locator('input').fill(isoOffset(-10));
await wait(1200);
await page.click('button:has-text("Next")');
await page.click('button:has-text("Add item")');
await rows.nth(0).locator('input').nth(0).fill('1');
await rows.nth(0).locator('textarea').fill('Apple iPhone 15, black, IMEI 350000000000002');
await rows.nth(0).locator('input').nth(1).fill('kitchen counter');
await page.click('button:has-text("Add item")');
await rows.nth(1).locator('input').nth(0).fill('3');
await rows.nth(1).locator('textarea').fill('plastic bags containing a white crystalline substance');
await rows.nth(1).locator('input').nth(1).fill('master bedroom dresser');
await page.locator('.wizard .callout.violet', { hasText: 'seized device' }).locator('button:has-text("Add")').click().catch(() => {});
await wait(900);
await shot('return-property');
await page.click('.wizard button:has-text("Saved text")');
await wait(300);
await shot('return-saved-text');
await page.click('.wizard button:has-text("Saved text")');
await page.click('button:has-text("Next")');
await wait(3000);
await shot('return-preview');
await page.keyboard.press('Escape');
await wait(500);

await go('/templates', 1300);
await shot('templates');
await go('/reports', 900);
await shot('reports');
await go('/settings/phrases', 700);
await shot('settings-saved-text');
await go('/settings/notifications', 700);
await shot('settings-reminders');
await go('/dashboard', 900);
await page.keyboard.press('Control+k');
await page.keyboard.type('snap', { delay: 40 });
await wait(500);
await shot('command-palette');
await page.keyboard.press('Escape');
await page.evaluate(async () => { const s = await window.wrt.getSettings(); s.app.theme = 'light'; await window.wrt.saveSettings(s); });
await page.evaluate(() => { location.hash = '/dashboard'; location.reload(); });
await wait(1800);
await shot('dashboard-light');
await page.evaluate(async () => { const s = await window.wrt.getSettings(); s.app.theme = 'dark'; await window.wrt.saveSettings(s); await window.wrt.setPin('2468'); });
await page.evaluate(() => location.reload());
await wait(1500);
await page.keyboard.press('Control+l');
await wait(600);
await shot('lock');
await app.evaluate(({ app: a }) => { a.exit(0); });

// ---------- assemble the GIF ----------
const list = rec.frames.slice(0, -1).map((fr, i) => `file '${fr.f.replace(/\\/g, '/')}'\nduration ${((rec.frames[i + 1].t - fr.t) / 1000).toFixed(3)}`);
list.push(`file '${rec.frames.at(-1).f.replace(/\\/g, '/')}'`);
writeFileSync(join(work, 'frames.txt'), list.join('\n'));
const gif = join(root, 'docs', 'walkthrough.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'frames.txt'),
  '-vf', 'fps=10,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  '-loop', '0', gif], { stdio: 'inherit' });
console.log('gif written', gif);
console.log('screenshots', readdirSync(shotsDir).length);
try { rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log(`could not remove ${work}`); }
process.exit(0);
