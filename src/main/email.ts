import nodemailer from 'nodemailer';
import { getSettings, getSmtpPassword } from './settings';
import { daysUntil, formatDate, relativeDays } from '../shared/dates';
import type { Warrant } from '../shared/types';

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function transport() {
  const s = getSettings();
  const pw = getSmtpPassword();
  if (!s.smtp.host) throw new Error('SMTP server is not configured (Settings > Notifications).');
  return nodemailer.createTransport({
    host: s.smtp.host,
    port: s.smtp.port || 587,
    secure: s.smtp.security === 'tls',
    requireTLS: s.smtp.security === 'starttls',
    ignoreTLS: s.smtp.security === 'none',
    auth: s.smtp.username ? { user: s.smtp.username, pass: pw ?? '' } : undefined,
    // Certificate validation is ON unless the agency explicitly allows an internal self-signed server.
    tls: { rejectUnauthorized: !s.smtp.allowSelfSigned, minVersion: 'TLSv1.2' },
    connectionTimeout: 15_000,
  });
}

function recipient(): string {
  const s = getSettings();
  const to = s.notifications.recipient || s.profile.email;
  if (!to) throw new Error('No email recipient set (Settings > Notifications).');
  return to;
}

export async function verifySmtp() {
  await transport().verify();
}

export async function sendMail(subject: string, html: string, text: string) {
  const s = getSettings();
  await transport().sendMail({ from: s.smtp.from || s.smtp.username, to: recipient(), subject, html, text });
}

const color = (d: number) => (d < 0 ? '#b91c1c' : d <= 3 ? '#c2410c' : '#1d4ed8');

function row(label: string, value: string, highlight = false) {
  return `<tr><td style="padding:6px 10px;border:1px solid #d6dbe4;background:#f4f6f9;font-weight:600;width:160px">${escapeHtml(label)}</td><td style="padding:6px 10px;border:1px solid #d6dbe4;${highlight ? 'font-weight:700' : ''}">${escapeHtml(value)}</td></tr>`;
}

export function reminderEmail(w: Warrant, kind: 'lead' | 'overdue' | 'notice') {
  const s = getSettings();
  const d = daysUntil(w.returnDueDate);
  const fmt = s.app.dateFormat;
  const subject =
    kind === 'notice'
      ? `Notification not yet served - Warrant ${w.warrantNumber} (Case ${w.caseNumber})`
      : d < 0
        ? `OVERDUE: Warrant return ${w.warrantNumber} (Case ${w.caseNumber}) - ${-d} day(s) late`
        : d === 0
          ? `DUE TODAY: Warrant return ${w.warrantNumber} (Case ${w.caseNumber})`
          : `Warrant return ${w.warrantNumber} (Case ${w.caseNumber}) due in ${d} day(s)`;
  const headline = kind === 'notice' ? 'Contemporaneous notification has not been marked as served' : relativeDays(d);
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;max-width:640px">
  <div style="border-left:6px solid ${color(d)};padding:8px 14px;margin-bottom:14px">
    <div style="font-size:12px;letter-spacing:.08em;color:#6b7280;text-transform:uppercase">Warrant Return Tracker</div>
    <div style="font-size:20px;font-weight:700;color:${color(d)}">${escapeHtml(headline)}</div>
  </div>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${row('Warrant #', w.warrantNumber)}${row('Case #', w.caseNumber)}${row('Target(s)', w.targets)}
    ${row('Judge', w.judge)}${row('Signed', formatDate(w.signedDate, fmt))}
    ${row('Executed', w.executedDate ? formatDate(w.executedDate, fmt) : 'Not yet executed')}
    ${row('Return due', formatDate(w.returnDueDate, 'dddd, MMMM D, YYYY'), true)}
  </table>
  <p style="font-size:13px;color:#6b7280;margin-top:16px">Automated reminder from Warrant Return Tracker on ${escapeHtml(s.profile.agencyName || 'this workstation')}. Contains case information - handle per agency policy.</p>
</div>`;
  const text = `${headline}\n\nWarrant #: ${w.warrantNumber}\nCase #: ${w.caseNumber}\nTarget(s): ${w.targets}\nJudge: ${w.judge}\nSigned: ${formatDate(w.signedDate, fmt)}\nReturn due: ${formatDate(w.returnDueDate, 'dddd, MMMM D, YYYY')}\n`;
  return { subject, html, text };
}

export function digestEmail(list: Warrant[]) {
  const s = getSettings();
  const rows = list
    .map((w) => {
      const d = daysUntil(w.returnDueDate);
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:${color(d)};font-weight:700;white-space:nowrap">${escapeHtml(relativeDays(d))}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(w.warrantNumber)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(w.caseNumber)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(w.targets)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${escapeHtml(formatDate(w.returnDueDate, s.app.dateFormat))}</td></tr>`;
    })
    .join('');
  const overdue = list.filter((w) => daysUntil(w.returnDueDate) < 0).length;
  const subject = `Warrant returns: ${list.length} need attention${overdue ? ` (${overdue} overdue)` : ''}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;max-width:760px">
  <h2 style="margin:0 0 10px">Daily warrant return summary</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="text-align:left;color:#6b7280"><th style="padding:6px 8px">Status</th><th style="padding:6px 8px">Warrant #</th><th style="padding:6px 8px">Case #</th><th style="padding:6px 8px">Target(s)</th><th style="padding:6px 8px">Due</th></tr></thead><tbody>${rows}</tbody></table>
  <p style="font-size:12px;color:#6b7280">Automated summary from Warrant Return Tracker.</p></div>`;
  const text = list.map((w) => `${relativeDays(daysUntil(w.returnDueDate))}  ${w.warrantNumber}  Case ${w.caseNumber}  ${w.targets}`).join('\n');
  return { subject, html, text };
}
