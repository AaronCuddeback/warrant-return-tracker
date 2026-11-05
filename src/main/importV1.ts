// Imports data from Warrant Return Tracker v1 (warrants.db + config.json).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openForeign, run, tx, get } from './db';
import { audit, storeAttachment } from './repo';
import { getSettings, saveSettings } from './settings';
import { isISODate, toISO } from '../shared/dates';

function iso(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  if (isISODate(s.slice(0, 10))) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toISO(d);
}

export function importV1(dbPath: string): { warrants: number; attachments: number; profile: boolean } {
  if (!existsSync(dbPath)) throw new Error('v1 database not found');
  const old = openForeign(readFileSync(dbPath));
  let rows: Record<string, unknown>[] = [];
  try {
    const res = old.exec('SELECT * FROM warrants');
    if (res[0]) rows = res[0].values.map((v) => Object.fromEntries(res[0].columns.map((c, i) => [c, v[i]])));
  } catch {
    old.close();
    throw new Error('That file is not a v1 Warrant Return Tracker database (no warrants table).');
  }
  old.close();

  let warrants = 0;
  let attachments = 0;
  tx(() => {
    for (const r of rows) {
      const wn = String(r.warrantNumber ?? '');
      const cn = String(r.caseNumber ?? '');
      if (get('SELECT id FROM warrants WHERE warrantNumber = ? AND caseNumber = ?', [wn, cn])) continue; // already imported
      const signed = iso(r.signedDate) ?? iso(r.createdAt) ?? toISO(new Date());
      const due = iso(r.returnDueDate) ?? signed;
      const archived = r.status === 'archived';
      const now = new Date().toISOString();
      const id = run(
        `INSERT INTO warrants (caseNumber, warrantNumber, warrantType, targets, judge, signedDate, receivedDate, returnDueDate, dueRule, status, filedDate, notificationRequired, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [cn, wn, 'other', String(r.suspectName ?? ''), String(r.judge ?? ''), signed, signed, due, 'imported from v1',
          archived ? 'filed' : 'pending', archived ? iso(r.archivedAt) : null, 0, String(r.createdAt ?? now), now],
      );
      audit(id, 'import', 'Imported from Warrant Return Tracker v1', { v1Id: r.id, pdfPath: r.pdfPath ?? null });
      warrants++;
      const pdf = r.pdfPath ? String(r.pdfPath) : '';
      if (pdf && existsSync(pdf)) {
        storeAttachment(id, 'warrant', pdf);
        attachments++;
      }
    }
  });

  // v1 config.json lives next to warrants.db
  let profile = false;
  const cfg = join(dirname(dbPath), 'config.json');
  if (existsSync(cfg)) {
    try {
      const c = JSON.parse(readFileSync(cfg, 'utf8'));
      const s = getSettings();
      const p = s.profile;
      if (!p.fullName && c.fullName) p.fullName = c.fullName;
      if (!p.title && c.title) p.title = c.title;
      if (!p.phone && c.workPhone) p.phone = c.workPhone;
      if (!p.email && c.email) p.email = c.email;
      if (!p.agencyName && c.agency) p.agencyName = c.agency;
      if (c.smtpHost && !s.smtp.host) {
        s.smtp.host = c.smtpHost;
        s.smtp.port = Number(c.smtpPort) || 587;
        s.smtp.username = c.smtpUsername || '';
      }
      if (Array.isArray(c.reminderLeadTimes) && c.reminderLeadTimes.length) s.notifications.leadTimes = c.reminderLeadTimes.map(Number);
      if (c.notificationRecipient) s.notifications.recipient = c.notificationRecipient;
      saveSettings(s);
      profile = true;
    } catch {
      /* ignore bad config */
    }
  }
  return { warrants, attachments, profile };
}
