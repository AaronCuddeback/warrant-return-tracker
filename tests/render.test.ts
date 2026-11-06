import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { renderDocx, inspectDocx, fileNameFromPattern } from '../src/main/render';
import { buildTemplateData, sampleWarrant } from '../src/shared/fields';
import { defaultSettingsForTest } from './helpers';

const tpl = (f: string) => readFileSync(join(__dirname, '..', 'resources', 'templates', f));
const original = (f: string) => readFileSync(join(__dirname, '..', 'original-templates', f));

function docText(buf: Buffer): string {
  const xml = new PizZip(buf).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const settings = defaultSettingsForTest();

describe('return template', () => {
  it('fills the received and search dates from the warrant (v1 bug: always December 2023)', () => {
    const w = { ...sampleWarrant(), signedDate: '2026-03-02', receivedDate: '2026-03-03', executedDate: '2026-03-09' };
    const out = docText(renderDocx(tpl('return-generic.docx'), buildTemplateData(w, settings)));
    expect(out).toContain('I RECEIVED SAID WARRANT ON THE 3RD DAY OF MARCH, 2026');
    expect(out).toContain('ON MARCH 9, 2026, SEARCHED THE PREMISES');
    expect(out).not.toMatch(/DECEMBER/);
  });

  it('uses the officer profile instead of a hard-coded name and badge', () => {
    const out = docText(renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings)));
    expect(out).toContain('I, DETECTIVE PAT EXAMPLE, THE UNDERSIGNED');
    expect(out).toContain('#B123');
    expect(out).toContain('COUNTY OF EL DORADO');
    expect(out).toContain('El Dorado County, State of California.');
    expect(out).toContain('SEARCH WARRANT# SW-2023-0457');
    expect(out).not.toContain('CUDDEBACK');
  });

  it('renders the structured inventory with quantities in words', () => {
    const out = docText(renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings)));
    expect(out).toContain('1. One (1) Apple iPhone 14');
    expect(out).toContain('2. Two (2) digital scales - located in kitchen');
    expect(out).toContain('3. $2,400 in U.S. currency - located in hall closet');
  });

  it('generic template contains no signature image', () => {
    const zip = new PizZip(tpl('return-generic.docx'));
    expect(zip.file('word/document.xml')!.asText()).not.toContain('<w:drawing>');
  });
});

describe.skipIf(!existsSync(join(__dirname, '..', 'original-templates')))('legacy numbered templates (needs local original-templates/)', () => {
  it('v1 templates with {1} {2} {3} still render through a mapping', () => {
    const insp = inspectDocx(original('RETURN OF SEARCH WARRANT TEMPLATE.docx'));
    expect(insp.ok).toBe(true);
    expect(insp.tags.map((t) => t.tag).sort()).toEqual(['1', '2', '3']);
    const out = docText(
      renderDocx(original('RETURN OF SEARCH WARRANT TEMPLATE.docx'), buildTemplateData(sampleWarrant(), settings), {
        '1': 'warrantNumber', '2': 'locations', '3': 'itemsText',
      }),
    );
    expect(out).toContain('SW-2023-0457');
    expect(out).toContain('123 Main Street');
  });
});

describe('notification template', () => {
  it('fills agency, judge (without Hon. prefix), dates and contact', () => {
    const out = docText(renderDocx(tpl('notification-generic.docx'), buildTemplateData(sampleWarrant(), settings)));
    expect(out).toContain("peace officers of the El Dorado County Sheriff's Office");
    expect(out).toContain('issued on December 5, 2023 by the Honorable Jane Smith, Judge of the El Dorado County Superior Court');
    expect(out).toContain('The search was conducted on December 13, 2023');
    expect(out).toContain('Detective Pat Example');
    expect(out).toContain('(530) 555-0100');
  });
});

describe('inspection + filters', () => {
  it('reports known and unknown tags', () => {
    const insp = inspectDocx(tpl('return-generic.docx'));
    expect(insp.ok).toBe(true);
    const unknown = insp.tags.filter((t) => t.status === 'unknown');
    expect(unknown).toEqual([]);
    expect(insp.tags.map((t) => t.tag)).toContain('receivedDateLegal');
  });

  it('builds safe file names', () => {
    expect(fileNameFromPattern('{caseNumber} - Return {warrantNumber}', { caseNumber: '23/12345', warrantNumber: 'SW:1' }, 'x')).toBe('23_12345 - Return SW_1.docx');
  });
});

describe('signature image', () => {
  // 4x2 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR4nGNgYGD4z0AEYAQAHP0BAc8nU8oAAAAASUVORK5CYII=',
    'base64',
  );

  it('embeds the stored signature as a picture where {signature} is', () => {
    const out = renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings), {}, { png, widthInches: 2 });
    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain('r:embed="rIdWrtSignature"');
    expect(xml).toContain(`cx="${2 * 914400}" cy="${914400}"`); // 2in wide, aspect 2:1
    expect(xml).not.toContain('__WRT_SIGNATURE__');
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain('media/wrt-signature.png');
    expect(zip.file('[Content_Types].xml')!.asText()).toMatch(/Extension="png"/i);
    expect(zip.file('word/media/wrt-signature.png')!.asNodeBuffer().equals(png)).toBe(true);
    expect(docText(out)).toContain('#B123'); // badge stays on the line after the signature
  });

  it('leaves the line blank (for a wet signature) when no signature is used', () => {
    const out = renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings), {}, null);
    const xml = new PizZip(out).file('word/document.xml')!.asText();
    expect(xml).not.toContain('<w:drawing>');
    expect(xml).not.toContain('__WRT_SIGNATURE__');
    expect(docText(out)).toContain('#B123');
  });
});
