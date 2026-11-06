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

export interface SignatureImage {
  png: Buffer | Uint8Array;
  widthInches: number;
}

export function renderDocx(
  template: Buffer | Uint8Array,
  data: Record<string, unknown>,
  mapping: Record<string, string> = {},
  signature: SignatureImage | null = null,
): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(template);
  } catch {
    throw new Error('The template is not a valid .docx file (older .doc files must be re-saved as .docx in Word).');
  }
  let out: PizZip;
  try {
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser,
      nullGetter: () => '',
    });
    doc.render(applyMapping({ ...data, signature: SIGNATURE_MARKER }, mapping));
    out = doc.getZip();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  placeSignature(out, signature);
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

// ---------------- signature image ----------------
// The {signature} tag renders as a marker; afterwards each marker is swapped for an inline
// picture (or removed when no signature is stored / the officer chose not to sign).

export const SIGNATURE_MARKER = '__WRT_SIGNATURE__';
const SIG_REL_ID = 'rIdWrtSignature';
const SIG_MEDIA = 'media/wrt-signature.png';
const EMU_PER_INCH = 914400;

export function pngSize(png: Buffer | Uint8Array): { w: number; h: number } {
  const b = Buffer.from(png);
  if (b.length < 24 || b.readUInt32BE(12) !== 0x49484452) throw new Error('Signature image is not a valid PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function drawingRun(cx: number, cy: number, id: number) {
  return (
    `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Officer signature"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${SIG_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function relsPathFor(part: string) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

export function placeSignature(zip: PizZip, sig: SignatureImage | null) {
  const parts = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  let used = false;
  let nextId = 9100;
  for (const part of parts) {
    let xml = zip.file(part)!.asText();
    if (!xml.includes(SIGNATURE_MARKER)) continue;
    if (!sig) {
      zip.file(part, xml.split(SIGNATURE_MARKER).join(''));
      continue;
    }
    const { w, h } = pngSize(sig.png);
    const cx = Math.round(Math.max(0.5, Math.min(6, sig.widthInches || 2)) * EMU_PER_INCH);
    const cy = Math.round((cx * h) / w);
    // <w:t ...>before MARKER after</w:t>  ->  close the run, insert picture run, reopen the run
    const re = new RegExp(`<w:t(\\s[^>]*)?>([^<]*?)${SIGNATURE_MARKER}([^<]*)</w:t>`);
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const runStart = Math.max(xml.lastIndexOf('<w:r>', m.index), xml.lastIndexOf('<w:r ', m.index));
      const runHead = xml.slice(runStart, m.index);
      const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(runHead)?.[0] ?? '';
      const replacement =
        `<w:t xml:space="preserve">${m[2]}</w:t></w:r>` + drawingRun(cx, cy, nextId++) + `<w:r>${rPr}<w:t xml:space="preserve">${m[3]}</w:t>`;
      xml = xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
    }
    xml = xml.split(SIGNATURE_MARKER).join(''); // any marker the regex could not place (e.g. inside an attribute)
    zip.file(part, xml);

    const relsPath = relsPathFor(part);
    let rels = zip.file(relsPath)?.asText() ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    if (!rels.includes(`Id="${SIG_REL_ID}"`)) {
      rels = rels.replace('</Relationships>', `<Relationship Id="${SIG_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${SIG_MEDIA}"/></Relationships>`);
      zip.file(relsPath, rels);
    }
    used = true;
  }
  if (used && sig) {
    zip.file(`word/${SIG_MEDIA}`, Buffer.from(sig.png));
    let ct = zip.file('[Content_Types].xml')!.asText();
    if (!/Extension="png"/i.test(ct)) {
      ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
      zip.file('[Content_Types].xml', ct);
    }
  }
}

/** True if the rendered template contains a {signature} tag. */
export function usesSignature(template: Buffer | Uint8Array): boolean {
  try {
    return inspectDocx(template).tags.some((t) => t.tag === 'signature');
  } catch {
    return false;
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
