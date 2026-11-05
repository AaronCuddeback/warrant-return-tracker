// Pure DOCX rendering (no Electron imports, so it is unit-testable).
//
// Templates use docxtemplater {tags} with an expression parser so agencies can apply filters:
//   {searchDate | upper}                         -> DECEMBER 13, 2023
//   {signedDateISO | date:"Do [day of] MMMM YYYY"} -> 5th day of December 2023
//   {#items}{qty} {description}{/items}           -> repeat per inventory item
// Old v1-style numbered tags ({1}, {2}...) still work through a per-template mapping.

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import expressionParser from 'docxtemplater/expressions.js';
import InspectModule from 'docxtemplater/js/inspect-module.js';
import { formatDate, isISODate, parseLooseDate, toISO } from '../shared/dates';
import { KNOWN_TAGS } from '../shared/fields';
import type { TemplateInspection } from '../shared/types';

const filters = {
  upper: (v: unknown) => (v == null ? '' : String(v).toUpperCase()),
  lower: (v: unknown) => (v == null ? '' : String(v).toLowerCase()),
  title: (v: unknown) => (v == null ? '' : String(v).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())),
  date: (v: unknown, fmt = 'MMMM D, YYYY') => {
    if (v == null || v === '') return '';
    const s = String(v);
    const iso = isISODate(s) ? s : parseLooseDate(s);
    return iso ? formatDate(iso, fmt) : s;
  },
  default: (v: unknown, fallback = '') => (v == null || v === '' ? fallback : v),
  join: (v: unknown, sep = ', ') => (Array.isArray(v) ? v.join(sep) : v),
};

const baseParser = expressionParser.configure({ filters });

const NUM_PREFIX = '__n';

function parser(tag: string) {
  const t = tag.trim();
  if (/^\d+$/.test(t)) {
    return { get: (scope: Record<string, unknown>) => scope?.[`${NUM_PREFIX}${t}`] ?? '' };
  }
  return baseParser(tag);
}

function friendlyError(e: unknown): string {
  const err = e as { properties?: { errors?: { properties?: { explanation?: string; xtag?: string } }[]; explanation?: string } ; message?: string };
  const list = err?.properties?.errors;
  if (Array.isArray(list) && list.length) {
    return list
      .slice(0, 6)
      .map((x) => x.properties?.explanation || 'Template error')
      .join('\n');
  }
  return err?.properties?.explanation || err?.message || String(e);
}

/** Apply a template's tag mapping (numbered or custom names -> catalog fields). */
export function applyMapping(data: Record<string, unknown>, mapping: Record<string, string>) {
  const out = { ...data };
  for (const [tag, field] of Object.entries(mapping || {})) {
    if (!field) continue;
    const v = data[field] ?? '';
    if (/^\d+$/.test(tag)) out[`${NUM_PREFIX}${tag}`] = v;
    else out[tag] = v;
  }
  return out;
}

export function renderDocx(template: Buffer | Uint8Array, data: Record<string, unknown>, mapping: Record<string, string> = {}): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(template);
  } catch {
    throw new Error('The template is not a valid .docx file (older .doc files must be re-saved as .docx in Word).');
  }
  try {
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser,
      nullGetter: () => '',
    });
    doc.render(applyMapping(data, mapping));
    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/** Root identifier of a tag expression: "searchDate | upper" -> "searchDate". */
export function tagRoot(tag: string): string {
  const t = tag.trim().replace(/^[#/^]/, '');
  const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(t);
  return m ? m[0] : t;
}

export function inspectDocx(template: Buffer | Uint8Array, mapping: Record<string, string> = {}): TemplateInspection {
  let zip: PizZip;
  try {
    zip = new PizZip(template);
  } catch {
    return { ok: false, error: 'Not a valid .docx file. If this is an older .doc file, open it in Word and "Save As" .docx.', tags: [] };
  }
  try {
    const iModule = (InspectModule as unknown as () => { getAllStructuredTags(): unknown[] })();
    // eslint-disable-next-line no-new
    new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, parser, modules: [iModule as never] });
    const seen = new Map<string, TemplateInspection['tags'][number]>();
    const walk = (parts: unknown[], inLoop: boolean) => {
      for (const p of parts as { value?: string; module?: string; subparsed?: unknown[] }[]) {
        if (!p?.value) continue;
        const root = tagRoot(p.value);
        if (p.subparsed) {
          if (!seen.has(root)) seen.set(root, { tag: root, status: KNOWN_TAGS.has(root) ? 'loop' : 'unknown' });
          walk(p.subparsed, true);
          continue;
        }
        if (seen.has(root)) continue;
        if (mapping[root]) seen.set(root, { tag: root, status: 'mapped', field: mapping[root] });
        else if (/^\d+$/.test(root)) seen.set(root, { tag: root, status: 'numeric' });
        else if (KNOWN_TAGS.has(root) || inLoop) seen.set(root, { tag: root, status: 'known' });
        else seen.set(root, { tag: root, status: 'unknown' });
      }
    };
    walk(iModule.getAllStructuredTags(), false);
    return { ok: true, tags: [...seen.values()] };
  } catch (e) {
    return { ok: false, error: friendlyError(e), tags: [] };
  }
}

/** Fill a file-name pattern like "{caseNumber} Return {warrantNumber}" and make it Windows-safe. */
export function fileNameFromPattern(pattern: string, data: Record<string, unknown>, fallback: string): string {
  const name = (pattern || fallback).replace(/\{\s*([\w]+)\s*}/g, (_, k) => String(data[k] ?? '')).trim();
  const safe = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .slice(0, 150);
  return (safe || fallback) + '.docx';
}

export const todayStamp = () => toISO(new Date());
