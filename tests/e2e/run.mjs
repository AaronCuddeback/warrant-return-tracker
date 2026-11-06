// End-to-end test: drives the real Electron app with Playwright against a throw-away data folder.
// Usage: node tests/e2e/run.mjs <outDir>
import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] || join(root, 'tests', 'e2e', 'out');
rmSync(out, { recursive: true, force: true });
const dataDir = join(out, 'data');
const docsDir = join(out, 'docs');
const shots = join(out, 'screens');
for (const d of [dataDir, docsDir, shots]) mkdirSync(d, { recursive: true });

// ---- a realistic text-based warrant PDF ----
function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 740;
  const content = ['BT', '/F1 11 Tf'];
  for (const l of lines) {
    content.push(`1 0 0 1 60 ${y} Tm (${esc(l)}) Tj`);
    y -= l === '' ? 10 : 18;
  }
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
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const warrantPdf = join(out, 'Signed Warrant SW-2026-0311.pdf');
writeFileSync(warrantPdf, makePdf([
  'SUPERIOR COURT OF CALIFORNIA, COUNTY OF EL DORADO',
  'SEARCH WARRANT AND AFFIDAVIT',
  '',
  'Search Warrant No.: SW-2026-0311',
  'Agency Case Number: 26-004417',
  '',
  'THE PEOPLE OF THE STATE OF CALIFORNIA TO ANY PEACE OFFICER IN THE COUNTY OF EL DORADO:',
  'Proof by affidavit having been made before me, you are commanded to search:',
  'Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, for records',
  'associated with the account jdoe.example@gmail.com.',
  'Suspect: John Michael Doe',
  '',
  'Date and time issued: March 2, 2026 at 10:42 AM',
  'Hon. Sarah K. Whitfield',
  'Judge of the Superior Court',
]));

const app = await electron.launch({
  executablePath: join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  env: { ...process.env, WRT_DATA_DIR: dataDir },
});
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') console.log('[renderer error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: join(shots, `${n}.png`) }); console.log('screenshot', n); };
const step = (s) => console.log('STEP', s);
const fails = [];
const expect = (cond, msg) => { if (!cond) { fails.push(msg); console.log('FAIL', msg); } else console.log('ok  ', msg); };

// Stub native dialogs / shell in the main process
await app.evaluate(({ dialog, shell }, { pdf, docs }) => {
  globalThis.__nextOpen = pdf;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__nextOpen] });
  dialog.showSaveDialog = async (_w, o) => {
    const opts = o || _w;
    const name = String(opts.defaultPath || 'out').split(/[\\/]/).pop();
    return { canceled: false, filePath: `${docs}\\${name}` };
  };
  shell.openPath = async () => '';
  shell.openExternal = async () => {};
}, { pdf: warrantPdf, docs: docsDir });

// ---------- setup wizard ----------
step('setup');
await page.waitForSelector('text=Welcome to Warrant Return Tracker');
await shot('01-setup-welcome');
await page.click('button:has-text("Continue")');
const fill = async (label, value) => page.locator('.field', { has: page.locator(`label:text-is("${label}")`) }).locator('input').first().fill(value);
await fill('Title / rank', 'Detective');
await page.locator('.field', { hasText: 'Full name' }).locator('input').fill('Aaron Cuddeback');
await fill('Badge / ID #', 'K1158');
await fill('Phone', '(530) 555-0142');
await page.locator('.field', { hasText: 'Agency name' }).locator('input').fill("El Dorado County Sheriff's Office");
await fill('Short name', 'EDSO');
await fill('Unit / division', 'High Tech Unit');
await page.locator('.field', { hasText: "County" }).first().locator('input').fill('El Dorado');
await page.locator('.field', { hasText: 'Court name' }).locator('input').fill('Superior Court of California, County of El Dorado');
await shot('02-setup-profile');
await page.click('button:has-text("Continue")');
await page.click('button:has-text("Start tracking")');
await page.waitForSelector('.kpis');
await shot('03-dashboard-empty');

// ---------- signature: draw, then import a scanned one ----------
step('signature');
await page.evaluate(() => { location.hash = '/settings/signature'; });
await page.click('button:has-text("Add signature")');
const pad = page.locator('.sig-paper canvas');
const box = await pad.boundingBox();
const sx = (f) => box.x + box.width * f;
const sy = (f) => box.y + box.height * f;
await page.mouse.move(sx(0.12), sy(0.62));
await page.mouse.down();
for (let i = 0; i <= 40; i++) await page.mouse.move(sx(0.12 + i * 0.012), sy(0.62 - Math.sin(i / 4) * 0.25), { steps: 2 });
await page.mouse.up();
await page.mouse.move(sx(0.62), sy(0.35));
await page.mouse.down();
for (let i = 0; i <= 25; i++) await page.mouse.move(sx(0.62 + i * 0.012), sy(0.35 + (i % 6) * 0.05), { steps: 2 });
await page.mouse.up();
await shot('03a-signature-draw');
await page.click('.modal-foot button:has-text("Save signature")');
await page.waitForSelector('.sig-show img');
const sigImport = join(root, 'office-templates', 'my-signature.png');
if (existsSync(sigImport)) {
  await page.click('button:has-text("Replace signature")');
  await page.click('.seg button:has-text("Import image")');
  await page.setInputFiles('input[type=file]', sigImport);
  await page.waitForTimeout(800);
  await shot('03b-signature-import');
  await page.click('.modal-foot button:has-text("Save signature")');
  await page.waitForTimeout(600);
}
await shot('03c-signature-settings');
const hasSig = await page.evaluate(async () => !!(await window.wrt.getSignature()));
expect(hasSig, 'signature stored (encrypted)');
expect(!existsSync(join(dataDir, 'signature.png')) && existsSync(join(dataDir, 'signature.bin')), 'signature stored encrypted, not as a plain PNG');

// ---------- intake from PDF ----------
step('intake');
await page.click('button:has-text("Add Warrant")');
await page.click('.drop');
await page.waitForSelector('text=pre-filled', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
const wn = await page.locator('.field', { hasText: 'Search warrant #' }).locator('input').inputValue();
const cn = await page.locator('.field', { hasText: 'Case / report #' }).locator('input').inputValue();
const judge = await page.locator('.field', { hasText: 'Issuing judge' }).locator('input').inputValue();
const signed = await page.locator('.field', { hasText: 'Signed / issued' }).locator('input').inputValue();
expect(wn === 'SW-2026-0311', `extracted warrant # (${wn})`);
expect(cn === '26-004417', `extracted case # (${cn})`);
expect(judge.includes('Sarah K. Whitfield'), `extracted judge (${judge})`);
expect(signed === '2026-03-02', `extracted signed date (${signed})`);
const provider = await page.locator('.field', { hasText: 'Service provider' }).locator('input').inputValue().catch(() => '');
expect(provider === 'Google LLC', `detected provider (${provider})`);
const scope = await page.locator('.field', { hasText: 'Accounts / devices / records' }).locator('textarea').inputValue();
expect(scope.includes('jdoe.example@gmail.com') && !scope.includes('Amphitheatre'), `scope is the target account, not provider HQ (${scope})`);
await page.locator('.field', { hasText: 'Target(s)' }).locator('input').fill('John Michael Doe');
await shot('04-intake-extracted');
await page.click('button:has-text("Save warrant")');
await page.waitForSelector('.detail-head');
await shot('05-detail');

// ---------- amendment ----------
step('amendment');
const amendPdf = join(out, 'Amendment 1 SW-2026-0311.pdf');
writeFileSync(amendPdf, makePdf(['AMENDMENT TO SEARCH WARRANT SW-2026-0311', 'Adds Google Drive and Photos content for the account.', 'Hon. Sarah K. Whitfield', 'March 5, 2026']));
await app.evaluate((_e, p) => { globalThis.__nextOpen = p; }, amendPdf);
const dueBefore = await page.evaluate(() => window.wrt.getWarrant(1).then((w) => w.returnDueDate));
await page.click('.detail-head button:has-text("Amend")');
await page.locator('.modal .field', { hasText: 'Amendment signed on' }).locator('input').fill('2026-03-05');
await page.locator('.modal .field', { hasText: 'What the amendment changes' }).locator('textarea').fill('Adds Google Drive and Google Photos content to the records sought.');
await page.locator('.modal .field', { hasText: 'Added places' }).locator('textarea').fill('Google Drive and Google Photos content for jdoe.example@gmail.com');
await page.click('.modal label:has-text("Restart from amendment date")');
await page.click('.modal .drop');
await page.waitForTimeout(300);
await shot('05a-amendment-modal');
await page.click('.modal-foot button:has-text("Record amendment")');
await page.waitForTimeout(800);
await shot('05b-amended-detail');
const afterAmend = await page.evaluate(() => window.wrt.getWarrant(1));
expect(afterAmend.amendments.length === 1, 'amendment recorded');
expect(afterAmend.returnDueDate === '2026-03-15' && dueBefore === '2026-03-12', `due date restarted from amendment (${dueBefore} -> ${afterAmend.returnDueDate})`);
expect(afterAmend.locations.includes('As amended (Amendment 1'), 'amended scope added to places searched');
const atts = await page.evaluate(() => window.wrt.listAttachments(1));
expect(atts.some((a) => a.kind === 'amendment'), 'signed amendment attached');
await app.evaluate((_e, p) => { globalThis.__nextOpen = p; }, warrantPdf);

// ---------- generate return ----------
step('return');
await page.click('button:has-text("Generate return")');
await page.waitForSelector('.wizard');
await page.locator('.field', { hasText: 'Search conducted on' }).locator('input').fill('2026-03-09');
const prefilled = await page.locator('.wizard textarea').first().inputValue();
expect(prefilled.includes('jdoe.example@gmail.com') && prefilled.includes('As amended (Amendment 1'), 'wizard pre-fills places searched incl. amendment');
await page.click('button:has-text("Next")');
await page.click('button:has-text("Add item")');
let rows = page.locator('.wizard .item-row:not(.tiny)');
await rows.nth(0).locator('input').nth(0).fill('1');
await rows.nth(0).locator('textarea').fill('Digital storage media containing Google account records (subscriber, location history, Drive)');
await rows.nth(0).locator('input').nth(1).fill('provider portal');
await page.click('button:has-text("Add item")');
await rows.nth(1).locator('input').nth(0).fill('2');
await rows.nth(1).locator('textarea').fill('certificates of authenticity');
// saved text: provider warrant -> standard electronic-data language is suggested
const sugg = page.locator('.wizard .callout.violet', { hasText: 'Electronic data from service provider' });
expect(await sugg.count() === 1, 'provider-data language suggested for a provider warrant');
await shot('06p-saved-text-suggestion');
await sugg.locator('button:has-text("Add")').click();
await page.waitForTimeout(300);
const rowTexts = await page.locator('.wizard .item-row textarea').evaluateAll((els) => els.map((e) => e.value));
expect(rowTexts.some((t) => t.startsWith('Digital data, records, and information associated with the target account(s)')), 'saved text inserted as an inventory item');
expect(await page.locator('.wizard .callout.violet', { hasText: 'Electronic data from service provider' }).count() === 0, 'suggestion hidden once added');
await page.click('.wizard button:has-text("Saved text")');
await page.waitForTimeout(200);
expect(await page.locator('.phrase-menu .phrase-item', { hasText: 'Electronic data from seized device(s)' }).count() === 1, 'seized-device language available in the Saved text menu');
expect(await page.locator('.wizard .callout.violet', { hasText: 'Electronic data from seized device(s)' }).count() === 0, 'seized-device language not suggested for a provider warrant');
await shot('06q-saved-text-menu');
await page.click('.wizard button:has-text("Saved text")');
await page.click('button:has-text("Next")');
await page.waitForTimeout(2500);
const signToggle = await page.locator('.wizard label:has-text("Sign with my saved signature") input').isChecked().catch(() => false);
expect(signToggle, 'wizard offers signing, on by default');
await shot('06-wizard-preview');
await page.click('button:has-text("Generate & save .docx")');
await page.waitForSelector('text=Return generated', { timeout: 15000 });
await shot('07-return-saved');
const files = readdirSync(docsDir).filter((f) => f.endsWith('.docx'));
expect(files.length === 1, `return .docx saved (${files.join(', ')})`);
if (files[0]) {
  const xml = new PizZip(readFileSync(join(docsDir, files[0]))).file('word/document.xml').asText();
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  expect(text.includes('I RECEIVED SAID WARRANT ON THE 2ND DAY OF MARCH, 2026'), 'return has received date from warrant');
  expect(text.includes('ON MARCH 9, 2026, SEARCHED'), 'return has search date');
  expect(text.includes('I, DETECTIVE AARON CUDDEBACK, THE UNDERSIGNED'), 'return has officer from profile');
  expect(text.includes('#K1158'), 'return has badge');
  expect(text.includes('SEARCH WARRANT# SW-2026-0311'), 'return has warrant #');
  expect(text.includes('2. Two (2) certificates of authenticity'), 'return has itemized inventory');
  expect(text.includes('3. Digital data, records, and information associated with the target account(s), identifier(s), device(s), telephone number(s), and/or IP address(es)') && text.includes('produced by the service provider pursuant to the search warrant.'), 'return has the saved provider-data language');
  expect(!/DECEMBER/.test(text), 'no stale December 2023 dates');
  const zipOut = new PizZip(readFileSync(join(docsDir, files[0])));
  expect(zipOut.file('word/document.xml').asText().includes('rIdWrtSignature') && !!zipOut.file('word/media/wrt-signature.png'), 'return contains the signature image');
  expect(text.includes('As amended (Amendment 1, signed March 5, 2026)'), 'return lists the amended scope');
  writeFileSync(join(out, 'return-text.txt'), text);
}
await page.click('.modal-foot button:has-text("Done")');
await page.waitForTimeout(500);
expect(await page.locator('.detail-head .badge:has-text("Filed")').count() > 0, 'warrant marked filed after return');
await page.click('.tab:has-text("Activity")');
await shot('08-activity');
await page.click('.tab:has-text("Documents")');
await page.waitForTimeout(1500);
await shot('09-documents');

// ---------- more data for dashboard / calendar ----------
step('seed');
await page.evaluate(async () => {
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const base = { warrantType: 'premises', targets: '', judge: 'Hon. Sarah K. Whitfield', court: '', receivedDate: null, executedDate: null, dueRule: '', locations: '', provider: '', items: [], itemsText: '', investigationNature: '', notes: '', assignedTo: 'Det. Cuddeback', tags: '', status: 'pending', notificationRequired: false, notificationServedDate: null, filedDate: null, snoozeUntil: null };
  const list = [
    { warrantNumber: 'SW-2026-0290', caseNumber: '26-003901', targets: 'Marcus Reyes', signedDate: iso(-14), returnDueDate: iso(-4), status: 'executed', executedDate: iso(-10), tags: 'narcotics' },
    { warrantNumber: 'SW-2026-0301', caseNumber: '26-004002', targets: 'Apple iCloud - jlee@icloud.com', warrantType: 'provider', provider: 'Apple Inc.', signedDate: iso(-10), returnDueDate: iso(0), notificationRequired: true, executedDate: iso(-8), status: 'executed', investigationNature: 'distribution of CSAM (PC 311.2)' },
    { warrantNumber: 'SW-2026-0305', caseNumber: '26-004100', targets: 'Kayla Brooks', signedDate: iso(-8), returnDueDate: iso(2), warrantType: 'vehicle', locations: '2019 Toyota Tacoma CA 8ABC123' },
    { warrantNumber: 'SW-2026-0308', caseNumber: '26-004150', targets: 'Devon Clarke', signedDate: iso(-5), returnDueDate: iso(5), warrantType: 'device', notificationRequired: true },
    { warrantNumber: 'SW-2026-0313', caseNumber: '26-004501', targets: 'Unknown - Snapchat user "dk_wolf22"', warrantType: 'provider', provider: 'Snap Inc.', signedDate: iso(-1), returnDueDate: iso(9) },
    { warrantNumber: 'SW-2026-0314', caseNumber: '26-004533', targets: 'Tyler Nguyen', signedDate: iso(0), returnDueDate: iso(10), locations: '4410 Pleasant Valley Rd, Placerville, CA' },
  ];
  for (const w of list) await window.wrt.createWarrant({ ...base, ...w });
});
await page.evaluate(() => { location.hash = '/dashboard'; });
await page.waitForTimeout(1200);
await shot('10-dashboard');
const kOver = await page.locator('.kpi', { hasText: 'Overdue' }).locator('.v').innerText();
expect(kOver === '1', `dashboard overdue count (${kOver})`);

await page.evaluate(() => { location.hash = '/warrants'; });
await page.waitForTimeout(800);
await shot('11-warrants');
await page.evaluate(() => { location.hash = '/calendar'; });
await page.waitForTimeout(800);
await shot('12-calendar');
await page.evaluate(() => { location.hash = '/templates'; });
await page.waitForTimeout(1200);
await shot('13-templates');
await page.evaluate(() => { location.hash = '/reports'; });
await page.waitForTimeout(800);
await shot('14-reports');
await page.evaluate(() => { location.hash = '/settings/phrases'; });
await page.waitForTimeout(500);
await shot('15p-settings-saved-text');
await page.evaluate(() => { location.hash = '/settings/notifications'; });
await page.waitForTimeout(600);
await shot('15-settings');

// reminders
step('reminders');
const sent = await page.evaluate(() => window.wrt.runReminderCheck());
expect((sent.data ?? 0) >= 4, `reminder check delivered ${sent.data} reminders`);
const again = await page.evaluate(() => window.wrt.runReminderCheck());
expect((again.data ?? 0) === 0, `second check sends nothing new (${again.data})`);

// palette
await page.keyboard.press('Control+k');
await page.keyboard.type('reyes');
await page.waitForTimeout(400);
await shot('16-palette');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await shot('17-overdue-detail');

// light theme
await page.evaluate(async () => { const s = await window.wrt.getSettings(); s.app.theme = 'light'; await window.wrt.saveSettings(s); });
await page.evaluate(() => { location.hash = '/dashboard'; location.reload(); });
await page.waitForTimeout(1800);
await shot('18-dashboard-light');

// lock screen
await page.evaluate(async () => { await window.wrt.setPin('2468'); });
await page.evaluate(() => location.reload());
await page.waitForTimeout(1500);
await page.keyboard.press('Control+l');
await page.waitForTimeout(500);
await shot('19-lock');
await page.fill('.pin', '2468');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
expect(await page.locator('.lock').count() === 0, 'PIN unlocks');

// exports
step('exports');
const r1 = await page.evaluate(() => window.wrt.docketPdf({ view: 'active' }));
const r2 = await page.evaluate(() => window.wrt.exportCsv({ view: 'all' }));
const r3 = await page.evaluate(() => window.wrt.exportFullBackup());
const r4 = await page.evaluate(() => window.wrt.casePacket(1));
const r5 = await page.evaluate(() => window.wrt.exportIcs('pending'));
expect(r1.ok && r2.ok && r3.ok && r4.ok && r5.ok, `exports ok ${JSON.stringify([r1, r2, r3, r4, r5].map((r) => r.ok || r.error))}`);
console.log('docs:', readdirSync(docsDir));

await app.evaluate(({ app }) => { app.exit(0); });
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n - ${fails.join('\n - ')}` : '\nALL E2E CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
