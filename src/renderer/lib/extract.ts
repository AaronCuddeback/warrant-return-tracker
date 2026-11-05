// Best-effort detection of warrant details from the document text. Suggestions only - the
// officer confirms every value before it is saved.
import { parseLooseDate } from '../../shared/dates';
import type { PdfExtraction } from '../../shared/types';
import { api } from './api';
import { pdfText } from './pdf';

const PROVIDERS: [RegExp, string][] = [
  [/\bgoogle\s*(llc|inc)?\b/i, 'Google LLC'],
  [/\bapple\s*(inc)?\b/i, 'Apple Inc.'],
  [/\bmeta\s*platforms|facebook|instagram\b/i, 'Meta Platforms, Inc.'],
  [/\bsnap\s*(inc)?\b|snapchat/i, 'Snap Inc.'],
  [/\bmicrosoft\b/i, 'Microsoft Corporation'],
  [/\bverizon\b/i, 'Verizon'],
  [/\bat&t\b|\bat\s*&\s*t\b/i, 'AT&T'],
  [/\bt-?mobile\b/i, 'T-Mobile'],
  [/\bdropbox\b/i, 'Dropbox, Inc.'],
  [/\byahoo\b/i, 'Yahoo Inc.'],
  [/\btiktok\b/i, 'TikTok Inc.'],
  [/\bdiscord\b/i, 'Discord Inc.'],
  [/\bx\s*corp\b|twitter/i, 'X Corp.'],
  [/\bkik\b/i, 'Kik Interactive'],
  [/\bsynchronoss\b/i, 'Synchronoss Technologies'],
  [/\buber\b/i, 'Uber Technologies'],
  [/\bamazon\b/i, 'Amazon.com, Inc.'],
];

function first(text: string, res: RegExp[]): string | undefined {
  for (const re of res) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim().replace(/[.,;:]+$/, '');
  }
  return undefined;
}

export function extractFromText(text: string): PdfExtraction {
  const t = text.replace(/\r/g, '');
  const out: PdfExtraction = {};

  out.warrantNumber = first(t, [
    /search\s+warrant\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,24})/i,
    /\bwarrant\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,24})/i,
    /\b(SW[-\s#]?\d[\w\-/]{2,20})/i,
  ]);
  out.caseNumber = first(t, [
    /(?:case|report|incident|dr|agency\s+case)\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,24})/i,
  ]);
  if (out.caseNumber && out.caseNumber === out.warrantNumber) delete out.caseNumber;

  const judge = first(t, [
    /(?:hon\.|honorable)\s+([A-Z][A-Za-z.'\- ]{3,40}?)(?=,|\n|\s{2}|\s+judge|\s+magistrate|$)/,
    /\n\s*([A-Z][A-Za-z.'\- ]{3,40})\s*\n\s*(?:judge|magistrate)\s+of\s+the\s+superior\s+court/i,
  ]);
  if (judge) out.judge = /^hon/i.test(judge) ? judge : `Hon. ${judge}`;

  // Signed date: prefer lines near "issued", "signed", "day of", "date and time"
  const lines = t.split('\n');
  for (const kw of [/date\s+(?:and\s+time\s+)?(?:issued|signed)/i, /\bissued\b/i, /\bday\s+of\b/i, /\bsigned\b/i, /\bdated?\b/i]) {
    for (let i = 0; i < lines.length && !out.signedDate; i++) {
      if (kw.test(lines[i])) out.signedDate = parseLooseDate(lines[i] + ' ' + (lines[i + 1] ?? '')) ?? undefined;
    }
    if (out.signedDate) break;
  }

  out.targets = first(t, [/(?:suspect|target|subject)(?:\(s\))?\s*(?:name)?\s*:\s*([A-Z][^\n]{2,60})/i, /person\s+of\s+([A-Z][A-Za-z.'\- ]{3,40}?)(?:,|\n|\s+\(|\s+DOB)/]);

  for (const [re, name] of PROVIDERS) {
    if (re.test(t)) {
      out.provider = name;
      break;
    }
  }

  // Records warrants: the scope is the target account(s), not the provider's corporate address
  if (out.provider) {
    const emails = [...new Set([...t.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].replace(/[.,;]+$/, '')))];
    const phones = [...new Set([...t.matchAll(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)].map((m) => m[0]))];
    const accts = [...emails, ...phones].slice(0, 6);
    if (accts.length) {
      out.locations = `${out.provider} records associated with ${accts.join(', ')}`;
      return out;
    }
  }

  const addr = /\b(\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Z][\w.'\- ]{1,40}?\s(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Boulevard|Blvd|Place|Pl|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Trail|Trl)\b\.?(?:[^\n]{0,60}))/.exec(t);
  if (addr) out.locations = addr[1].trim();

  return out;
}

export async function extractFromFile(bytes: Uint8Array, name: string): Promise<{ text: string; found: PdfExtraction }> {
  let text = '';
  try {
    if (/\.pdf$/i.test(name)) text = await pdfText(bytes);
    else if (/\.docx$/i.test(name)) text = await api.extractDocxText(bytes);
  } catch {
    text = '';
  }
  return { text, found: text.trim() ? extractFromText(text) : {} };
}
