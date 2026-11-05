// Converts the original El Dorado County SO Word templates into tagged templates.
//
// v1 problem: the return template had the dates typed in as plain text
// ("5TH DAY OF DECEMBER 2023", "DECEMBER 13TH, 2023") plus a hard-coded officer name and
// badge, so they never changed. Here every one of those becomes a merge field.
//
// Outputs:
//   resources/templates/return-generic.docx        (ships with the app, no signature image)
//   resources/templates/notification-generic.docx  (ships with the app)
//   office-templates/EDSO Return of Search Warrant (signed).docx  (personal copy - keeps signature)
//
// Usage: node scripts/make-templates.mjs <folder containing the two original .docx files>

import PizZip from 'pizzip';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2] || join(root, 'original-templates');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function paragraphs(xml) {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => ({ start: m.index, xml: m[0] }));
}
function paraText(p) {
  return unesc([...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));
}

/** Remove legacy FORMTEXT field codes but keep the displayed result text. */
function flattenFields(p) {
  // drop runs that hold fldChar begin/separate/end or instrText
  return p
    .replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:fldChar [^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:fldChar [^>]*>[\s\S]*?<\/w:fldChar>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:instrText[\s\S]*?<\/w:instrText>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:bookmark(?:Start|End) [^>]*\/>/g, '');
}

/** Replace text inside a paragraph even when Word split it across several runs. */
function replaceInParagraph(p, find, repl) {
  const ts = [...p.matchAll(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g)].map((m) => ({
    index: m.index, full: m[0], open: m[1], text: unesc(m[2]), close: m[3],
  }));
  const joined = ts.map((t) => t.text).join('');
  const at = joined.indexOf(find);
  if (at < 0) throw new Error(`Text not found: "${find}" in "${joined}"`);
  const end = at + find.length;
  let pos = 0;
  const newTexts = ts.map((t) => {
    const s = pos;
    const e = pos + t.text.length;
    pos = e;
    if (e <= at || s >= end) return t.text; // untouched
    let out = '';
    if (s < at) out += t.text.slice(0, at - s);
    if (s <= at && at < e) out += repl; // replacement goes in the run where match begins
    if (e > end) out += t.text.slice(end - s);
    return out;
  });
  let result = '';
  let last = 0;
  ts.forEach((t, i) => {
    result += p.slice(last, t.index);
    result += `<w:t xml:space="preserve">${esc(newTexts[i])}</w:t>`;
    last = t.index + t.full.length;
  });
  return result + p.slice(last);
}

function rewriteDoc(file, edits) {
  const zip = new PizZip(readFileSync(file));
  let xml = zip.file('word/document.xml').asText();
  const ps = paragraphs(xml);
  let out = '';
  let last = 0;
  for (const p of ps) {
    let x = p.xml;
    for (const e of edits) {
      if (e.match(paraText(x))) x = e.apply(x);
    }
    out += xml.slice(last, p.start) + x;
    last = p.start + p.xml.length;
  }
  xml = out + xml.slice(last);
  zip.file('word/document.xml', xml);
  // scrub document properties (author etc.)
  for (const f of ['docProps/core.xml', 'docProps/app.xml']) {
    const c = zip.file(f)?.asText();
    if (c) zip.file(f, c.replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>').replace(/<Company>[^<]*<\/Company>/, '<Company></Company>'));
  }
  return zip;
}

const has = (s) => (t) => t.includes(s);

// ---------- RETURN OF SEARCH WARRANT ----------
const RECEIVED_PARA_OLD_START = 'I, DETECTIVE AARON CUDDEBACK, THE UNDERSIGNED';
const returnEdits = (keepSignature) => [
  { match: has('STATE OF CALIFORNIA)'), apply: (p) => replaceInParagraph(p, 'STATE OF CALIFORNIA', 'STATE OF {state | upper}') },
  { match: has('SEARCH WARRANT# {1}'), apply: (p) => replaceInParagraph(p, '{1}', '{warrantNumber}') },
  { match: has('COUNTY OF EL DORADO)'), apply: (p) => replaceInParagraph(flattenFields(p), 'COUNTY OF EL DORADO', 'COUNTY OF {county | upper}') },
  {
    match: has(RECEIVED_PARA_OLD_START),
    apply: (p) => {
      const t = paraText(p);
      return replaceInParagraph(p, t, 'I, {officerTitleName | upper}, THE UNDERSIGNED, MAKE THIS RETURN TO THE WITHIN SEARCH WARRANT. I RECEIVED SAID WARRANT ON THE {receivedDateLegal | upper} AND UNDER ITS AUTHORITY, I, ON {searchDate | upper}, SEARCHED THE PREMISES DESCRIBED AS FOLLOWS, TO WIT:');
    },
  },
  { match: (t) => t.trim() === '{2}', apply: (p) => replaceInParagraph(p, '{2}', '{locations}') },
  { match: (t) => t.trim() === '{3}', apply: (p) => replaceInParagraph(p, '{3}', '{itemsText}') },
  {
    match: has('THE OFFICER BY WHOM THIS WARRANT WAS EXECUTED'),
    apply: (p) => replaceInParagraph(p, 'I, DETECTIVE AARON CUDDEBACK,', 'I, {officerTitleName | upper},'),
  },
  {
    match: has('#K1158'),
    apply: (p) => {
      let x = replaceInParagraph(p, '#K1158', '#{badgeNumber}');
      if (!keepSignature) x = x.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:drawing>[\s\S]*?<\/w:drawing>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '');
      return x;
    },
  },
  {
    match: has('El Dorado County, State of California.'),
    apply: (p) => {
      let x = flattenFields(p);
      x = replaceInParagraph(x, 'El Dorado County, State of California.', '{county} County, State of {state}.');
      x = replaceInParagraph(x, 'El Dorado County, State of California.', '{county} County, State of {state}.');
      return x;
    },
  },
  { match: has('Judge of the'), apply: (p) => flattenFields(p) },
];

// ---------- CONTEMPORANEOUS NOTIFICATION ----------
const notificationEdits = [
  {
    match: has('These premises have been searched'),
    apply: (p) => {
      let x = replaceInParagraph(p, 'El Dorado County Sheriff’s Office', '{agencyName}');
      x = replaceInParagraph(x, '{1}', '{signedDate}');
      x = replaceInParagraph(x, '{2}', '{judgeName}');
      x = replaceInParagraph(x, 'El Dorado County Superior Court', '{county} County Superior Court');
      return x;
    },
  },
  { match: has('The search was conducted on {3}'), apply: (p) => replaceInParagraph(p, '{3}', '{searchDate}') },
  { match: has('pertaining to {4}'), apply: (p) => replaceInParagraph(p, '{4}', '{investigationNature}') },
  {
    match: has('{5} at {6}'),
    apply: (p) => replaceInParagraph(replaceInParagraph(p, '{5}', '{officerTitleName}, {agencyName}'), '{6}', '{officerPhone}'),
  },
];

const tplOut = join(root, 'resources', 'templates');
const officeOut = join(root, 'office-templates');
mkdirSync(tplOut, { recursive: true });
mkdirSync(officeOut, { recursive: true });

const retSrc = join(srcDir, 'RETURN OF SEARCH WARRANT TEMPLATE.docx');
const notSrc = join(srcDir, '1 CONTEMPORANEOUS NOTIFICATION TEMPLATE.docx');

const gen = (zip) => zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(join(tplOut, 'return-generic.docx'), gen(rewriteDoc(retSrc, returnEdits(false))));
writeFileSync(join(officeOut, 'EDSO Return of Search Warrant (signed).docx'), gen(rewriteDoc(retSrc, returnEdits(true))));
writeFileSync(join(tplOut, 'notification-generic.docx'), gen(rewriteDoc(notSrc, notificationEdits)));

// Report final text so the conversion can be eyeballed
for (const f of [join(tplOut, 'return-generic.docx'), join(tplOut, 'notification-generic.docx')]) {
  const xml = new PizZip(readFileSync(f)).file('word/document.xml').asText();
  console.log(`\n=== ${f}`);
  for (const p of paragraphs(xml)) {
    const t = paraText(p.xml);
    if (t.trim()) console.log('  ' + t);
  }
}
