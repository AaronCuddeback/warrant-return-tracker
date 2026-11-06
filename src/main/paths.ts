import { app } from 'electron';
import { existsSync, mkdirSync, accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Data location:
 *  - Portable mode: if a folder named "data" exists next to the EXE (and is writable), all data
 *    lives there. Lets the app run from a forensic tools folder / USB without touching %APPDATA%.
 *  - Otherwise: %APPDATA%\WarrantReturnTracker
 */
function resolveDataDir(): { dir: string; portable: boolean } {
  // Used by the automated test harness only (unpackaged builds).
  if (!app.isPackaged && process.env.WRT_DATA_DIR) return { dir: process.env.WRT_DATA_DIR, portable: false };
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'));
  const portableDir = join(exeDir, 'data');
  if (app.isPackaged && existsSync(portableDir)) {
    try {
      accessSync(portableDir, constants.W_OK);
      return { dir: portableDir, portable: true };
    } catch {
      /* fall through */
    }
  }
  return { dir: join(app.getPath('appData'), 'WarrantReturnTracker'), portable: false };
}

const resolved = resolveDataDir();
export const DATA_DIR = resolved.dir;
export const PORTABLE = resolved.portable;
export const DB_FILE = join(DATA_DIR, 'tracker.db');
export const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
export const SECRETS_FILE = join(DATA_DIR, 'secrets.bin');
export const ATTACH_DIR = join(DATA_DIR, 'attachments');
export const TEMPLATE_DIR = join(DATA_DIR, 'templates');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const LOGO_FILE = join(DATA_DIR, 'agency-logo.png');
export const SIGNATURE_FILE = join(DATA_DIR, 'signature.bin');
export const LOG_FILE = join(DATA_DIR, 'app.log');

export function ensureDirs() {
  for (const d of [DATA_DIR, ATTACH_DIR, TEMPLATE_DIR, BACKUP_DIR]) mkdirSync(d, { recursive: true });
}

/** Location of files bundled with the app (built-in templates, icons, wasm). */
export function resourcePath(...p: string[]) {
  return join(__dirname, ...p);
}

/** Default location of v1 ("warrant-return-tracker") data. */
export function v1DbPath() {
  return join(app.getPath('appData'), 'warrant-return-tracker', 'warrants.db');
}
