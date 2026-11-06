import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { renderDocx, inspectDocx, fileNameFromPattern, imageSize } from '../src/main/render';
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

describe('property receipt pages', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  // Minimal JPEG header: SOI, APP0, SOF0 (100 high x 80 wide), EOI
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x50, ...Array(12).fill(0), 0xff, 0xd9]);

  it('reads PNG and JPEG sizes and rejects other files', () => {
    expect(imageSize(png)).toEqual({ w: 1, h: 1, ext: 'png' });
    expect(imageSize(jpeg)).toEqual({ w: 80, h: 100, ext: 'jpeg' });
    expect(() => imageSize(Buffer.from('%PDF-1.4 not an image'))).toThrow();
  });

  it('adds each receipt page after the return in its own narrow-margin section', () => {
    const out = renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings), {}, null, [jpeg, png]);
    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();
    expect(docText(out)).toContain('RETURN OF SEARCH WARRANT');
    // the return keeps its own section; the receipt pages follow in a second one
    expect(xml.match(/<w:sectPr[ >]/g)!.length).toBe(2);
    const tail = xml.slice(xml.lastIndexOf('<w:sectPr'));
    expect(tail).toMatch(/<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/);
    expect(xml.indexOf('r:embed="rIdWrtPage1"')).toBeGreaterThan(xml.indexOf('RETURN OF SEARCH WARRANT'));
    expect(xml).toContain('r:embed="rIdWrtPage2"');
    expect(xml.match(/<w:pageBreakBefore\/>/g)!.length).toBe(1);
    const rels = zip.file('word/_rels/document.xml.rels')!.asText();
    expect(rels).toContain('Id="rIdWrtPage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/wrt-page-1.jpeg"');
    expect(rels).toContain('Target="media/wrt-page-2.png"');
    expect(zip.file('word/media/wrt-page-1.jpeg')!.asNodeBuffer().equals(jpeg)).toBe(true);
    const ct = zip.file('[Content_Types].xml')!.asText();
    expect(ct).toMatch(/Extension="jpeg" ContentType="image\/jpeg"/);
    expect(ct).toMatch(/Extension="png"/i);
    // a portrait page is scaled to fit the 7.5 x 10 in area (height-bound), keeping its shape
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"\/>[\s\S]*?rIdWrtPage1/.exec(xml)!;
    expect(Number(ext[1]) / Number(ext[2])).toBeCloseTo(0.8, 3);
    expect(Number(ext[2])).toBeLessThanOrEqual(10 * 914400);
  });

  it('leaves the document unchanged without a receipt', () => {
    const xml = new PizZip(renderDocx(tpl('return-generic.docx'), buildTemplateData(sampleWarrant(), settings))).file('word/document.xml')!.asText();
    expect(xml).not.toContain('rIdWrtPage');
    expect(xml.match(/<w:sectPr[ >]/g)!.length).toBe(1);
  });
});
