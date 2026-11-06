// CSV exports, printable PDF reports (docket + case summary) and case packets (zip).
import { BrowserWindow } from 'electron';
import PizZip from 'pizzip';
import { readFileSync, existsSync } from 'node:fs';
import { escapeHtml } from './email';
import { getSettings } from './settings';
import { listWarrants, getWarrant, listAttachments, listAudit, attachmentPath } from './repo';
import { daysUntil, formatDate, relativeDays, todayISO } from '../shared/dates';
import { WARRANT_TYPES, ATTACHMENT_KINDS, type WarrantFilter, type Warrant } from '../shared/types';
import { formatItem } from '../shared/fields';
import { LOGO_FILE } from './paths';

function csvCell(v: unknown): string {
  let s = String(v ?? '');
  // neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function warrantsCsv(f: WarrantFilter): string {
  const s = getSettings();
  const rows = listWarrants(f);
  const head = ['Warrant #', 'Case #', 'Type', 'Target(s)', 'Judge', 'Signed', 'Received', 'Executed', 'Return Due', 'Days Left', 'Status', 'Filed', 'Notification Required', 'Notification Served', 'Amendments', 'Provider', 'Locations', 'Assigned To', 'Tags', 'Created'];
  const lines = [head.map(csvCell).join(',')];
  for (const w of rows) {
    lines.push(
      [
        w.warrantNumber, w.caseNumber, WARRANT_TYPES.find((t) => t.value === w.warrantType)?.label, w.targets, w.judge,
        formatDate(w.signedDate, s.app.dateFormat), formatDate(w.receivedDate, s.app.dateFormat), formatDate(w.executedDate, s.app.dateFormat),
        formatDate(w.returnDueDate, s.app.dateFormat), w.status === 'filed' ? '' : daysUntil(w.returnDueDate), w.status,
        formatDate(w.filedDate, s.app.dateFormat), w.notificationRequired ? 'Yes' : 'No', formatDate(w.notificationServedDate, s.app.dateFormat), w.amendmentCount,
        w.provider, w.locations, w.assignedTo, w.tags, w.createdAt,
      ].map(csvCell).join(','),
    );
  }
  return '﻿' + lines.join('\r\n');
}

export function auditCsv(): string {
  const rows = listAudit(null, 100000);
  const ws = new Map(listWarrants({ view: 'all' }).concat(listWarrants({ view: 'trash' })).map((w) => [w.id, w]));
  const lines = [['Timestamp', 'User', 'Warrant #', 'Case #', 'Action', 'Summary', 'Details'].map(csvCell).join(',')];
  for (const a of rows) {
    const w = a.warrantId ? ws.get(a.warrantId) : undefined;
    lines.push([a.at, a.user, w?.warrantNumber ?? '', w?.caseNumber ?? '', a.action, a.summary, a.details ?? ''].map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

function logoDataUrl(): string {
  return existsSync(LOGO_FILE) ? `data:image/png;base64,${readFileSync(LOGO_FILE).toString('base64')}` : '';
}

const CSS = `
  *{box-sizing:border-box} body{font-family:"Segoe UI",Arial,sans-serif;color:#111827;font-size:11px;margin:0}
  header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0f2a4a;padding-bottom:10px;margin-bottom:14px}
  header img{height:54px} h1{font-size:18px;margin:0;color:#0f2a4a} .sub{color:#4b5563;font-size:11px}
  table{width:100%;border-collapse:collapse} th{background:#0f2a4a;color:#fff;text-align:left;padding:6px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  td{padding:5px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top} tr:nth-child(even) td{background:#f8fafc}
  .ov{color:#b91c1c;font-weight:700} .cr{color:#c2410c;font-weight:700} .ok{color:#1d4ed8}
  .kv td:first-child{width:170px;font-weight:600;color:#374151;background:#f3f4f6}
  h2{font-size:13px;color:#0f2a4a;border-bottom:1px solid #cbd5e1;padding-bottom:3px;margin:18px 0 6px}
  .mono{font-family:Consolas,monospace;font-size:9.5px;word-break:break-all}
  footer{margin-top:18px;color:#6b7280;font-size:9px;border-top:1px solid #e5e7eb;padding-top:6px}
`;

function shell(title: string, sub: string, body: string) {
  const s = getSettings();
  const logo = logoDataUrl();
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <header>${logo ? `<img src="${logo}">` : ''}<div><h1>${escapeHtml(title)}</h1><div class="sub">${escapeHtml(s.profile.agencyName)}${s.profile.unit ? ' - ' + escapeHtml(s.profile.unit) : ''}<br>${escapeHtml(sub)}</div></div></header>
  ${body}
  <footer>Generated ${escapeHtml(new Date().toLocaleString())} by ${escapeHtml([s.profile.title, s.profile.fullName].filter(Boolean).join(' '))} - Warrant Return Tracker. Contains law enforcement sensitive information.</footer>
  </body></html>`;
}

export function docketHtml(f: WarrantFilter): string {
  const s = getSettings();
  const rows = listWarrants(f);
  const body = `<table><thead><tr><th>Status</th><th>Warrant #</th><th>Case #</th><th>Target(s)</th><th>Judge</th><th>Signed</th><th>Executed</th><th>Due</th><th>Notice</th></tr></thead><tbody>
  ${rows
    .map((w) => {
      const d = daysUntil(w.returnDueDate);
      const cls = w.status === 'filed' ? '' : d < 0 ? 'ov' : d <= 3 ? 'cr' : 'ok';
      const st = w.status === 'filed' ? `Filed ${formatDate(w.filedDate, s.app.dateFormat)}` : relativeDays(d);
      return `<tr><td class="${cls}">${escapeHtml(st)}</td><td>${escapeHtml(w.warrantNumber)}${w.amendmentCount ? ` <i>(amended${w.amendmentCount > 1 ? ' x' + w.amendmentCount : ''})</i>` : ''}</td><td>${escapeHtml(w.caseNumber)}</td><td>${escapeHtml(w.targets)}</td><td>${escapeHtml(w.judge)}</td><td>${formatDate(w.signedDate, s.app.dateFormat)}</td><td>${formatDate(w.executedDate, s.app.dateFormat) || '-'}</td><td>${formatDate(w.returnDueDate, s.app.dateFormat)}</td><td>${w.notificationRequired ? (w.notificationServedDate ? 'Served' : 'OUTSTANDING') : 'N/A'}</td></tr>`;
    })
    .join('')}
  </tbody></table>${rows.length ? '' : '<p>No warrants in this view.</p>'}`;
  const label = { active: 'All open warrants', pending: 'Pending (not executed)', executed: 'Executed - return not filed', filed: 'Filed / archived', trash: 'Trash', all: 'All warrants' }[f.view];
  return shell('Search Warrant Docket', `${label} - ${rows.length} warrant(s) - as of ${formatDate(todayISO(), 'MMMM D, YYYY')}`, body);
}

export function caseSummaryHtml(id: number): string {
  const s = getSettings();
  const w = getWarrant(id);
  if (!w) throw new Error('Warrant not found');
  const fd = (d: string | null) => formatDate(d, s.app.dateFormat) || '-';
  const kv = (rows: [string, string][]) => `<table class="kv">${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
  const atts = listAttachments(id);
  const log = listAudit(id, 1000).slice().reverse();
  const inv = w.items.length ? w.items.map(formatItem).join('\n') : w.itemsText || '-';
  const body = `
  <h2>Warrant</h2>${kv([
    ['Warrant #', w.warrantNumber], ['Case #', w.caseNumber], ['Type', WARRANT_TYPES.find((t) => t.value === w.warrantType)?.label ?? ''],
    ['Target(s)', w.targets], ['Judge', w.judge], ['Court', w.court || s.profile.courtName], ['Provider', w.provider || '-'],
    ['Status', w.status.toUpperCase()], ['Assigned to', w.assignedTo || '-'],
  ])}
  <h2>Dates</h2>${kv([
    ['Signed', fd(w.signedDate)], ['Received', fd(w.receivedDate)], ['Executed / searched', fd(w.executedDate)],
    ['Return due', `${fd(w.returnDueDate)} (${w.dueRule || 'custom'})`], ['Return filed', fd(w.filedDate)],
    ['Notification', w.notificationRequired ? `Required - ${w.notificationServedDate ? 'served ' + fd(w.notificationServedDate) : 'NOT SERVED'}` : 'Not required'],
  ])}
  ${(w.amendments ?? []).length ? `<h2>Amendments</h2>
  <table><thead><tr><th>#</th><th>Signed</th><th>Judge</th><th>Changes</th><th>Due date</th></tr></thead><tbody>
  ${(w.amendments ?? []).map((a) => `<tr><td>${a.number}</td><td style="white-space:nowrap">${fd(a.signedDate)}</td><td>${escapeHtml(a.judge)}</td><td>${escapeHtml(a.summary)}${a.addedScope ? `<br><i>Added: ${escapeHtml(a.addedScope)}</i>` : ''}</td><td style="white-space:nowrap">${a.newDueDate ? `${fd(a.previousDueDate)} &rarr; ${fd(a.newDueDate)}` : 'unchanged'}</td></tr>`).join('')}
  </tbody></table>` : ''}
  <h2>Return</h2>${kv([['Locations searched', w.locations || '-'], ['Property taken', inv], ['Investigation', w.investigationNature || '-'], ['Notes', w.notes || '-']])}
  <h2>Documents (SHA-256)</h2>
  <table><thead><tr><th>Type</th><th>File</th><th>Added</th><th>SHA-256</th></tr></thead><tbody>
  ${atts.map((a) => `<tr><td>${escapeHtml(ATTACHMENT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind)}${a.generated ? ' (generated)' : ''}</td><td>${escapeHtml(a.originalName)}</td><td>${escapeHtml(new Date(a.addedAt).toLocaleString())}</td><td class="mono">${a.sha256}</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>'}
  </tbody></table>
  <h2>Activity log</h2>
  <table><thead><tr><th>When</th><th>User</th><th>Event</th></tr></thead><tbody>
  ${log.map((a) => `<tr><td style="white-space:nowrap">${escapeHtml(new Date(a.at).toLocaleString())}</td><td>${escapeHtml(a.user)}</td><td>${escapeHtml(a.summary)}</td></tr>`).join('')}
  </tbody></table>`;
  return shell(`Warrant ${w.warrantNumber || ''} - Case ${w.caseNumber}`, 'Case summary & chain of custody', body);
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } });
  } finally {
    win.destroy();
  }
}

/** Zip of every document for a warrant + case summary PDF + manifest with hashes. */
export async function casePacket(id: number): Promise<{ bytes: Buffer; name: string }> {
  const w = getWarrant(id) as Warrant;
  if (!w) throw new Error('Warrant not found');
  const zip = new PizZip();
  const atts = listAttachments(id);
  const used = new Set<string>();
  const manifest: string[] = [`Case packet - Warrant ${w.warrantNumber} / Case ${w.caseNumber}`, `Created ${new Date().toISOString()}`, '', 'SHA-256  File'];
  for (const a of atts) {
    const p = attachmentPath(a);
    if (!existsSync(p)) continue;
    let name = `${a.kind}/${a.originalName}`;
    for (let i = 2; used.has(name); i++) name = `${a.kind}/${i}-${a.originalName}`;
    used.add(name);
    zip.file(name, readFileSync(p));
    manifest.push(`${a.sha256}  ${name}`);
  }
  zip.file('case-summary.pdf', await htmlToPdf(caseSummaryHtml(id)));
  zip.file('MANIFEST.txt', manifest.join('\r\n'));
  const safe = `${w.caseNumber || 'case'}_${w.warrantNumber || w.id}`.replace(/[^\w.-]+/g, '_');
  return { bytes: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer, name: `${safe}_packet.zip` };
}
