import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { SETTINGS_FILE, SECRETS_FILE, SIGNATURE_FILE } from './paths';
import { DEFAULT_PHRASES, type Settings } from '../shared/types';
import { log } from './log';

export function defaultSettings(): Settings {
  return {
    setupComplete: false,
    profile: {
      title: 'Detective',
      fullName: '',
      badgeNumber: '',
      phone: '',
      email: '',
      unit: '',
      agencyName: '',
      agencyShortName: '',
      county: '',
      state: 'California',
      courtName: '',
    },
    notifications: {
      methods: ['desktop'],
      leadTimes: [7, 3, 1, 0],
      overdueDaily: true,
      digestEnabled: false,
      digestHour: 7,
      recipient: '',
    },
    smtp: {
      host: '',
      port: 587,
      security: 'starttls',
      username: '',
      from: '',
      allowSelfSigned: false,
      hasPassword: false,
    },
    app: {
      theme: 'dark',
      minimizeToTray: true,
      startOnLogin: false,
      startMinimized: false,
      lockEnabled: false,
      lockMinutes: 15,
      hasPin: false,
      outputFolder: '',
      askWhereToSave: true,
      archiveOnReturn: true,
      dateFormat: 'MM/DD/YYYY',
    },
    signature: { hasSignature: false, widthInches: 2, useByDefault: true, updatedAt: null },
    phrases: DEFAULT_PHRASES.map((p) => ({ ...p, types: [...p.types] })),
    dueRules: [
      { id: 'r10', name: '10 days (Cal. Penal Code 1534)', days: 10, dayType: 'calendar' },
      { id: 'r30', name: '30 calendar days', days: 30, dayType: 'calendar' },
      { id: 'r60', name: '60 calendar days', days: 60, dayType: 'calendar' },
      { id: 'r90', name: '90 calendar days', days: 90, dayType: 'calendar' },
      { id: 'c10', name: '10 court days', days: 10, dayType: 'court' },
    ],
    holidays: [],
    backup: { autoDaily: true, keep: 14, folder: '', lastBackupAt: null },
  };
}

interface Secrets {
  smtpPassword?: string;
  pinHash?: string; // scrypt$salt$hash
}

let cache: Settings | null = null;

function deepMerge<T>(base: T, over: unknown): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return (over === undefined ? base : over) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  if (over && typeof over === 'object') {
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      const b = (base as Record<string, unknown>)[k];
      out[k] = b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, v) : v;
    }
  }
  return out as T;
}

export function getSettings(): Settings {
  if (cache) return cache;
  let s = defaultSettings();
  if (existsSync(SETTINGS_FILE)) {
    try {
      s = deepMerge(s, JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')));
    } catch (e) {
      log('error', 'settings.json unreadable, using defaults', e);
    }
  }
  const sec = readSecrets();
  s.smtp.hasPassword = !!sec.smtpPassword;
  s.app.hasPin = !!sec.pinHash;
  s.signature.hasSignature = existsSync(SIGNATURE_FILE);
  cache = s;
  return s;
}

export function saveSettings(s: Settings) {
  const sec = readSecrets();
  s.smtp.hasPassword = !!sec.smtpPassword;
  s.app.hasPin = !!sec.pinHash;
  if (!s.app.hasPin) s.app.lockEnabled = false;
  s.signature.hasSignature = existsSync(SIGNATURE_FILE);
  const tmp = SETTINGS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, SETTINGS_FILE);
  cache = s;
}

// ---- secrets: encrypted with Windows DPAPI via Electron safeStorage ----

function readSecrets(): Secrets {
  if (!existsSync(SECRETS_FILE)) return {};
  try {
    const buf = readFileSync(SECRETS_FILE);
    if (!safeStorage.isEncryptionAvailable()) return {};
    return JSON.parse(safeStorage.decryptString(buf));
  } catch (e) {
    log('warn', 'could not decrypt secrets (different Windows user or machine?)', e);
    return {};
  }
}

function writeSecrets(sec: Secrets) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available; cannot store secrets.');
  writeFileSync(SECRETS_FILE, safeStorage.encryptString(JSON.stringify(sec)));
}

export function setSmtpPassword(pw: string) {
  const sec = readSecrets();
  if (pw) sec.smtpPassword = pw;
  else delete sec.smtpPassword;
  writeSecrets(sec);
  const s = getSettings();
  s.smtp.hasPassword = !!pw;
  saveSettings(s);
}

export function getSmtpPassword(): string | undefined {
  return readSecrets().smtpPassword;
}

export function setPin(pin: string | null) {
  const sec = readSecrets();
  if (pin) {
    const salt = randomBytes(16);
    const hash = scryptSync(pin, salt, 32);
    sec.pinHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  } else delete sec.pinHash;
  writeSecrets(sec);
  const s = getSettings();
  s.app.hasPin = !!pin;
  if (!pin) s.app.lockEnabled = false;
  saveSettings(s);
}

export function verifyPin(pin: string): boolean {
  const h = readSecrets().pinHash;
  if (!h) return true;
  const [, saltHex, hashHex] = h.split('$');
  const got = scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
  return timingSafeEqual(got, Buffer.from(hashHex, 'hex'));
}

// ---- signature image: PNG encrypted with DPAPI so a copied data folder cannot be used to sign ----

export function setSignature(png: Uint8Array | null) {
  if (png) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available; cannot store a signature.');
    if (png.length > 2_000_000) throw new Error('Signature image is too large (max 2 MB).');
    const b64 = Buffer.from(png).toString('base64');
    writeFileSync(SIGNATURE_FILE, safeStorage.encryptString(b64));
  } else if (existsSync(SIGNATURE_FILE)) unlinkSync(SIGNATURE_FILE);
  const s = getSettings();
  s.signature.updatedAt = png ? new Date().toISOString() : null;
  saveSettings(s);
}

export function getSignaturePng(): Buffer | null {
  if (!existsSync(SIGNATURE_FILE)) return null;
  try {
    return Buffer.from(safeStorage.decryptString(readFileSync(SIGNATURE_FILE)), 'base64');
  } catch (e) {
    log('warn', 'could not decrypt signature (different Windows user?)', e);
    return null;
  }
}

export function invalidateSettingsCache() {
  cache = null;
}
