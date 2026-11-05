import { appendFileSync, statSync, renameSync } from 'node:fs';
import { LOG_FILE } from './paths';

/** Tiny rotating log file (no network, no telemetry). */
export function log(level: 'info' | 'warn' | 'error', msg: string, err?: unknown) {
  const line = `${new Date().toISOString()} [${level}] ${msg}${err ? ' :: ' + (err instanceof Error ? err.stack || err.message : String(err)) : ''}\n`;
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
  try {
    try {
      if (statSync(LOG_FILE).size > 2_000_000) renameSync(LOG_FILE, LOG_FILE + '.old');
    } catch {
      /* no file yet */
    }
    appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore logging failures */
  }
}
