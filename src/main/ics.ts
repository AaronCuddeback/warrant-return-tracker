// iCalendar (.ics) export - imports into Outlook / Google / Apple calendars.
import { addDays, formatDate } from '../shared/dates';
import type { Warrant } from '../shared/types';

function esc(s: string) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const ymd = (iso: string) => iso.replace(/-/g, '');

export function buildIcs(warrants: Warrant[], leadTimes: number[], agency: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Warrant Return Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const w of warrants) {
    const summary = `Warrant return due - ${w.warrantNumber || ''} (Case ${w.caseNumber})`;
    const desc = [
      `Warrant #: ${w.warrantNumber}`, `Case #: ${w.caseNumber}`, `Target(s): ${w.targets}`, `Judge: ${w.judge}`,
      `Signed: ${formatDate(w.signedDate, 'MM/DD/YYYY')}`, `Return due: ${formatDate(w.returnDueDate, 'MM/DD/YYYY')}`,
    ].join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:wrt-${w.id}-${ymd(w.signedDate)}@warrant-return-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(w.returnDueDate)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(w.returnDueDate, 1))}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(desc)}`,
      ...(agency ? [`LOCATION:${esc(agency)}`] : []),
      'CATEGORIES:Warrant Return',
      'TRANSP:TRANSPARENT',
    );
    for (const lt of [...new Set(leadTimes)].filter((n) => n > 0)) {
      lines.push('BEGIN:VALARM', `TRIGGER:-P${lt}D`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
