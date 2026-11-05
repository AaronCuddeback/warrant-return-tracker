// Automatic daily DB snapshots + full backup/restore (.wrtbackup = zip of db, templates, attachments, settings).
import PizZip from 'pizzip';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbBytes, replaceDb, tx } from './db';
import { ATTACH_DIR, BACKUP_DIR, TEMPLATE_DIR, SETTINGS_FILE, LOGO_FILE, DB_FILE } from './paths';
import { getSettings, saveSettings, invalidateSettingsCache } from './settings';
import { audit } from './repo';
import { todayISO } from '../shared/dates';
import { log } from './log';

function backupFolder() {
  const f = getSettings().backup.folder || BACKUP_DIR;
  mkdirSync(f, { recursive: true });
  return f;
}

export function snapshot(): string {
  const file = join(backupFolder(), `tracker-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  writeFileSync(file, dbBytes());
  prune();
  const s = getSettings();
  s.backup.lastBackupAt = new Date().toISOString();
  saveSettings(s);
  return file;
}

function prune() {
  const keep = Math.max(3, getSettings().backup.keep || 14);
  const dir = backupFolder();
  const files = readdirSync(dir)
    .filter((f) => /^tracker-.*\.db$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const x of files.slice(keep)) {
    try {
      unlinkSync(join(dir, x.f));
    } catch {
      /* ignore */
    }
  }
}

export function autoBackupIfDue() {
  try {
    const s = getSettings();
    if (!s.backup.autoDaily) return;
    if (s.backup.lastBackupAt && s.backup.lastBackupAt.slice(0, 10) === todayISO()) return;
    if (!existsSync(DB_FILE)) return;
    snapshot();
    log('info', 'daily backup written');
  } catch (e) {
    log('error', 'auto backup failed', e);
  }
}

export function fullBackup(): Buffer {
  const zip = new PizZip();
  zip.file('tracker.db', dbBytes());
  if (existsSync(SETTINGS_FILE)) zip.file('settings.json', readFileSync(SETTINGS_FILE));
  if (existsSync(LOGO_FILE)) zip.file('agency-logo.png', readFileSync(LOGO_FILE));
  for (const f of readdirSync(TEMPLATE_DIR)) zip.file(`templates/${f}`, readFileSync(join(TEMPLATE_DIR, f)));
  for (const f of readdirSync(ATTACH_DIR)) zip.file(`attachments/${f}`, readFileSync(join(ATTACH_DIR, f)));
  zip.file('backup-info.json', JSON.stringify({ app: 'Warrant Return Tracker', format: 1, createdAt: new Date().toISOString() }));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

export function restoreFull(bytes: Buffer) {
  const zip = new PizZip(bytes);
  const info = zip.file('backup-info.json');
  const db = zip.file('tracker.db');
  if (!info || !db) throw new Error('This is not a Warrant Return Tracker backup file.');
  // Safety copy of the current state first
  const safety = snapshot();
  replaceDb(db.asUint8Array());
  const settings = zip.file('settings.json');
  if (settings) {
    writeFileSync(SETTINGS_FILE, settings.asNodeBuffer());
    invalidateSettingsCache();
  }
  const logo = zip.file('agency-logo.png');
  if (logo) writeFileSync(LOGO_FILE, logo.asNodeBuffer());
  for (const [name, f] of Object.entries(zip.files)) {
    if (f.dir) continue;
    const m = /^(templates|attachments)\/([^/]+)$/.exec(name);
    if (!m || m[2].includes('..')) continue;
    const target = join(m[1] === 'templates' ? TEMPLATE_DIR : ATTACH_DIR, m[2]);
    if (!existsSync(target)) writeFileSync(target, f.asNodeBuffer());
  }
  tx(() => audit(null, 'restore', 'Full backup restored', { safetySnapshot: safety }));
}

export function copyDbTo(path: string) {
  copyFileSync(DB_FILE, path);
}
