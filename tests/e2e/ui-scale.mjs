// Checks the display size setting in the real app: Settings buttons, Ctrl + / - / 0,
// that an unsaved Settings draft can't undo it, and that it is remembered after a restart.
// Usage: npm run build && node tests/e2e/ui-scale.mjs
import { _electron as electron } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'tests', 'e2e', 'out-scale');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'data'), { recursive: true });
const fails = [];
const expect = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails.push(m); };

async function launch() {
  const app = await electron.launch({ executablePath: join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [root], env: { ...process.env, WRT_DATA_DIR: join(out, 'data') } });
  const page = await app.firstWindow();
  await page.waitForTimeout(300);
  return { app, page };
}
const zoomOf = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
const savedScale = (page) => page.evaluate(async () => (await window.wrt.getSettings()).app.uiScale);
const near = (a, b) => Math.abs(a - b) < 0.01;

let { app, page } = await launch();
await page.waitForSelector('text=Welcome to Warrant Return Tracker');
await page.click('button:has-text("Continue")');
await page.locator('.field', { hasText: 'Full name' }).locator('input').fill('Test Officer');
await page.locator('.field', { hasText: 'Agency name' }).locator('input').fill('Test Agency');
await page.locator('.field', { hasText: 'County' }).first().locator('input').fill('Test');
await page.locator('.field', { hasText: 'Court name' }).locator('input').fill('Test Court');
await page.click('button:has-text("Continue")');
await page.click('button:has-text("Start tracking")');
await page.waitForSelector('.kpis');
expect(near(await zoomOf(app), 1), 'starts at 100%');

await page.evaluate(() => { location.hash = '/settings/app'; });
await page.waitForSelector('.size-opts');
await page.screenshot({ path: join(out, '1-settings-100.png') });
const widthAt100 = await page.evaluate(() => document.querySelector('.nav-btn').getBoundingClientRect().width * window.devicePixelRatio);
await page.click('.size-opt:has-text("150%")');
await page.waitForTimeout(600);
expect(near(await zoomOf(app), 1.5), `150% button zooms the window (${await zoomOf(app)})`);
expect(near(await savedScale(page), 1.5), 'and saves the setting');
expect(await page.locator('.size-opt.on').innerText().then((t) => t.includes('150%')), '150% shown as selected');
const widthAt150 = await page.evaluate(() => document.querySelector('.nav-btn').getBoundingClientRect().width * window.devicePixelRatio);
expect(widthAt150 > widthAt100 * 1.4, `on-screen size grows (${widthAt100.toFixed(0)} -> ${widthAt150.toFixed(0)} device px)`);
await page.screenshot({ path: join(out, '2-settings-150.png') });
const room = await page.evaluate(() => innerWidth);
const work = await app.evaluate(({ screen, BrowserWindow }) => screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea.width);
expect(room >= Math.min(1024, Math.floor(work / 1.5)) - 2, `window grows to keep the layout's room (${room} of 1024 needed, screen ${work})`);
await page.click('.size-opt:has-text("200%")');
await page.waitForTimeout(900);
await page.screenshot({ path: join(out, '2b-settings-200.png') });
const room200 = await page.evaluate(() => ({ w: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
console.log('     at 200%:', room200);
await page.click('.size-opt:has-text("150%")');
await page.waitForTimeout(600);

await page.keyboard.press('Control+Equal');
await page.waitForTimeout(500);
expect(near(await zoomOf(app), 1.75) && near(await savedScale(page), 1.75), `Ctrl + makes it larger (${await zoomOf(app)})`);
await page.keyboard.press('Control+Minus');
await page.keyboard.press('Control+Minus');
await page.waitForTimeout(500);
expect(near(await zoomOf(app), 1.25) && near(await savedScale(page), 1.25), `Ctrl - makes it smaller (${await zoomOf(app)})`);
expect(await page.locator('.size-opt.on').innerText().then((t) => t.includes('125%')), 'Settings shows the size chosen from the keyboard');

// an unsaved Settings draft must not put the old size back
await page.evaluate(() => { location.hash = '/settings/profile'; });
await page.waitForTimeout(400);
await page.locator('.field', { hasText: 'Phone' }).locator('input').fill('(555) 010-0000');
await page.keyboard.press('Control+Equal');
await page.waitForTimeout(400);
await page.click('button:has-text("Save settings")');
await page.waitForTimeout(600);
expect(near(await savedScale(page), 1.5) && near(await zoomOf(app), 1.5), `saving other settings keeps the display size (${await savedScale(page)})`);
expect(await page.evaluate(async () => (await window.wrt.getSettings()).profile.phone) === '(555) 010-0000', 'and still saves the other change');

await page.evaluate(() => { location.hash = '/dashboard'; });
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, '3-dashboard-150.png') });
const overlay = await page.evaluate(() => navigator.windowControlsOverlay?.getTitlebarAreaRect?.().height ?? null);
expect(overlay === null || Math.abs(overlay - 40) < 2, `window controls match the 40px title bar at 150% (${overlay})`);

await page.keyboard.press('Control+0');
await page.waitForTimeout(400);
expect(near(await zoomOf(app), 1), 'Ctrl 0 returns to 100%');
await page.keyboard.press('Control+Equal');
await page.keyboard.press('Control+Equal');
await page.keyboard.press('Control+Equal');
await page.waitForTimeout(400);
expect(near(await savedScale(page), 1.5), 'three steps up from 100% is 150% (110, 125, 150)');
await app.evaluate(({ app: a }) => a.exit(0));
await new Promise((r) => setTimeout(r, 1500));

({ app, page } = await launch());
await page.waitForSelector('.kpis');
await page.waitForTimeout(800);
expect(near(await zoomOf(app), 1.5), `remembered after restart (${await zoomOf(app)})`);
await app.evaluate(({ app: a }) => a.exit(0));
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL DISPLAY SIZE CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
