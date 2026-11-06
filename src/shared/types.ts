// Types shared by the main process, preload and renderer.

/** Calendar date stored as 'YYYY-MM-DD' (local, no time zone). */
export type ISODate = string;

export type WarrantStatus = 'pending' | 'executed' | 'filed';

export type WarrantType =
  | 'premises'
  | 'vehicle'
  | 'person'
  | 'device'
  | 'provider'
  | 'tracking'
  | 'other';

export const WARRANT_TYPES: { value: WarrantType; label: string }[] = [
  { value: 'premises', label: 'Premises / Residence' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'person', label: 'Person' },
  { value: 'device', label: 'Electronic Device' },
  { value: 'provider', label: 'Electronic Service Provider (records)' },
  { value: 'tracking', label: 'Tracking / Pen Register' },
  { value: 'other', label: 'Other' },
];

export interface ReturnItem {
  qty: string;
  description: string;
  locationFound: string;
}

export interface Warrant {
  id: number;
  caseNumber: string;
  warrantNumber: string;
  warrantType: WarrantType;
  targets: string; // suspect(s) / subject(s)
  judge: string;
  court: string;
  signedDate: ISODate;
  receivedDate: ISODate | null; // date officer received the warrant (defaults to signed)
  executedDate: ISODate | null; // date the search was conducted / warrant served
  returnDueDate: ISODate;
  dueRule: string; // label of the rule used to calculate due date
  locations: string; // premises / devices / accounts searched
  provider: string; // e.g. Google LLC
  items: ReturnItem[];
  itemsText: string; // free-text inventory (used when items list is empty)
  investigationNature: string;
  notes: string;
  assignedTo: string;
  tags: string;
  status: WarrantStatus;
  notificationRequired: boolean;
  notificationServedDate: ISODate | null;
  filedDate: ISODate | null;
  snoozeUntil: ISODate | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Populated by getWarrant (read-only). */
  amendments?: Amendment[];
}

export type WarrantInput = Omit<
  Warrant,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'amendments'
>;

export interface Amendment {
  id: number;
  warrantId: number;
  number: number;
  signedDate: ISODate;
  judge: string;
  summary: string;
  addedScope: string;
  previousDueDate: ISODate | null;
  newDueDate: ISODate | null;
  attachmentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AmendmentInput {
  id?: number;
  warrantId: number;
  signedDate: ISODate;
  judge: string;
  summary: string;
  addedScope: string;
  /** Append addedScope to the warrant's "places searched" text. */
  appendScope?: boolean;
  /** New return due date (null = keep current). */
  newDueDate: ISODate | null;
}

export interface WarrantListItem extends Warrant {
  attachmentCount: number;
  amendmentCount: number;
  hasWarrantDoc: boolean;
  returnGenerated: boolean;
  notificationGenerated: boolean;
}

export type AttachmentKind = 'warrant' | 'amendment' | 'return' | 'notification' | 'affidavit' | 'provider-return' | 'other';

export const ATTACHMENT_KINDS: { value: AttachmentKind; label: string }[] = [
  { value: 'warrant', label: 'Signed warrant' },
  { value: 'amendment', label: 'Amendment to warrant' },
  { value: 'affidavit', label: 'Affidavit / Statement of PC' },
  { value: 'return', label: 'Return of search warrant' },
  { value: 'notification', label: 'Notification' },
  { value: 'provider-return', label: 'Provider return / records' },
  { value: 'other', label: 'Other' },
];

export interface Attachment {
  id: number;
  warrantId: number;
  kind: AttachmentKind;
  originalName: string;
  storedName: string;
  sha256: string;
  size: number;
  generated: boolean;
  templateName: string | null;
  addedAt: string;
}

export interface AuditEntry {
  id: number;
  warrantId: number | null;
  at: string;
  user: string;
  action: string;
  summary: string;
  details: string | null; // JSON
}

export type TemplateKind = 'return' | 'notification' | 'other';

export interface TemplateInfo {
  id: string;
  name: string;
  kind: TemplateKind;
  description: string;
  builtIn: boolean;
  isDefault: boolean;
  fileName: string;
  sha256: string;
  /** Legacy/numeric tag mapping, e.g. { "1": "warrantNumber" } */
  mapping: Record<string, string>;
  outputPattern: string; // file naming pattern
  createdAt: string;
}

export interface TemplateInspection {
  ok: boolean;
  error?: string;
  tags: { tag: string; status: 'known' | 'mapped' | 'numeric' | 'unknown' | 'loop'; field?: string }[];
}

/** Reusable "property taken" text (canned inventory language). */
export interface SavedPhrase {
  id: string;
  name: string;
  text: string;
  /** Warrant types for which the return wizard suggests this text. */
  types: WarrantType[];
}

export const DEFAULT_PHRASES: SavedPhrase[] = [
  {
    id: 'provider-data',
    name: 'Electronic data from service provider',
    text: 'Digital data, records, and information associated with the target account(s), identifier(s), device(s), telephone number(s), and/or IP address(es), including account and subscriber information, communications, media, files, logs, device and connection information, location data, metadata, and other electronic records produced by the service provider pursuant to the search warrant.',
    types: ['provider'],
  },
  {
    id: 'device-data',
    name: 'Electronic data from seized device(s)',
    text: 'Digital data and electronic information collected, extracted, recovered, and/or examined from the electronic device(s) authorized for search pursuant to the search warrant and listed as property seized above, within the scope authorized by the same search warrant.',
    types: ['device', 'premises', 'vehicle', 'person'],
  },
];

/** IDs of built-in phrases that settings saved before `phraseDefaultsSeen` existed (2.2.0) already offered. */
const LEGACY_SEEN_DEFAULTS = ['provider-data'];

/**
 * Adds built-in phrases introduced in a newer version to an existing phrase list.
 * A built-in phrase is offered once: if the user later deletes it, it is not re-added.
 */
export function seedNewDefaultPhrases(phrases: SavedPhrase[], seen: string[] | undefined): { phrases: SavedPhrase[]; seen: string[] } {
  const seenSet = new Set(seen ?? LEGACY_SEEN_DEFAULTS);
  const out = [...phrases];
  for (const d of DEFAULT_PHRASES) {
    if (seenSet.has(d.id)) continue;
    if (!out.some((p) => p.id === d.id)) out.push({ ...d, types: [...d.types] });
    seenSet.add(d.id);
  }
  return { phrases: out, seen: [...seenSet] };
}

export interface DueRule {
  id: string;
  name: string;
  days: number;
  dayType: 'calendar' | 'court';
}

export type NotifyMethod = 'desktop' | 'smtp' | 'mailto';

export interface Settings {
  setupComplete: boolean;
  profile: {
    title: string; // Detective, Deputy, Agent...
    fullName: string;
    badgeNumber: string;
    phone: string;
    email: string;
    unit: string;
    agencyName: string;
    agencyShortName: string;
    county: string;
    state: string;
    courtName: string; // e.g. Superior Court of California, County of El Dorado
  };
  notifications: {
    methods: NotifyMethod[];
    leadTimes: number[]; // days before due
    overdueDaily: boolean;
    digestEnabled: boolean;
    digestHour: number; // 0-23
    recipient: string;
  };
  smtp: {
    host: string;
    port: number;
    security: 'starttls' | 'tls' | 'none';
    username: string;
    from: string;
    allowSelfSigned: boolean;
    hasPassword: boolean; // password itself is stored encrypted (Windows DPAPI)
  };
  app: {
    theme: 'dark' | 'light' | 'system';
    minimizeToTray: boolean;
    startOnLogin: boolean;
    startMinimized: boolean;
    lockEnabled: boolean;
    lockMinutes: number;
    hasPin: boolean;
    outputFolder: string; // default save folder for generated docs ('' = Documents)
    askWhereToSave: boolean;
    archiveOnReturn: boolean;
    dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  };
  signature: {
    hasSignature: boolean; // image itself is stored encrypted (Windows DPAPI)
    widthInches: number;
    useByDefault: boolean;
    updatedAt: string | null;
  };
  phrases: SavedPhrase[];
  /** Built-in phrase IDs already offered to this user (so new built-ins appear after an upgrade). */
  phraseDefaultsSeen?: string[];
  dueRules: DueRule[];
  holidays: ISODate[];
  backup: {
    autoDaily: boolean;
    keep: number;
    folder: string; // '' = data folder/backups
    lastBackupAt: string | null;
  };
}

export interface DashboardStats {
  overdue: number;
  dueToday: number;
  dueSoon: number; // within 3 days
  dueThisWeek: number;
  pending: number;
  executed: number;
  filedThisMonth: number;
  notificationsOutstanding: number;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  portable: boolean;
  user: string;
  platform: string;
  encryptionAvailable: boolean;
  v1DataFound: string | null;
}

export interface PdfExtraction {
  caseNumber?: string;
  warrantNumber?: string;
  judge?: string;
  signedDate?: ISODate;
  targets?: string;
  provider?: string;
  locations?: string;
}

export interface Result<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
  canceled?: boolean;
}

export interface GenerateRequest {
  warrantId: number;
  templateId: string;
  /** Values the user confirmed in the wizard (saved back to the warrant). */
  patch: Partial<WarrantInput>;
  extra?: Record<string, string>;
  preview?: boolean;
  /** Return: mark the warrant filed/archived after saving. */
  markFiled?: boolean;
  /** Notification: record the notice as served on the search date. */
  markNoticeServed?: boolean;
  /** Insert the stored signature image at {signature} tags. */
  sign?: boolean;
}

export interface GeneratedDoc {
  filePath?: string;
  attachmentId?: number;
  bytes?: Uint8Array;
  sha256: string;
}

export interface WarrantFilter {
  view: 'active' | 'pending' | 'executed' | 'filed' | 'trash' | 'all';
  search?: string;
}

/** The API exposed to the renderer through the preload bridge. */
export interface Api {
  appInfo(): Promise<AppInfo>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Result>;
  setSmtpPassword(pw: string): Promise<Result>;
  setPin(pin: string | null): Promise<Result>;
  setSignature(png: Uint8Array | null): Promise<Result>;
  getSignature(): Promise<string | null>;
  templateUsesSignature(id: string): Promise<boolean>;
  verifyPin(pin: string): Promise<boolean>;

  listWarrants(f: WarrantFilter): Promise<WarrantListItem[]>;
  getWarrant(id: number): Promise<Warrant | null>;
  createWarrant(w: WarrantInput, attachPath?: string | null): Promise<Result<number>>;
  updateWarrant(id: number, patch: Partial<WarrantInput>, reason?: string): Promise<Result>;
  setStatus(id: number, status: WarrantStatus): Promise<Result>;
  extendDueDate(id: number, newDate: ISODate, reason: string): Promise<Result>;
  snooze(id: number, until: ISODate | null): Promise<Result>;
  trashWarrant(id: number): Promise<Result>;
  restoreWarrant(id: number): Promise<Result>;
  purgeWarrant(id: number): Promise<Result>;
  findDuplicates(warrantNumber: string, caseNumber: string, excludeId?: number): Promise<WarrantListItem[]>;
  stats(): Promise<DashboardStats>;

  listAttachments(warrantId: number): Promise<Attachment[]>;
  addAttachments(warrantId: number, kind: AttachmentKind, paths?: string[]): Promise<Result<number>>;
  readAttachment(id: number): Promise<Uint8Array | null>;
  saveAttachmentAs(id: number): Promise<Result>;
  openAttachment(id: number): Promise<Result>;
  removeAttachment(id: number): Promise<Result>;
  verifyAttachment(id: number): Promise<Result<boolean>>;
  pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  readFileBytes(path: string): Promise<Uint8Array | null>;
  getPathForFile(file: File): string;

  audit(warrantId: number | null, limit?: number): Promise<AuditEntry[]>;

  listAmendments(warrantId: number): Promise<Amendment[]>;
  saveAmendment(a: AmendmentInput, attachPath?: string | null): Promise<Result<number>>;
  deleteAmendment(id: number): Promise<Result>;

  listTemplates(): Promise<TemplateInfo[]>;
  importTemplate(kind: TemplateKind, path?: string): Promise<Result<TemplateInfo>>;
  updateTemplate(t: TemplateInfo): Promise<Result>;
  replaceTemplateFile(id: string): Promise<Result>;
  deleteTemplate(id: string): Promise<Result>;
  duplicateTemplate(id: string): Promise<Result<TemplateInfo>>;
  inspectTemplate(id: string): Promise<TemplateInspection>;
  exportTemplate(id: string): Promise<Result>;
  testTemplate(id: string): Promise<Result>;
  templateFieldCatalog(): Promise<{ tag: string; label: string; example: string; group: string }[]>;
  generateDocument(req: GenerateRequest): Promise<Result<GeneratedDoc>>;

  sendTestEmail(): Promise<Result>;
  sendReminderNow(id: number): Promise<Result>;
  runReminderCheck(): Promise<Result<number>>;
  testDesktopNotification(): Promise<Result>;
  exportIcs(ids: number[] | 'pending'): Promise<Result>;

  exportCsv(f: WarrantFilter): Promise<Result>;
  docketPdf(f: WarrantFilter): Promise<Result>;
  caseSummaryPdf(id: number): Promise<Result>;
  casePacket(id: number): Promise<Result>;
  auditCsv(): Promise<Result>;

  backupNow(): Promise<Result<string>>;
  exportFullBackup(): Promise<Result<string>>;
  restoreFullBackup(): Promise<Result>;
  importV1(path?: string): Promise<Result<{ warrants: number; attachments: number; profile: boolean }>>;
  chooseFolder(): Promise<string | null>;
  openDataFolder(): Promise<void>;
  showInFolder(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  setAgencyLogo(): Promise<Result>;
  getAgencyLogo(): Promise<string | null>;

  setTitleBarTheme(dark: boolean): Promise<void>;
  extractDocxText(bytes: Uint8Array): Promise<string>;

  onNavigate(cb: (route: string) => void): () => void;
  onDataChanged(cb: () => void): () => void;
  onLock(cb: () => void): () => void;
}
