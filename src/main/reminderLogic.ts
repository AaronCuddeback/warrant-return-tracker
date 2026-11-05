// Pure reminder decision logic (unit tested).
//
// v1 only fired when "days left" EXACTLY equalled a lead time, and only if the app happened to
// be running at that moment - a closed laptop over a weekend meant no reminder at all.
// Here a threshold fires as soon as it has been crossed and not yet notified (catch-up),
// overdue warrants alert once per day, and outstanding CalECPA notices are flagged.

import { daysUntil } from '../shared/dates';
import type { ISODate, Warrant } from '../shared/types';

export interface ReminderDecision {
  warrantId: number;
  kind: 'lead' | 'overdue' | 'notice';
  daysLeft: number;
  /** keys to record as sent once delivered */
  keys: string[];
}

export function decideReminders(
  warrants: Pick<Warrant, 'id' | 'status' | 'deletedAt' | 'returnDueDate' | 'snoozeUntil' | 'notificationRequired' | 'notificationServedDate' | 'executedDate'>[],
  leadTimes: number[],
  overdueDaily: boolean,
  sent: Set<string>, // `${warrantId}|${key}`
  today: ISODate,
): ReminderDecision[] {
  const out: ReminderDecision[] = [];
  const leads = [...new Set(leadTimes.filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => b - a);
  for (const w of warrants) {
    if (w.deletedAt || w.status === 'filed') continue;
    if (w.snoozeUntil && daysUntil(w.snoozeUntil, today) >= 0) continue;
    const left = daysUntil(w.returnDueDate, today);
    const has = (k: string) => sent.has(`${w.id}|${k}`);

    if (left < 0) {
      const key = `overdue:${today}`;
      if (overdueDaily && !has(key)) out.push({ warrantId: w.id, kind: 'overdue', daysLeft: left, keys: [key] });
    } else {
      const crossed = leads.filter((t) => left <= t).map((t) => `lead:${t}`);
      const unsent = crossed.filter((k) => !has(k));
      if (unsent.length) out.push({ warrantId: w.id, kind: 'lead', daysLeft: left, keys: unsent });
    }

    if (w.notificationRequired && w.executedDate && !w.notificationServedDate && !has('notice')) {
      out.push({ warrantId: w.id, kind: 'notice', daysLeft: left, keys: ['notice'] });
    }
  }
  return out;
}
