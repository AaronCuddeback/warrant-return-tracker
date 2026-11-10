// IPC handlers. The renderer has no Node access; everything goes through this allow-listed surface.
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import PizZip from 'pizzip';
import * as repo from './repo';
import * as tpl from './templates';
import { renderDocx, fileNameFromPattern, usesSignature, imageSize, type SignatureImage } from './render';
import { getSettings, saveSettings, setSmtpPassword, setPin, verifyPin, setSignature, getSignaturePng } from './settings';
import { buildTemplateData, sampleWarrant, FIELD_CATALOG } from '../shared/fields';
import { checkNow, sendReminderNow, desktopNotify } from './reminders';
import { verifySmtp, sendMail } from './email';
import { buildIcs } from './ics';
import { warrantsCsv, auditCsv, docketHtml, caseSummaryHtml, htmlToPdf, casePacket } from './reports';
import { snapshot, fullBackup, restoreFull } from './backup';
import { importV1 } from './importV1';
import { DATA_DIR, PORTABLE, LOGO_FILE, v1DbPath } from './paths';
import { tx } from './db';
import { todayISO } from '../shared/dates';
import { log } from './log';
import { clampUiScale } from '../shared/types';
import type { Api, AmendmentInput, AttachmentKind, GenerateRequest, Result, Settings, TemplateInfo, TemplateKind, Warrant, WarrantFilter, WarrantInput, WarrantStatus } from '../shared/types';

type Handlers = { [K in keyof Api]?: (...args: Parameters<Api[K]>) => unknown };

let win: () => BrowserWindow | null = () => null;
let onSettingsChanged: (s: Settings) => void = () => {};

const ok = <T>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function saveDialog(defaultName: string, filters: Electron.FileFilter[], dir?: string) {
  const w = win();
  const opts = { defaultPath: join(dir || app.getPath('documents'), defaultName), filters };
  const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
  return r.canceled || !r.filePath ? null : r.filePath;
}

async function openDialog(filters?: Electron.FileFilter[], multi = false) {
  const w = win();
  const opts: Electron.OpenDialogOptions = { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters };
  const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
  return r.canceled ? [] : r.filePaths;
}

function uniquePath(p: string) {
  if (!existsSync(p)) return p;
  const ext = extname(p);
  const base = p.slice(0, -ext.length);
  for (let i = 2; ; i++) {
    const c = `${base} (${i})${ext}`;
    if (!existsSync(c)) return c;
  }
}

async function generate(req: GenerateRequest): Promise<Result<{ filePath?: string; attachmentId?: number; bytes?: Uint8Array; sha256: string }>> {
  const w = repo.getWarrant(req.warrantId);
  if (!w) throw new Error('Warrant not found');
  const t = tpl.getTemplate(req.templateId);
  if (!t) throw new Error('Template not found');
  const merged: Warrant = { ...w, ...req.patch } as Warrant;
  const s = getSettings();
  const data = buildTemplateData(merged, s, req.extra);
  const sig = signatureFor(req.sign);
  const receipts = receiptsFor(req, w.id);
  const bytes = renderDocx(tpl.readTemplate(t), data, t.mapping, sig, receipts.flatMap((r) => r.pages));
  if (req.preview) return ok({ bytes: new Uint8Array(bytes), sha256: repo.sha256(bytes) });

  const fileName = fileNameFromPattern(t.outputPattern, data, `${t.kind}-${w.warrantNumber || w.id}`);
  let target: string | null;
  if (s.app.askWhereToSave || !s.app.outputFolder) {
    target = await saveDialog(fileName, [{ name: 'Word Document', extensions: ['docx'] }], s.app.outputFolder || undefined);
    if (!target) return { ok: false, canceled: true };
  } else {
    mkdirSync(s.app.outputFolder, { recursive: true });
    target = uniquePath(join(s.app.outputFolder, fileName));
  }
  writeFileSync(target, bytes);

  // Save confirmed details back to the warrant (audited field-by-field)
  if (req.patch && Object.keys(req.patch).length) repo.updateWarrant(w.id, req.patch, `confirmed while generating ${t.name}`);
  const kind: AttachmentKind = t.kind === 'return' ? 'return' : t.kind === 'notification' ? 'notification' : 'other';
  const attachmentId = tx(() => {
    const id = repo.storeAttachmentBytes(w.id, kind, fileName, bytes, true, t.name);
    if (sig && usesSignature(tpl.readTemplate(t))) repo.audit(w.id, 'sign', `Stored signature applied to ${fileName}`);
    let page = 2;
    for (const r of receipts) {
      const n = r.pages.length;
      const range = n > 1 ? `pages ${page}-${page + n - 1}` : `page ${page}`;
      repo.audit(w.id, 'receipt', `Property receipt ${r.att.originalName} added to ${fileName} as ${range}`, { sha256: r.att.sha256 });
      page += n;
    }
    return id;
  });
  if (t.kind === 'return' && req.markFiled) repo.setStatus(w.id, 'filed');
  if (t.kind === 'notification' && req.markNoticeServed && !merged.notificationServedDate) {
    repo.updateWarrant(w.id, { notificationServedDate: merged.executedDate || todayISO() }, undefined, 'notice');
  }
  return ok({ filePath: target, attachmentId, sha256: repo.sha256(bytes) });
}

const MAX_RECEIPT_PAGES = 60; // all receipts together
const MAX_RECEIPT_BYTES = 160 * 1024 * 1024;

/** Validates the receipt pages sent by the wizard against the warrant's stored attachments, keeping their order. */
function receiptsFor(req: GenerateRequest, warrantId: number) {
  const list = Array.isArray(req.receipts) ? req.receipts : [];
  const seen = new Set<number>();
  const out = list.map((r) => {
    const att = repo.getAttachment(Number(r.attachmentId));
    if (!att || att.warrantId !== warrantId || att.kind !== 'receipt') throw new Error('A property receipt is not attached to this warrant.');
    if (seen.has(att.id)) throw new Error(`${att.originalName} is listed twice.`);
    seen.add(att.id);
    const pages = (Array.isArray(r.pages) ? r.pages : []).map((p) => Buffer.from(p));
    if (!pages.length) throw new Error(`${att.originalName} has no pages to add.`);
    for (const p of pages) imageSize(p); // throws unless PNG/JPEG
    return { att, pages };
  });
  const pageCount = out.reduce((n, r) => n + r.pages.length, 0);
  if (pageCount > MAX_RECEIPT_PAGES) throw new Error(`The property receipts have ${pageCount} pages; at most ${MAX_RECEIPT_PAGES} can be added to a return.`);
  if (out.reduce((n, r) => n + r.pages.reduce((m, p) => m + p.length, 0), 0) > MAX_RECEIPT_BYTES) throw new Error('The property receipts are too large to add to the return.');
  return out;
}

/** Height of the window-controls overlay, matching the app's 40px title bar at the current display size. */
export function titleBarHeight() {
  return Math.round(40 * clampUiScale(getSettings().app.uiScale));
}

function signatureFor(sign: boolean | undefined): SignatureImage | null {
  const s = getSettings();
  if (sign === false || (sign === undefined && !s.signature.useByDefault)) return null;
  const png = getSignaturePng();
  return png ? { png, widthInches: s.signature.widthInches } : null;
}

const handlers: Handlers = {
  appInfo: () => ({
    version: app.getVersion(),
    dataDir: DATA_DIR,
    portable: PORTABLE,
    user: repo.currentUser(),
    platform: process.platform,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    v1DataFound: existsSync(v1DbPath()) ? v1DbPath() : null,
  }),
  getSettings: () => getSettings(),
  saveSettings: (s: Settings) => {
    try {
      // Display size is changed only through setUiScale / the keyboard, never by an older settings draft.
      s.app.uiScale = getSettings().app.uiScale;
      saveSettings(s);
      onSettingsChanged(s);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  setSmtpPassword: (pw: string) => {
    try {
      setSmtpPassword(pw);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  setPin: (pin: string | null) => {
    try {
      if (pin && !/^\d{4,12}$/.test(pin)) throw new Error('PIN must be 4-12 digits.');
      setPin(pin);
      tx(() => repo.audit(null, 'security', pin ? 'App lock PIN set' : 'App lock PIN removed'));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  verifyPin: (pin: string) => verifyPin(pin),
  setSignature: (png: Uint8Array | null) => {
    try {
      setSignature(png);
      tx(() => repo.audit(null, 'security', png ? 'Signature image saved' : 'Signature image removed'));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  getSignature: () => {
    const png = getSignaturePng();
    return png ? `data:image/png;base64,${png.toString('base64')}` : null;
  },
  templateUsesSignature: (id: string) => {
    const t = tpl.getTemplate(id);
    try {
      return t ? usesSignature(tpl.readTemplate(t)) : false;
    } catch {
      return false;
    }
  },

  listWarrants: (f: WarrantFilter) => repo.listWarrants(f),
  getWarrant: (id: number) => repo.getWarrant(id),
  createWarrant: (w: WarrantInput, p?: string | null) => {
    try {
      return ok(repo.createWarrant(w, p));
    } catch (e) {
      return fail(e);
    }
  },
  updateWarrant: (id: number, patch: Partial<WarrantInput>, reason?: string) => {
    try {
      repo.updateWarrant(id, patch, reason);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  setStatus: (id: number, st: WarrantStatus) => wrap(() => repo.setStatus(id, st)),
  extendDueDate: (id: number, d: string, reason: string) => wrap(() => repo.extendDueDate(id, d, reason)),
  snooze: (id: number, until: string | null) => wrap(() => repo.updateWarrant(id, { snoozeUntil: until }, undefined, 'snooze')),
  trashWarrant: (id: number) => wrap(() => repo.trashWarrant(id)),
  restoreWarrant: (id: number) => wrap(() => repo.restoreWarrant(id)),
  purgeWarrant: (id: number) => wrap(() => repo.purgeWarrant(id)),
  findDuplicates: (wn: string, cn: string, ex?: number) => repo.findDuplicates(wn, cn, ex),
  stats: () => repo.stats(),

  listAttachments: (id: number) => repo.listAttachments(id),
  addAttachments: async (id: number, kind: AttachmentKind, paths?: string[]) => {
    try {
      const filters = kind === 'receipt'
        ? [{ name: 'Property receipt (PDF or image)', extensions: ['pdf', 'jpg', 'jpeg', 'png'] }]
        : [{ name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'txt', 'zip', 'csv', 'xlsx'] }, { name: 'All files', extensions: ['*'] }];
      const list = paths?.length ? paths : await openDialog(filters, true);
      if (!list.length) return { ok: false, canceled: true };
      return ok(repo.addAttachments(id, kind, list));
    } catch (e) {
      return fail(e);
    }
  },
  readAttachment: (id: number) => {
    const a = repo.getAttachment(id);
    if (!a) return null;
    const p = repo.attachmentPath(a);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  },
  saveAttachmentAs: async (id: number) => {
    try {
      const a = repo.getAttachment(id);
      if (!a) throw new Error('Attachment not found');
      const target = await saveDialog(a.originalName, [{ name: 'All files', extensions: ['*'] }], app.getPath('downloads'));
      if (!target) return { ok: false, canceled: true };
      writeFileSync(target, readFileSync(repo.attachmentPath(a)));
      tx(() => repo.audit(a.warrantId, 'export', `Exported ${a.originalName}`, { to: target, sha256: a.sha256 }));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  openAttachment: async (id: number) => {
    try {
      const a = repo.getAttachment(id);
      if (!a) throw new Error('Attachment not found');
      // Open a temp copy so the stored evidence copy is never modified by Word/Acrobat
      const dir = join(app.getPath('temp'), 'WarrantReturnTracker');
      mkdirSync(dir, { recursive: true });
      const p = uniquePath(join(dir, a.originalName));
      writeFileSync(p, readFileSync(repo.attachmentPath(a)));
      const err = await shell.openPath(p);
      if (err) throw new Error(err);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  removeAttachment: (id: number) => wrap(() => repo.removeAttachment(id)),
  verifyAttachment: (id: number) => {
    try {
      return ok(repo.verifyAttachment(id));
    } catch (e) {
      return fail(e);
    }
  },
  pickFile: async (filters?: Electron.FileFilter[]) => (await openDialog(filters))[0] ?? null,
  readFileBytes: (p: string) => {
    try {
      return new Uint8Array(readFileSync(p));
    } catch {
      return null;
    }
  },

  audit: (id: number | null, limit?: number) => repo.listAudit(id, limit),
  listAmendments: (id: number) => repo.listAmendments(id),
  saveAmendment: (a: AmendmentInput, p?: string | null) => {
    try {
      return ok(repo.saveAmendment(a, p));
    } catch (e) {
      return fail(e);
    }
  },
  deleteAmendment: (id: number) => wrap(() => repo.deleteAmendment(id)),

  listTemplates: () => tpl.listTemplates(),
  importTemplate: async (kind: TemplateKind, p?: string) => {
    try {
      const path = p || (await openDialog([{ name: 'Word template', extensions: ['docx'] }]))[0];
      if (!path) return { ok: false, canceled: true };
      return ok(tpl.importTemplate(kind, path));
    } catch (e) {
      return fail(e);
    }
  },
  updateTemplate: (t: TemplateInfo) => wrap(() => tpl.updateTemplate(t)),
  replaceTemplateFile: async (id: string) => {
    try {
      const path = (await openDialog([{ name: 'Word template', extensions: ['docx'] }]))[0];
      if (!path) return { ok: false, canceled: true };
      tpl.replaceTemplateFile(id, path);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  deleteTemplate: (id: string) => wrap(() => tpl.deleteTemplate(id)),
  duplicateTemplate: (id: string) => {
    try {
      return ok(tpl.duplicateTemplate(id));
    } catch (e) {
      return fail(e);
    }
  },
  inspectTemplate: (id: string) => tpl.inspectTemplate(id),
  exportTemplate: async (id: string) => {
    try {
      const t = tpl.getTemplate(id);
      if (!t) throw new Error('Template not found');
      const target = await saveDialog(`${t.name}.docx`.replace(/[<>:"/\\|?*]/g, '_'), [{ name: 'Word template', extensions: ['docx'] }]);
      if (!target) return { ok: false, canceled: true };
      writeFileSync(target, tpl.readTemplate(t));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  testTemplate: async (id: string) => {
    try {
      const t = tpl.getTemplate(id);
      if (!t) throw new Error('Template not found');
      const bytes = renderDocx(tpl.readTemplate(t), buildTemplateData(sampleWarrant(), getSettings()), t.mapping, signatureFor(undefined));
      const dir = join(app.getPath('temp'), 'WarrantReturnTracker');
      mkdirSync(dir, { recursive: true });
      const p = uniquePath(join(dir, `TEST - ${t.name}.docx`.replace(/[<>:"/\\|?*]/g, '_')));
      writeFileSync(p, bytes);
      const err = await shell.openPath(p);
      if (err) throw new Error(err);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  templateFieldCatalog: () => FIELD_CATALOG,
  generateDocument: async (req: GenerateRequest) => {
    try {
      return await generate(req);
    } catch (e) {
      return fail(e);
    }
  },

  sendTestEmail: async () => {
    try {
      await verifySmtp();
      await sendMail('Warrant Return Tracker - test email', '<p>Your email reminders are configured correctly.</p>', 'Your email reminders are configured correctly.');
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  sendReminderNow: async (id: number) => {
    try {
      await sendReminderNow(id);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  runReminderCheck: async () => ok(await checkNow()),
  testDesktopNotification: () => (desktopNotify('Warrant Return Tracker', 'Desktop notifications are working.') ? ok() : fail('Desktop notifications are not supported or are blocked by policy on this computer.')),
  exportIcs: async (ids: number[] | 'pending') => {
    try {
      const list = ids === 'pending' ? repo.listWarrants({ view: 'active' }) : ids.map((i) => repo.getWarrant(i)).filter((w): w is Warrant => !!w);
      if (!list.length) throw new Error('No warrants to export.');
      const s = getSettings();
      const name = list.length === 1 ? `Warrant return ${list[0].warrantNumber || list[0].caseNumber}.ics` : `Warrant returns ${todayISO()}.ics`;
      const target = await saveDialog(name.replace(/[<>:"/\\|?*]/g, '_'), [{ name: 'Calendar', extensions: ['ics'] }]);
      if (!target) return { ok: false, canceled: true };
      writeFileSync(target, buildIcs(list, s.notifications.leadTimes, s.profile.agencyName));
      tx(() => list.forEach((w) => repo.audit(w.id, 'calendar', 'Exported to calendar (.ics)')));
      void shell.openPath(target);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },

  exportCsv: async (f: WarrantFilter) => saveText(`Warrants ${f.view} ${todayISO()}.csv`, warrantsCsv(f), 'CSV', 'csv'),
  auditCsv: async () => saveText(`Audit log ${todayISO()}.csv`, auditCsv(), 'CSV', 'csv'),
  docketPdf: async (f: WarrantFilter) => {
    try {
      const pdf = await htmlToPdf(docketHtml(f));
      return await saveBytes(`Warrant docket ${todayISO()}.pdf`, pdf, 'PDF', 'pdf', true);
    } catch (e) {
      return fail(e);
    }
  },
  caseSummaryPdf: async (id: number) => {
    try {
      const w = repo.getWarrant(id);
      const pdf = await htmlToPdf(caseSummaryHtml(id));
      const r = await saveBytes(`Case summary ${w?.caseNumber ?? ''} ${w?.warrantNumber ?? ''}.pdf`, pdf, 'PDF', 'pdf', true);
      if (r.ok) tx(() => repo.audit(id, 'export', 'Case summary PDF exported'));
      return r;
    } catch (e) {
      return fail(e);
    }
  },
  casePacket: async (id: number) => {
    try {
      const { bytes, name } = await casePacket(id);
      const r = await saveBytes(name, bytes, 'Zip archive', 'zip', false);
      if (r.ok) tx(() => repo.audit(id, 'export', 'Case packet exported', { sha256: repo.sha256(bytes) }));
      return r;
    } catch (e) {
      return fail(e);
    }
  },

  backupNow: () => {
    try {
      return ok(snapshot());
    } catch (e) {
      return fail(e);
    }
  },
  exportFullBackup: async () => {
    try {
      const target = await saveDialog(`WarrantTracker-backup-${todayISO()}.wrtbackup`, [{ name: 'Tracker backup', extensions: ['wrtbackup'] }]);
      if (!target) return { ok: false, canceled: true };
      writeFileSync(target, fullBackup());
      tx(() => repo.audit(null, 'backup', 'Full backup exported', { to: target }));
      return ok(target);
    } catch (e) {
      return fail(e);
    }
  },
  restoreFullBackup: async () => {
    try {
      const p = (await openDialog([{ name: 'Tracker backup', extensions: ['wrtbackup'] }]))[0];
      if (!p) return { ok: false, canceled: true };
      restoreFull(readFileSync(p));
      onSettingsChanged(getSettings());
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  importV1: async (p?: string) => {
    try {
      const path = p || (await openDialog([{ name: 'v1 database', extensions: ['db'] }]))[0];
      if (!path) return { ok: false, canceled: true };
      return ok(importV1(path));
    } catch (e) {
      return fail(e);
    }
  },
  chooseFolder: async () => {
    const w = win();
    const r = w ? await dialog.showOpenDialog(w, { properties: ['openDirectory', 'createDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  openDataFolder: async () => {
    await shell.openPath(DATA_DIR);
  },
  showInFolder: async (p: string) => shell.showItemInFolder(p),
  openPath: async (p: string) => {
    await shell.openPath(p);
  },
  setAgencyLogo: async () => {
    try {
      const p = (await openDialog([{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }]))[0];
      if (!p) return { ok: false, canceled: true };
      let img = nativeImage.createFromPath(p);
      if (img.isEmpty()) throw new Error('Could not read that image.');
      if (img.getSize().height > 240) img = img.resize({ height: 240, quality: 'best' });
      writeFileSync(LOGO_FILE, img.toPNG());
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  getAgencyLogo: () => (existsSync(LOGO_FILE) ? `data:image/png;base64,${readFileSync(LOGO_FILE).toString('base64')}` : null),
  setUiScale: (scale: number) => {
    try {
      const s = getSettings();
      s.app.uiScale = clampUiScale(scale);
      saveSettings(s);
      onSettingsChanged(s);
      return ok(s.app.uiScale);
    } catch (e) {
      return fail(e);
    }
  },
  setTitleBarTheme: async (dark: boolean) => {
    const w = win();
    try {
      w?.setTitleBarOverlay({ color: dark ? '#0b1220' : '#eef1f6', symbolColor: dark ? '#cbd5e1' : '#1f2937', height: titleBarHeight() });
    } catch {
      /* not supported */
    }
  },
  extractDocxText: (bytes: Uint8Array) => {
    try {
      const xml = new PizZip(bytes).file('word/document.xml')?.asText() ?? '';
      return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    } catch {
      return '';
    }
  },
};

function wrap(fn: () => void): Result {
  try {
    fn();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

async function saveBytes(name: string, bytes: Buffer, label: string, ext: string, open: boolean): Promise<Result> {
  const target = await saveDialog(name.replace(/[<>:"/\\|?*]/g, '_'), [{ name: label, extensions: [ext] }]);
  if (!target) return { ok: false, canceled: true };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  if (open) void shell.openPath(target);
  return ok();
}

async function saveText(name: string, text: string, label: string, ext: string): Promise<Result> {
  try {
    const r = await saveBytes(name, Buffer.from(text, 'utf8'), label, ext, false);
    if (r.ok) tx(() => repo.audit(null, 'export', `Exported ${name}`));
    return r;
  } catch (e) {
    return fail(e);
  }
}

const READ_ONLY = /^(appInfo|templateUsesSignature|get|list|read|find|stats|audit|inspect|templateFieldCatalog|verifyPin|pickFile|chooseFolder|extractDocxText|setTitleBarTheme|setUiScale|openDataFolder|showInFolder|openPath|generateDocument)/;

export function registerIpc(getWin: () => BrowserWindow | null, settingsChanged: (s: Settings) => void) {
  win = getWin;
  onSettingsChanged = settingsChanged;
  ipcMain.handle('api', async (event, name: string, ...args: unknown[]) => {
    // Only accept calls from our own top-level window
    if (event.senderFrame?.parent) throw new Error('blocked');
    const fn = (handlers as Record<string, ((...a: unknown[]) => unknown) | undefined>)[name];
    if (!fn) throw new Error(`Unknown API call: ${name}`);
    try {
      const out = await fn(...args);
      if (!READ_ONLY.test(name) || (name === 'generateDocument' && !(args[0] as GenerateRequest)?.preview)) broadcastChanged();
      return out;
    } catch (e) {
      log('error', `IPC ${name} failed`, e);
      throw e;
    }
  });
}

export function broadcastChanged() {
  win()?.webContents.send('data-changed');
}

export const API_NAMES = Object.keys(handlers);
