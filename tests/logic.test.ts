import { describe, it, expect } from 'vitest';
import { addCourtDays, applyDueRule, daysUntil, formatDate, parseLooseDate, numberToWords, parseISO } from '../src/shared/dates';
import { decideReminders } from '../src/main/reminderLogic';
import { stripJudgePrefix } from '../src/shared/fields';
import { buildIcs } from '../src/main/ics';
import { sampleWarrant } from '../src/shared/fields';
import { DEFAULT_PHRASES, seedNewDefaultPhrases } from '../src/shared/types';

describe('dates', () => {
  it('parses YYYY-MM-DD as a local date (no UTC off-by-one)', () => {
    const d = parseISO('2025-01-10');
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });
  it('formats legal-style dates', () => {
    expect(formatDate('2023-12-05', 'Do [day of] MMMM, YYYY')).toBe('5th day of December, 2023');
    expect(formatDate('2023-12-13', 'MMMM Do, YYYY')).toBe('December 13th, 2023');
    expect(formatDate('2024-03-22', 'Do')).toBe('22nd');
    expect(formatDate('2024-03-11', 'Do')).toBe('11th');
  });
  it('counts calendar and court days', () => {
    expect(applyDueRule('2025-01-10', { id: 'a', name: '', days: 10, dayType: 'calendar' })).toBe('2025-01-20');
    // Fri 2025-01-10 + 10 court days, skipping MLK day 2025-01-20
    expect(addCourtDays('2025-01-10', 10, ['2025-01-20'])).toBe('2025-01-27');
  });
  it('days until handles DST boundaries', () => {
    expect(daysUntil('2025-03-10', '2025-03-08')).toBe(2);
    expect(daysUntil('2025-11-03', '2025-11-01')).toBe(2);
  });
  it('reads dates out of warrant text', () => {
    expect(parseLooseDate('signed this 5th day of December, 2023')).toBe('2023-12-05');
    expect(parseLooseDate('Date: 12/5/2023')).toBe('2023-12-05');
    expect(parseLooseDate('January 3, 2026 at 10:00')).toBe('2026-01-03');
    expect(parseLooseDate('nothing here')).toBeNull();
  });
  it('spells quantities', () => {
    expect(numberToWords(23)).toBe('twenty-three');
    expect(numberToWords(105)).toBe('one hundred five');
  });
  it('strips judge prefixes', () => {
    expect(stripJudgePrefix('Hon. Jane Smith')).toBe('Jane Smith');
    expect(stripJudgePrefix('The Honorable Jane Smith')).toBe('Jane Smith');
    expect(stripJudgePrefix('Judge Bob Lee')).toBe('Bob Lee');
  });
});

describe('reminders', () => {
  const base = { id: 1, status: 'pending' as const, deletedAt: null, snoozeUntil: null, notificationRequired: false, notificationServedDate: null, executedDate: null };

  it('fires when a threshold is crossed even if the exact day was missed (v1 bug)', () => {
    // due in 2 days; lead times 7,3,1 - app was closed on the 7- and 3-day marks
    const d = decideReminders([{ ...base, returnDueDate: '2025-06-12' }], [7, 3, 1], true, new Set(), '2025-06-10');
    expect(d).toHaveLength(1);
    expect(d[0].keys.sort()).toEqual(['lead:3', 'lead:7']);
  });
  it('does not repeat a threshold already sent', () => {
    const sent = new Set(['1|lead:7', '1|lead:3']);
    expect(decideReminders([{ ...base, returnDueDate: '2025-06-12' }], [7, 3, 1], true, sent, '2025-06-10')).toHaveLength(0);
    expect(decideReminders([{ ...base, returnDueDate: '2025-06-12' }], [7, 3, 1], true, sent, '2025-06-11')).toHaveLength(1);
  });
  it('overdue alerts once per day', () => {
    const w = { ...base, returnDueDate: '2025-06-01' };
    const d1 = decideReminders([w], [3], true, new Set(), '2025-06-05');
    expect(d1[0].kind).toBe('overdue');
    expect(decideReminders([w], [3], true, new Set(['1|overdue:2025-06-05']), '2025-06-05')).toHaveLength(0);
    expect(decideReminders([w], [3], true, new Set(['1|overdue:2025-06-05']), '2025-06-06')).toHaveLength(1);
  });
  it('respects snooze, filed and trash', () => {
    expect(decideReminders([{ ...base, returnDueDate: '2025-06-11', snoozeUntil: '2025-06-11' }], [3], true, new Set(), '2025-06-10')).toHaveLength(0);
    expect(decideReminders([{ ...base, returnDueDate: '2025-06-11', status: 'filed' }], [3], true, new Set(), '2025-06-10')).toHaveLength(0);
    expect(decideReminders([{ ...base, returnDueDate: '2025-06-11', deletedAt: 'x' }], [3], true, new Set(), '2025-06-10')).toHaveLength(0);
  });
  it('flags an unserved CalECPA notice after execution', () => {
    const d = decideReminders([{ ...base, returnDueDate: '2025-07-30', notificationRequired: true, executedDate: '2025-06-10' }], [3], true, new Set(), '2025-06-10');
    expect(d.map((x) => x.kind)).toEqual(['notice']);
  });
});

describe('calendar export', () => {
  it('produces an all-day event on the due date with alarms', () => {
    const ics = buildIcs([{ ...sampleWarrant(), id: 7 }], [3, 1, 0], 'Agency, Unit');
    expect(ics).toContain('DTSTART;VALUE=DATE:20231215');
    expect(ics).toContain('DTEND;VALUE=DATE:20231216');
    expect(ics).toContain('TRIGGER:-P3D');
    expect(ics).toContain('LOCATION:Agency\\, Unit');
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe('amendment template fields', () => {
  it('exposes amendment text and dates', async () => {
    const { buildTemplateData, sampleWarrant: sw } = await import('../src/shared/fields');
    const { defaultSettingsForTest } = await import('./helpers');
    const w = {
      ...sw(),
      amendments: [
        { id: 1, warrantId: 0, number: 1, signedDate: '2023-12-08', judge: 'Hon. Jane Smith', summary: 'Added the detached garage', addedScope: 'Detached garage', previousDueDate: null, newDueDate: null, attachmentId: null, createdAt: '', updatedAt: '' },
      ],
    };
    const d = buildTemplateData(w, defaultSettingsForTest());
    expect(d.amendmentCount).toBe('1');
    expect(d.asAmendedText).toBe('as amended on December 8, 2023');
    expect(d.amendedDateLegal).toBe('8th day of December, 2023');
    expect(d.amendmentsText).toBe('Amendment 1, signed December 8, 2023 by Hon. Jane Smith: Added the detached garage');
    const none = buildTemplateData(sw(), defaultSettingsForTest());
    expect(none.asAmendedText).toBe('');
    expect(none.amendmentCount).toBe('0');
  });
});

describe('saved text defaults', () => {
  const provider = DEFAULT_PHRASES.find((p) => p.id === 'provider-data')!;
  it('adds the newer built-ins to settings saved by 2.2.0', () => {
    const r = seedNewDefaultPhrases([{ ...provider }], undefined);
    expect(r.phrases.map((p) => p.id)).toEqual(['provider-data', 'device-data', 'see-receipt']);
    expect(r.phrases[1].text.startsWith('Digital data and electronic information collected, extracted, recovered')).toBe(true);
    expect(r.phrases[1].types).toContain('device');
  });
  it('does not bring back a built-in the user deleted', () => {
    expect(seedNewDefaultPhrases([], undefined).phrases.map((p) => p.id)).toEqual(['device-data', 'see-receipt']);
    expect(seedNewDefaultPhrases([], ['provider-data', 'device-data', 'see-receipt']).phrases).toEqual([]);
  });
  it('adds the see-attached receipt text to settings saved by 2.3.0', () => {
    const r = seedNewDefaultPhrases([{ ...provider }], ['provider-data', 'device-data']);
    expect(r.phrases.map((p) => p.id)).toEqual(['provider-data', 'see-receipt']);
    expect(r.phrases[1].text).toBe('See attached Property Receipt, incorporated herein by reference.');
  });
  it('keeps user edits to a built-in', () => {
    const edited = { ...provider, text: 'My wording' };
    const r = seedNewDefaultPhrases([edited], ['provider-data']);
    expect(r.phrases.find((p) => p.id === 'provider-data')!.text).toBe('My wording');
  });
});
