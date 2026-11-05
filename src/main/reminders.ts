import { Notification, shell } from 'electron';
import { all, run, tx, getMeta, setMeta } from './db';
import { getSettings } from './settings';
import { getWarrant, listWarrants, audit } from './repo';
import { decideReminders, type ReminderDecision } from './reminderLogic';
import { reminderEmail, digestEmail, sendMail } from './email';
import { daysUntil, relativeDays, todayISO } from '../shared/dates';
import { log } from './log';
import type { Warrant } from '../shared/types';

let timer: NodeJS.Timeout | null = null;
let running = false;
let onClick: (warrantId: number) => void = () => {};
let iconPath = '';

export function startReminders(opts: { onClick: (id: number) => void; icon: string }) {
  onClick = opts.onClick;
  iconPath = opts.icon;
  setTimeout(() => void checkNow(), 8_000);
  timer = setInterval(() => void checkNow(), 30 * 60 * 1000);
}

export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function desktopNotify(title: string, body: string, warrantId?: number) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title, body, icon: iconPath || undefined, urgency: 'critical' });
  if (warrantId) n.on('click', () => onClick(warrantId));
  n.show();
  return true;
}

function mailtoOpen(w: Warrant, kind: ReminderDecision['kind']) {
  const s = getSettings();
  const { subject, text } = reminderEmail(w, kind);
  const to = s.notifications.recipient || s.profile.email;
  void shell.openExternal(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
}

export async function deliver(w: Warrant, kind: ReminderDecision['kind']): Promise<string[]> {
  const s = getSettings();
  const d = daysUntil(w.returnDueDate);
  const delivered: string[] = [];
  for (const m of s.notifications.methods) {
    try {
      if (m === 'desktop') {
        const title = kind === 'notice' ? 'Notification not served' : d < 0 ? 'Warrant return OVERDUE' : 'Warrant return reminder';
        const body =
          kind === 'notice'
            ? `${w.warrantNumber} (Case ${w.caseNumber}): executed but the PC 1546.2 notice is not marked served.`
            : `${w.warrantNumber} (Case ${w.caseNumber}) - ${relativeDays(d)}${w.targets ? ` - ${w.targets}` : ''}`;
        if (desktopNotify(title, body, w.id)) delivered.push('desktop');
      } else if (m === 'smtp') {
        if (s.notifications.digestEnabled) continue; // email goes out in the daily digest instead
        const e = reminderEmail(w, kind);
        await sendMail(e.subject, e.html, e.text);
        delivered.push('email');
      } else if (m === 'mailto') {
        mailtoOpen(w, kind);
        delivered.push('mail-client');
      }
    } catch (e) {
      log('error', `reminder via ${m} failed for warrant ${w.id}`, e);
    }
  }
  return delivered;
}

async function maybeDigest() {
  const s = getSettings();
  if (!s.notifications.digestEnabled || !s.notifications.methods.includes('smtp')) return;
  const today = todayISO();
  if (new Date().getHours() < s.notifications.digestHour) return;
  if (getMeta('digestSent') === today) return;
  const horizon = Math.max(0, ...s.notifications.leadTimes);
  const list = listWarrants({ view: 'active' }).filter((w) => daysUntil(w.returnDueDate) <= horizon);
  if (!list.length) {
    tx(() => setMeta('digestSent', today));
    return;
  }
  const e = digestEmail(list);
  await sendMail(e.subject, e.html, e.text);
  tx(() => {
    setMeta('digestSent', today);
    audit(null, 'reminder', `Daily digest emailed (${list.length} warrants)`);
  });
}

/** Evaluate all warrants and send what is due. Returns number of reminders delivered. */
export async function checkNow(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const s = getSettings();
    if (!s.setupComplete) return 0;
    const sent = new Set(all<{ warrantId: number; key: string }>('SELECT warrantId, key FROM reminders_sent').map((r) => `${r.warrantId}|${r.key}`));
    const ws = listWarrants({ view: 'active' });
    const decisions = s.notifications.methods.length
      ? decideReminders(ws, s.notifications.leadTimes, s.notifications.overdueDaily, sent, todayISO())
      : [];
    let count = 0;
    for (const dcs of decisions) {
      const w = getWarrant(dcs.warrantId);
      if (!w) continue;
      const via = await deliver(w, dcs.kind);
      if (!via.length && !s.notifications.digestEnabled) continue;
      count++;
      tx(() => {
        for (const k of dcs.keys) {
          run('INSERT OR IGNORE INTO reminders_sent (warrantId, key, channel, sentAt) VALUES (?,?,?,?)', [w.id, k, 'all', new Date().toISOString()]);
        }
        audit(w.id, 'reminder', `${dcs.kind === 'notice' ? 'Notice reminder' : relativeDays(dcs.daysLeft)} - via ${via.join(', ') || 'digest'}`);
      });
    }
    await maybeDigest().catch((e) => log('error', 'digest failed', e));
    return count;
  } catch (e) {
    log('error', 'reminder check failed', e);
    return 0;
  } finally {
    running = false;
  }
}

export async function sendReminderNow(id: number) {
  const w = getWarrant(id);
  if (!w) throw new Error('Warrant not found');
  const s = getSettings();
  if (!s.notifications.methods.length) throw new Error('No notification methods are enabled (Settings > Notifications).');
  const d = daysUntil(w.returnDueDate);
  const via: string[] = [];
  for (const m of s.notifications.methods) {
    if (m === 'smtp') {
      const e = reminderEmail(w, d < 0 ? 'overdue' : 'lead');
      await sendMail(e.subject, e.html, e.text);
      via.push('email');
    } else if (m === 'desktop') {
      desktopNotify('Warrant return reminder', `${w.warrantNumber} (Case ${w.caseNumber}) - ${relativeDays(d)}`, w.id);
      via.push('desktop');
    } else if (m === 'mailto') {
      mailtoOpen(w, d < 0 ? 'overdue' : 'lead');
      via.push('mail-client');
    }
  }
  tx(() => audit(w.id, 'reminder', `Manual reminder sent via ${via.join(', ')}`));
}
