// Template field catalog + the data object given to docxtemplater.
// Any agency template can use these {tags}. Documented in-app under Templates > Field reference.

import type { Settings, Warrant, ReturnItem } from './types';
import { WARRANT_TYPES } from './types';
import { formatDate, numberToWords, todayISO } from './dates';

export interface FieldDef {
  tag: string;
  label: string;
  group: string;
  example: string;
}

const DATE_FIELDS: { key: string; label: string; example: string }[] = [
  { key: 'signed', label: 'Signed / issued', example: '2023-12-05' },
  { key: 'received', label: 'Received by officer', example: '2023-12-05' },
  { key: 'search', label: 'Search conducted / executed', example: '2023-12-13' },
  { key: 'due', label: 'Return due', example: '2023-12-15' },
  { key: 'filed', label: 'Return filed', example: '2023-12-14' },
  { key: 'notification', label: 'Notification served', example: '2023-12-13' },
  { key: 'today', label: 'Today (document date)', example: '2023-12-14' },
];

const DATE_VARIANTS: { suffix: string; label: string; fmt: string }[] = [
  { suffix: 'Date', label: 'long', fmt: 'MMMM D, YYYY' },
  { suffix: 'DateShort', label: 'numeric', fmt: 'MM/DD/YYYY' },
  { suffix: 'DateLegal', label: 'legal', fmt: 'Do [day of] MMMM, YYYY' },
  { suffix: 'Day', label: 'day number', fmt: 'D' },
  { suffix: 'DayOrdinal', label: 'day ordinal', fmt: 'Do' },
  { suffix: 'Month', label: 'month name', fmt: 'MMMM' },
  { suffix: 'Year', label: 'year', fmt: 'YYYY' },
  { suffix: 'Weekday', label: 'weekday', fmt: 'dddd' },
  { suffix: 'DateISO', label: 'ISO (for the date filter)', fmt: 'YYYY-MM-DD' },
];

export const FIELD_CATALOG: FieldDef[] = [
  { tag: 'warrantNumber', label: 'Search warrant number', group: 'Warrant', example: 'SW-2023-0457' },
  { tag: 'caseNumber', label: 'Case / report number', group: 'Warrant', example: '23-12345' },
  { tag: 'warrantType', label: 'Warrant type', group: 'Warrant', example: 'Premises / Residence' },
  { tag: 'targets', label: 'Suspect(s) / target(s)', group: 'Warrant', example: 'John Doe' },
  { tag: 'suspectName', label: 'Alias of targets', group: 'Warrant', example: 'John Doe' },
  { tag: 'judge', label: 'Issuing judge (as entered)', group: 'Warrant', example: 'Hon. Jane Smith' },
  { tag: 'judgeName', label: 'Judge name without "Hon."/"Judge" prefix', group: 'Warrant', example: 'Jane Smith' },
  { tag: 'court', label: 'Issuing court', group: 'Warrant', example: 'Superior Court, County of El Dorado' },
  { tag: 'provider', label: 'Service provider (records warrants)', group: 'Warrant', example: 'Google LLC' },
  { tag: 'locations', label: 'Premises / devices / accounts searched', group: 'Return', example: '123 Main St, Placerville, CA' },
  { tag: 'searchedLocation', label: 'Alias of locations', group: 'Return', example: '123 Main St, Placerville, CA' },
  { tag: 'itemsText', label: 'Inventory of property taken (formatted list)', group: 'Return', example: '1. One (1) iPhone 14 - bedroom' },
  { tag: 'itemCount', label: 'Number of inventory items', group: 'Return', example: '3' },
  { tag: '#items', label: 'Loop start: repeat for each item ({/items} ends)', group: 'Return', example: '' },
  { tag: 'qty', label: '(inside items loop) quantity', group: 'Return', example: '2' },
  { tag: 'qtyWords', label: '(inside items loop) quantity in words', group: 'Return', example: 'Two' },
  { tag: 'description', label: '(inside items loop) description', group: 'Return', example: 'Digital scales' },
  { tag: 'locationFound', label: '(inside items loop) where found', group: 'Return', example: 'Kitchen' },
  { tag: 'index', label: '(inside items loop) item number', group: 'Return', example: '1' },
  { tag: 'noItemsText', label: '"No property was taken" when inventory is empty', group: 'Return', example: '' },
  { tag: 'investigationNature', label: 'Nature of the investigation', group: 'Notification', example: 'possession of controlled substances for sale' },
  { tag: 'notes', label: 'Notes', group: 'Warrant', example: '' },
  { tag: 'assignedTo', label: 'Assigned investigator', group: 'Warrant', example: 'Det. A. Smith' },
  { tag: 'officerName', label: 'Your full name', group: 'Officer & agency', example: 'Aaron Cuddeback' },
  { tag: 'officerTitle', label: 'Your title / rank', group: 'Officer & agency', example: 'Detective' },
  { tag: 'officerTitleName', label: 'Title + name', group: 'Officer & agency', example: 'Detective Aaron Cuddeback' },
  { tag: 'badgeNumber', label: 'Badge / ID number', group: 'Officer & agency', example: 'K1158' },
  { tag: 'officerPhone', label: 'Phone', group: 'Officer & agency', example: '(530) 555-0100' },
  { tag: 'officerEmail', label: 'Email', group: 'Officer & agency', example: 'name@agency.gov' },
  { tag: 'unit', label: 'Unit / division', group: 'Officer & agency', example: 'High Tech Unit' },
  { tag: 'agencyName', label: 'Agency name', group: 'Officer & agency', example: "El Dorado County Sheriff's Office" },
  { tag: 'agencyShortName', label: 'Agency short name', group: 'Officer & agency', example: 'EDSO' },
  { tag: 'county', label: 'County', group: 'Officer & agency', example: 'El Dorado' },
  { tag: 'state', label: 'State', group: 'Officer & agency', example: 'California' },
  { tag: 'courtName', label: 'Court name (from settings)', group: 'Officer & agency', example: 'Superior Court of California, County of El Dorado' },
  ...DATE_FIELDS.flatMap((f) =>
    DATE_VARIANTS.map((v) => ({
      tag: `${f.key}${v.suffix}`,
      label: `${f.label} - ${v.label}`,
      group: 'Dates',
      example: formatDate(f.example, v.fmt),
    })),
  ),
];

export const KNOWN_TAGS = new Set(FIELD_CATALOG.map((f) => f.tag.replace(/^#/, '')));

/** Default mapping used when an imported template still uses the v1 numbered tags {1} {2}... */
export const LEGACY_MAPPINGS: Record<string, Record<string, string>> = {
  return: { '1': 'warrantNumber', '2': 'locations', '3': 'itemsText' },
  notification: {
    '1': 'signedDate', '2': 'judge', '3': 'searchDate', '4': 'investigationNature',
    '5': 'officerTitleName', '6': 'officerPhone',
  },
  other: {},
};

export function formatItem(it: ReturnItem, i: number): string {
  const n = Number.parseInt(it.qty, 10);
  const qty = it.qty?.trim()
    ? Number.isFinite(n) && String(n) === it.qty.trim()
      ? `${capitalize(numberToWords(n))} (${n})`
      : it.qty.trim()
    : '';
  const loc = it.locationFound?.trim() ? ` - located in ${it.locationFound.trim()}` : '';
  return `${i + 1}. ${[qty, it.description.trim()].filter(Boolean).join(' ')}${loc}`;
}

export function stripJudgePrefix(j: string): string {
  return (j ?? '').replace(/^\s*(the\s+)?(hon(\.|orable)?|judge|commissioner)\s+/i, '').trim();
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function buildTemplateData(
  w: Warrant,
  s: Settings,
  extra: Record<string, string> = {},
  now: Date = new Date(),
): Record<string, unknown> {
  const p = s.profile;
  const items = (w.items ?? []).filter((i) => i.description?.trim());
  const itemsText = items.length
    ? items.map(formatItem).join('\n')
    : (w.itemsText ?? '').trim();
  const typeLabel = WARRANT_TYPES.find((t) => t.value === w.warrantType)?.label ?? '';

  const dates: Record<string, string | null> = {
    signed: w.signedDate,
    received: w.receivedDate || w.signedDate,
    search: w.executedDate,
    due: w.returnDueDate,
    filed: w.filedDate,
    notification: w.notificationServedDate,
    today: todayISO(now),
  };

  const data: Record<string, unknown> = {
    warrantNumber: w.warrantNumber,
    caseNumber: w.caseNumber,
    warrantType: typeLabel,
    targets: w.targets,
    suspectName: w.targets,
    judge: w.judge,
    judgeName: stripJudgePrefix(w.judge),
    court: w.court || p.courtName,
    provider: w.provider,
    locations: w.locations,
    searchedLocation: w.locations,
    itemsText: itemsText || 'No property was taken.',
    noItemsText: itemsText ? '' : 'No property was taken.',
    itemCount: String(items.length),
    items: items.map((it, i) => {
      const n = Number.parseInt(it.qty, 10);
      return {
        index: String(i + 1),
        qty: it.qty,
        qtyWords: Number.isFinite(n) ? capitalize(numberToWords(n)) : it.qty,
        description: it.description,
        locationFound: it.locationFound,
      };
    }),
    investigationNature: w.investigationNature,
    notes: w.notes,
    assignedTo: w.assignedTo,
    officerName: p.fullName,
    officerTitle: p.title,
    officerTitleName: [p.title, p.fullName].filter(Boolean).join(' '),
    badgeNumber: p.badgeNumber,
    officerPhone: p.phone,
    officerEmail: p.email,
    unit: p.unit,
    agencyName: p.agencyName,
    agencyShortName: p.agencyShortName,
    county: p.county,
    state: p.state,
    courtName: p.courtName,
  };

  for (const f of DATE_FIELDS) {
    const iso = dates[f.key];
    for (const v of DATE_VARIANTS) data[`${f.key}${v.suffix}`] = iso ? formatDate(iso, v.fmt) : '';
  }
  // Friendly aliases
  data.executedDate = data.searchDate;
  data.returnDueDate = data.dueDate;
  data.signedDateLong = data.signedDate;

  for (const [k, v] of Object.entries(extra)) data[k] = v;
  return data;
}

/** Sample warrant used for "Test template" and previews. */
export function sampleWarrant(): Warrant {
  return {
    id: 0,
    caseNumber: '23-12345',
    warrantNumber: 'SW-2023-0457',
    warrantType: 'premises',
    targets: 'John Q. Sample',
    judge: 'Hon. Jane Smith',
    court: '',
    signedDate: '2023-12-05',
    receivedDate: '2023-12-05',
    executedDate: '2023-12-13',
    returnDueDate: '2023-12-15',
    dueRule: '10 calendar days',
    locations: '123 Main Street, Placerville, California, including all rooms, garages and outbuildings.',
    provider: '',
    items: [
      { qty: '1', description: 'Apple iPhone 14, black (IMEI 350000000000000)', locationFound: 'master bedroom nightstand' },
      { qty: '2', description: 'digital scales', locationFound: 'kitchen' },
      { qty: '', description: '$2,400 in U.S. currency', locationFound: 'hall closet' },
    ],
    itemsText: '',
    investigationNature: 'possession of controlled substances for sale (H&S 11351)',
    notes: '',
    assignedTo: '',
    tags: '',
    status: 'executed',
    notificationRequired: true,
    notificationServedDate: '2023-12-13',
    filedDate: null,
    snoozeUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}
