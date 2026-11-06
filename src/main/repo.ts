// Warrant / attachment / audit data access.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { userInfo } from 'node:os';
import { all, get, run, tx } from './db';
import { ATTACH_DIR } from './paths';
import type {
  Amendment, AmendmentInput,
  Attachment, AttachmentKind, AuditEntry, DashboardStats, Warrant, WarrantFilter, WarrantInput,
  WarrantListItem, WarrantStatus, ISODate,
} from '../shared/types';
import { daysUntil, todayISO, isISODate, formatDate } from '../shared/dates';

const USER = (() => {
  try {
    return userInfo().username;
  } catch {
    return 'unknown';
  }
})();
export const currentUser = () => USER;

const FIELDS: (keyof WarrantInput)[] = [
  'caseNumber', 'warrantNumber', 'warrantType', 'targets', 'judge', 'court', 'signedDate', 'receivedDate',
  'executedDate', 'returnDueDate', 'dueRule', 'locations', 'provider', 'items', 'itemsText',
  'investigationNature', 'notes', 'assignedTo', 'tags', 'status', 'notificationRequired',
  'notificationServedDate', 'filedDate', 'snoozeUntil',
];

const LABELS: Partial<Record<keyof WarrantInput, string>> = {
  caseNumber: 'Case number', warrantNumber: 'Warrant number', warrantType: 'Warrant type', targets: 'Targets',
  judge: 'Judge', court: 'Court', signedDate: 'Signed date', receivedDate: 'Received date',
  executedDate: 'Search/executed date', returnDueDate: 'Return due date', locations: 'Locations searched',
  provider: 'Provider', items: 'Inventory', itemsText: 'Inventory text', investigationNature: 'Investigation nature',
  notes: 'Notes', assignedTo: 'Assigned to', tags: 'Tags', status: 'Status',
  notificationRequired: 'Notification required', notificationServedDate: 'Notification served',
  filedDate: 'Filed date', snoozeUntil: 'Reminders snoozed until', dueRule: 'Due rule',
};

function rowToWarrant(r: Record<string, unknown>): Warrant {
  let items = [];
  try {
    items = JSON.parse(String(r.items || '[]'));
  } catch {
    items = [];
  }
  return {
    ...(r as unknown as Warrant),
    items,
    notificationRequired: !!r.notificationRequired,
  };
}

function toDb(k: keyof WarrantInput, v: unknown): string | number | null {
  if (k === 'items') return JSON.stringify(v ?? []);
  if (k === 'notificationRequired') return v ? 1 : 0;
  if (v === undefined) return null;
  if (v === '' && /Date$|snoozeUntil/.test(k) && k !== 'signedDate' && k !== 'returnDueDate') return null;
  return v as string | number | null;
}

function validate(w: Partial<WarrantInput>, creating: boolean) {
  if (creating) {
    if (!w.warrantNumber?.trim() && !w.caseNumber?.trim()) throw new Error('A warrant number or case number is required.');
    if (!isISODate(w.signedDate)) throw new Error('A valid signed date is required.');
    if (!isISODate(w.returnDueDate)) throw new Error('A valid return due date is required.');
  }
  for (const k of ['signedDate', 'returnDueDate'] as const) {
    if (w[k] !== undefined && !isISODate(w[k])) throw new Error(`${LABELS[k]} is not a valid date.`);
  }
  for (const k of ['receivedDate', 'executedDate', 'notificationServedDate', 'filedDate', 'snoozeUntil'] as const) {
    const v = w[k];
    if (v !== undefined && v !== null && v !== '' && !isISODate(v)) throw new Error(`${LABELS[k]} is not a valid date.`);
  }
}

export function audit(warrantId: number | null, action: string, summary: string, details?: unknown) {
  run('INSERT INTO audit(warrantId, at, user, action, summary, details) VALUES (?,?,?,?,?,?)', [
    warrantId, new Date().toISOString(), USER, action, summary, details === undefined ? null : JSON.stringify(details),
  ]);
}

export function listAudit(warrantId: number | null, limit = 500): AuditEntry[] {
  if (warrantId === null) return all<AuditEntry>('SELECT * FROM audit ORDER BY id DESC LIMIT ?', [limit]);
  return all<AuditEntry>('SELECT * FROM audit WHERE warrantId = ? ORDER BY id DESC LIMIT ?', [warrantId, limit]);
}

export function getWarrant(id: number): Warrant | null {
  const r = get('SELECT * FROM warrants WHERE id = ?', [id]);
  return r ? { ...rowToWarrant(r), amendments: listAmendments(id) } : null;
}

export function listWarrants(f: WarrantFilter): WarrantListItem[] {
  let where = 'w.deletedAt IS NULL';
  if (f.view === 'trash') where = 'w.deletedAt IS NOT NULL';
  else if (f.view === 'active') where += " AND w.status != 'filed'";
  else if (f.view === 'pending' || f.view === 'executed' || f.view === 'filed') where += ` AND w.status = '${f.view}'`;
  const params: string[] = [];
  if (f.search?.trim()) {
    const cols = ['caseNumber', 'warrantNumber', 'targets', 'judge', 'locations', 'provider', 'tags', 'notes', 'assignedTo', 'investigationNature'];
    const terms = f.search.trim().split(/\s+/).slice(0, 6);
    for (const t of terms) {
      where += ` AND (${cols.map((c) => `w.${c} LIKE ?`).join(' OR ')})`;
      for (let i = 0; i < cols.length; i++) params.push(`%${t}%`);
    }
  }
  const rows = all(
    `SELECT w.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.warrantId = w.id) AS attachmentCount,
      (SELECT COUNT(*) FROM amendments m WHERE m.warrantId = w.id) AS amendmentCount,
      EXISTS(SELECT 1 FROM attachments a WHERE a.warrantId = w.id AND a.kind = 'warrant') AS hasWarrantDoc,
      EXISTS(SELECT 1 FROM attachments a WHERE a.warrantId = w.id AND a.kind = 'return' AND a.generated = 1) AS returnGenerated,
      EXISTS(SELECT 1 FROM attachments a WHERE a.warrantId = w.id AND a.kind = 'notification' AND a.generated = 1) AS notificationGenerated
     FROM warrants w WHERE ${where}
     ORDER BY CASE WHEN w.status = 'filed' THEN 1 ELSE 0 END, w.returnDueDate ASC, w.id DESC`,
    params,
  );
  return rows.map((r) => ({
    ...rowToWarrant(r),
    attachmentCount: Number(r.attachmentCount),
    amendmentCount: Number(r.amendmentCount),
    hasWarrantDoc: !!r.hasWarrantDoc,
    returnGenerated: !!r.returnGenerated,
    notificationGenerated: !!r.notificationGenerated,
  }));
}

export function findDuplicates(warrantNumber: string, caseNumber: string, excludeId?: number): WarrantListItem[] {
  const wn = warrantNumber.trim();
  const cn = caseNumber.trim();
  if (!wn && !cn) return [];
  return listWarrants({ view: 'all' }).filter(
    (w) => w.id !== excludeId && ((wn && w.warrantNumber.trim().toLowerCase() === wn.toLowerCase()) || (cn && wn === '' && w.caseNumber.trim() === cn)),
  );
}

export function createWarrant(input: WarrantInput, attachPath?: string | null): number {
  validate(input, true);
  return tx(() => {
    const now = new Date().toISOString();
    const cols = [...FIELDS, 'createdAt', 'updatedAt'];
    const vals = [...FIELDS.map((k) => toDb(k, input[k])), now, now];
    const id = run(`INSERT INTO warrants (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
    audit(id, 'create', `Warrant ${input.warrantNumber || input.caseNumber} added`, {
      warrantNumber: input.warrantNumber, caseNumber: input.caseNumber, signedDate: input.signedDate,
      returnDueDate: input.returnDueDate, dueRule: input.dueRule,
    });
    if (attachPath) storeAttachment(id, 'warrant', attachPath);
    return id;
  });
}

function display(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (v === null || v === undefined || v === '') return '(blank)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

export function updateWarrant(id: number, patch: Partial<WarrantInput>, reason?: string, action = 'edit') {
  validate(patch, false);
  const cur = getWarrant(id);
  if (!cur) throw new Error('Warrant not found');
  const changes: { field: string; from: string; to: string }[] = [];
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const k of FIELDS) {
    if (!(k in patch)) continue;
    const next = toDb(k, patch[k]);
    const prev = toDb(k, cur[k]);
    if (next === prev) continue;
    sets.push(`${k} = ?`);
    vals.push(next);
    changes.push({ field: LABELS[k] ?? k, from: display(cur[k]), to: display(patch[k]) });
  }
  if (!sets.length) return;
  tx(() => {
    run(`UPDATE warrants SET ${sets.join(', ')}, updatedAt = ? WHERE id = ?`, [...vals, new Date().toISOString(), id]);
    const summary =
      changes.length === 1
        ? `${changes[0].field}: ${changes[0].from} -> ${changes[0].to}`
        : `${changes.length} fields changed (${changes.map((c) => c.field).join(', ')})`;
    audit(id, action, reason ? `${summary} - ${reason}` : summary, { changes, reason });
  });
}

export function setStatus(id: number, status: WarrantStatus) {
  const patch: Partial<WarrantInput> = { status };
  const w = getWarrant(id);
  if (!w) throw new Error('Warrant not found');
  if (status === 'filed' && !w.filedDate) patch.filedDate = todayISO();
  if (status === 'executed' && !w.executedDate) patch.executedDate = todayISO();
  if (status !== 'filed') patch.filedDate = null;
  updateWarrant(id, patch, undefined, 'status');
}

export function extendDueDate(id: number, newDate: ISODate, reason: string) {
  if (!isISODate(newDate)) throw new Error('Invalid date');
  if (!reason.trim()) throw new Error('A reason is required when changing the due date.');
  updateWarrant(id, { returnDueDate: newDate }, reason, 'due-date');
  tx(() => run("DELETE FROM reminders_sent WHERE warrantId = ? AND key NOT LIKE 'overdue:%'", [id]));
}

export function trashWarrant(id: number) {
  tx(() => {
    run('UPDATE warrants SET deletedAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    audit(id, 'trash', 'Moved to trash');
  });
}
export function restoreWarrant(id: number) {
  tx(() => {
    run('UPDATE warrants SET deletedAt = NULL WHERE id = ?', [id]);
    audit(id, 'restore', 'Restored from trash');
  });
}
export function purgeWarrant(id: number) {
  const w = getWarrant(id);
  if (!w) return;
  if (!w.deletedAt) throw new Error('Move the warrant to trash before deleting it permanently.');
  const atts = listAttachments(id);
  tx(() => {
    run('DELETE FROM attachments WHERE warrantId = ?', [id]);
    run('DELETE FROM reminders_sent WHERE warrantId = ?', [id]);
    run('DELETE FROM amendments WHERE warrantId = ?', [id]);
    run('DELETE FROM warrants WHERE id = ?', [id]);
    audit(null, 'purge', `Warrant ${w.warrantNumber || w.caseNumber} (case ${w.caseNumber}) permanently deleted`, {
      id, warrantNumber: w.warrantNumber, caseNumber: w.caseNumber, attachments: atts.map((a) => ({ name: a.originalName, sha256: a.sha256 })),
    });
  });
  for (const a of atts) {
    try {
      unlinkSync(join(ATTACH_DIR, a.storedName));
    } catch {
      /* already gone */
    }
  }
}

export function stats(): DashboardStats {
  const t = todayISO();
  const active = all<{ returnDueDate: string; status: string; notificationRequired: number; notificationServedDate: string | null }>(
    "SELECT returnDueDate, status, notificationRequired, notificationServedDate FROM warrants WHERE deletedAt IS NULL AND status != 'filed'",
  );
  const s: DashboardStats = { overdue: 0, dueToday: 0, dueSoon: 0, dueThisWeek: 0, pending: 0, executed: 0, filedThisMonth: 0, notificationsOutstanding: 0 };
  for (const w of active) {
    const d = daysUntil(w.returnDueDate, t);
    if (d < 0) s.overdue++;
    else if (d === 0) s.dueToday++;
    if (d >= 0 && d <= 3) s.dueSoon++;
    if (d >= 0 && d <= 7) s.dueThisWeek++;
    if (w.status === 'pending') s.pending++;
    if (w.status === 'executed') s.executed++;
    if (w.notificationRequired && !w.notificationServedDate) s.notificationsOutstanding++;
  }
  const month = t.slice(0, 7);
  s.filedThisMonth = Number(
    get<{ c: number }>("SELECT COUNT(*) AS c FROM warrants WHERE deletedAt IS NULL AND status = 'filed' AND substr(filedDate,1,7) = ?", [month])?.c ?? 0,
  );
  return s;
}

// ---- attachments (copied into the data folder, hashed with SHA-256) ----

export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function listAttachments(warrantId: number): Attachment[] {
  return all<Attachment>('SELECT * FROM attachments WHERE warrantId = ? ORDER BY addedAt DESC', [warrantId]).map((a) => ({
    ...a,
    generated: !!a.generated,
  }));
}

export function getAttachment(id: number): Attachment | undefined {
  const a = get<Attachment>('SELECT * FROM attachments WHERE id = ?', [id]);
  return a ? { ...a, generated: !!a.generated } : undefined;
}

export function attachmentPath(a: Attachment) {
  return join(ATTACH_DIR, a.storedName);
}

/** Copy a file into the attachment store. Call inside or outside a tx. */
export function storeAttachment(warrantId: number, kind: AttachmentKind, srcPath: string): number {
  const buf = readFileSync(srcPath);
  return storeAttachmentBytes(warrantId, kind, basename(srcPath), buf, false, null);
}

export function storeAttachmentBytes(
  warrantId: number, kind: AttachmentKind, originalName: string, buf: Buffer | Uint8Array,
  generated: boolean, templateName: string | null,
): number {
  const hash = sha256(buf);
  const stored = `${randomUUID()}${extname(originalName).toLowerCase()}`;
  writeFileSync(join(ATTACH_DIR, stored), buf);
  const id = run(
    'INSERT INTO attachments (warrantId, kind, originalName, storedName, sha256, size, generated, templateName, addedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    [warrantId, kind, originalName, stored, hash, buf.length, generated ? 1 : 0, templateName, new Date().toISOString()],
  );
  audit(warrantId, generated ? 'generate' : 'attach', `${generated ? 'Generated' : 'Attached'} ${originalName}`, {
    kind, sha256: hash, size: buf.length, template: templateName,
  });
  return id;
}

export function addAttachments(warrantId: number, kind: AttachmentKind, paths: string[]): number {
  return tx(() => {
    let n = 0;
    for (const p of paths) {
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      storeAttachment(warrantId, kind, p);
      n++;
    }
    return n;
  });
}

export function removeAttachment(id: number) {
  const a = getAttachment(id);
  if (!a) return;
  tx(() => {
    run('DELETE FROM attachments WHERE id = ?', [id]);
    audit(a.warrantId, 'detach', `Removed ${a.originalName}`, { sha256: a.sha256 });
  });
  try {
    unlinkSync(attachmentPath(a));
  } catch {
    /* ignore */
  }
}

export function verifyAttachment(id: number): boolean {
  const a = getAttachment(id);
  if (!a) throw new Error('Attachment not found');
  const p = attachmentPath(a);
  if (!existsSync(p)) return false;
  const ok = sha256(readFileSync(p)) === a.sha256;
  tx(() => audit(a.warrantId, 'verify', `Integrity check ${ok ? 'PASSED' : 'FAILED'}: ${a.originalName}`, { sha256: a.sha256 }));
  return ok;
}

// ---- amendments ----

export function listAmendments(warrantId: number): Amendment[] {
  return all<Amendment>('SELECT * FROM amendments WHERE warrantId = ? ORDER BY number ASC', [warrantId]);
}

export function getAmendment(id: number): Amendment | undefined {
  return get<Amendment>('SELECT * FROM amendments WHERE id = ?', [id]);
}

/** Create or update an amendment. Optionally changes the due date and extends the searched scope. */
export function saveAmendment(a: AmendmentInput, attachPath?: string | null): number {
  const w = getWarrant(a.warrantId);
  if (!w) throw new Error('Warrant not found');
  if (!isISODate(a.signedDate)) throw new Error('A valid amendment signed date is required.');
  if (!a.summary.trim()) throw new Error('Describe what the amendment changes.');
  if (a.newDueDate && !isISODate(a.newDueDate)) throw new Error('The new due date is not valid.');
  const now = new Date().toISOString();
  const existing = a.id ? getAmendment(a.id) : undefined;
  if (a.id && !existing) throw new Error('Amendment not found');

  const id = tx(() => {
    let id: number;
    let number: number;
    if (existing) {
      id = existing.id;
      number = existing.number;
      run('UPDATE amendments SET signedDate = ?, judge = ?, summary = ?, addedScope = ?, updatedAt = ? WHERE id = ?', [
        a.signedDate, a.judge.trim(), a.summary.trim(), a.addedScope.trim(), now, id,
      ]);
      audit(w.id, 'amendment', `Amendment ${number} edited`, { signedDate: a.signedDate, judge: a.judge, summary: a.summary });
    } else {
      number = Number(get<{ n: number }>('SELECT COALESCE(MAX(number), 0) AS n FROM amendments WHERE warrantId = ?', [w.id])?.n ?? 0) + 1;
      id = run(
        'INSERT INTO amendments (warrantId, number, signedDate, judge, summary, addedScope, previousDueDate, newDueDate, attachmentId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [w.id, number, a.signedDate, a.judge.trim(), a.summary.trim(), a.addedScope.trim(), null, null, null, now, now],
      );
      audit(w.id, 'amendment', `Amendment ${number} added (signed ${a.signedDate}${a.judge.trim() ? ` by ${a.judge.trim()}` : ''}): ${a.summary.trim()}`, {
        signedDate: a.signedDate, judge: a.judge, summary: a.summary, addedScope: a.addedScope,
      });
    }
    if (attachPath) {
      const attId = storeAttachment(w.id, 'amendment', attachPath);
      run('UPDATE amendments SET attachmentId = ? WHERE id = ?', [attId, id]);
    }
    return id;
  });

  const amd = getAmendment(id)!;
  if (a.newDueDate && a.newDueDate !== w.returnDueDate) {
    updateWarrant(w.id, { returnDueDate: a.newDueDate, dueRule: '' }, `per Amendment ${amd.number}`, 'due-date');
    tx(() => {
      run("DELETE FROM reminders_sent WHERE warrantId = ? AND key NOT LIKE 'overdue:%'", [w.id]);
      run('UPDATE amendments SET previousDueDate = COALESCE(previousDueDate, ?), newDueDate = ? WHERE id = ?', [w.returnDueDate, a.newDueDate, id]);
    });
  }
  if (a.appendScope && a.addedScope.trim() && !existing) {
    const add = `As amended (Amendment ${amd.number}, signed ${formatDate(a.signedDate, "MMMM D, YYYY")}): ${a.addedScope.trim()}`;
    updateWarrant(w.id, { locations: w.locations.trim() ? `${w.locations.trim()}\n\n${add}` : add }, `per Amendment ${amd.number}`);
  }
  return id;
}

export function deleteAmendment(id: number) {
  const a = getAmendment(id);
  if (!a) return;
  tx(() => {
    run('DELETE FROM amendments WHERE id = ?', [id]);
    audit(a.warrantId, 'amendment', `Amendment ${a.number} record deleted (its document, if any, was kept)`, a);
  });
}
