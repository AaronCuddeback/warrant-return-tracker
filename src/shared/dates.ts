// Calendar-date helpers. All dates are handled as LOCAL calendar dates ('YYYY-MM-DD').
// (v1 used `new Date('2025-01-10')`, which JavaScript treats as UTC midnight - in Pacific
// time that is the previous evening, so reminders and calendar entries could be a day off.)

import type { ISODate, DueRule } from './types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

/** Parse 'YYYY-MM-DD' as local midnight. Also accepts full ISO timestamps (date part used). */
export function parseISO(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  if (!m) return new Date(NaN);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return new Date(NaN); // e.g. 2025-02-31
  return d;
}

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function isWeekend(iso: ISODate): boolean {
  const day = parseISO(iso).getDay();
  return day === 0 || day === 6;
}

/** Add court (business) days - skips weekends and listed holidays. */
export function addCourtDays(iso: ISODate, n: number, holidays: ISODate[] = []): ISODate {
  const hol = new Set(holidays);
  let cur = iso;
  let added = 0;
  while (added < n) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur) && !hol.has(cur)) added++;
  }
  return cur;
}

/** If a date lands on a weekend/holiday, roll forward to the next court day. */
export function nextCourtDay(iso: ISODate, holidays: ISODate[] = []): ISODate {
  const hol = new Set(holidays);
  let cur = iso;
  while (isWeekend(cur) || hol.has(cur)) cur = addDays(cur, 1);
  return cur;
}

export function applyDueRule(signed: ISODate, rule: DueRule, holidays: ISODate[] = []): ISODate {
  if (rule.dayType === 'court') return addCourtDays(signed, rule.days, holidays);
  return addDays(signed, rule.days);
}

/** Whole calendar days from `from` (default today) until `iso`. Negative = past. */
export function daysUntil(iso: ISODate, from: ISODate = todayISO()): number {
  const a = parseISO(from).getTime();
  const b = parseISO(iso).getTime();
  // Round to absorb DST hour shifts.
  return Math.round((b - a) / 86_400_000);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 23 -> "twenty-three" (0-999). Used for "Twenty-three (23) grams" style inventories. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
}

/**
 * Format a date with tokens:
 * YYYY YY MMMM MMM MM M DD D Do dddd ddd
 * Text inside [brackets] is literal, e.g. 'Do [day of] MMMM, YYYY' -> '5th day of December, 2023'.
 */
export function formatDate(iso: ISODate | null | undefined, fmt = 'MMMM D, YYYY'): string {
  if (!iso) return '';
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tokens: Record<string, () => string> = {
    YYYY: () => String(d.getFullYear()),
    YY: () => String(d.getFullYear()).slice(-2),
    MMMM: () => MONTHS[d.getMonth()],
    MMM: () => MONTHS[d.getMonth()].slice(0, 3),
    MM: () => String(d.getMonth() + 1).padStart(2, '0'),
    M: () => String(d.getMonth() + 1),
    Do: () => ordinal(d.getDate()),
    DD: () => String(d.getDate()).padStart(2, '0'),
    D: () => String(d.getDate()),
    dddd: () => WEEKDAYS[d.getDay()],
    ddd: () => WEEKDAYS[d.getDay()].slice(0, 3),
  };
  return fmt.replace(/\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd/g, (m, lit) =>
    lit !== undefined ? lit : tokens[m](),
  );
}

export function displayDate(iso: ISODate | null | undefined, pref: string = 'MM/DD/YYYY'): string {
  return formatDate(iso, pref);
}

export function relativeDays(n: number): string {
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n > 1) return `Due in ${n} days`;
  if (n === -1) return 'Overdue by 1 day';
  return `Overdue by ${-n} days`;
}

export type Urgency = 'overdue' | 'today' | 'critical' | 'soon' | 'ok' | 'done';

export function urgencyOf(daysLeft: number, filed = false): Urgency {
  if (filed) return 'done';
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  if (daysLeft <= 3) return 'critical';
  if (daysLeft <= 7) return 'soon';
  return 'ok';
}

/** Try to read a date out of free text: 12/5/2023, 2023-12-05, December 5, 2023, 5th day of December, 2023 */
export function parseLooseDate(text: string): ISODate | null {
  const t = text.trim();
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) return safe(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(t);
  if (m) return safe(fixYear(+m[3]), +m[1], +m[2]);
  const mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  m = new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i').exec(t);
  if (m) return safe(+m[3], monthIndex(m[1]) + 1, +m[2]);
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${mon},?\\s+(\\d{4})`, 'i').exec(t);
  if (m) return safe(+m[3], monthIndex(m[2]) + 1, +m[1]);
  return null;

  function fixYear(y: number) { return y < 100 ? 2000 + y : y; }
  function monthIndex(s: string) { return MONTHS.findIndex((x) => x.toLowerCase().startsWith(s.slice(0, 3).toLowerCase())); }
  function safe(y: number, mo: number, d: number): ISODate | null {
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isISODate(iso) ? iso : null;
  }
}
