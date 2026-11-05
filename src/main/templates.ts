// Template library: built-in templates + agency-imported .docx files.

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { all, get, run, tx } from './db';
import { TEMPLATE_DIR, resourcePath } from './paths';
import { audit, sha256 } from './repo';
import { inspectDocx } from './render';
import { LEGACY_MAPPINGS } from '../shared/fields';
import type { TemplateInfo, TemplateKind, TemplateInspection } from '../shared/types';

const BUILT_INS: Omit<TemplateInfo, 'sha256' | 'createdAt' | 'isDefault'>[] = [
  {
    id: 'builtin-return',
    name: 'Return of Search Warrant (California)',
    kind: 'return',
    description: 'Standard California return with inventory. Uses your profile for officer name, badge, county and state.',
    builtIn: true,
    fileName: 'return-generic.docx',
    mapping: {},
    outputPattern: '{caseNumber} - Return of Search Warrant {warrantNumber}',
  },
  {
    id: 'builtin-notification',
    name: 'Contemporaneous Notification - PC 1546.2(a)',
    kind: 'notification',
    description: 'CalECPA notice of search warrant for electronic device information.',
    builtIn: true,
    fileName: 'notification-generic.docx',
    mapping: {},
    outputPattern: '{caseNumber} - Notification {warrantNumber}',
  },
];

function row(r: Record<string, unknown>): TemplateInfo {
  let mapping = {};
  try {
    mapping = JSON.parse(String(r.mapping || '{}'));
  } catch {
    /* ignore */
  }
  return { ...(r as unknown as TemplateInfo), builtIn: !!r.builtIn, isDefault: !!r.isDefault, mapping };
}

export function templateFile(t: TemplateInfo): string {
  return t.builtIn ? resourcePath('templates', t.fileName) : join(TEMPLATE_DIR, t.fileName);
}

export function ensureBuiltIns() {
  tx(() => {
    for (const b of BUILT_INS) {
      const file = resourcePath('templates', b.fileName);
      if (!existsSync(file)) continue;
      const hash = sha256(readFileSync(file));
      const existing = get('SELECT id FROM templates WHERE id = ?', [b.id]);
      if (existing) {
        run('UPDATE templates SET name = ?, description = ?, fileName = ?, sha256 = ? WHERE id = ?', [b.name, b.description, b.fileName, hash, b.id]);
      } else {
        const hasDefault = get('SELECT 1 AS x FROM templates WHERE kind = ? AND isDefault = 1', [b.kind]);
        run(
          'INSERT INTO templates (id, name, kind, description, builtIn, isDefault, fileName, sha256, mapping, outputPattern, createdAt) VALUES (?,?,?,?,1,?,?,?,?,?,?)',
          [b.id, b.name, b.kind, b.description, hasDefault ? 0 : 1, b.fileName, hash, '{}', b.outputPattern, new Date().toISOString()],
        );
      }
    }
  });
}

export function listTemplates(): TemplateInfo[] {
  return all('SELECT * FROM templates ORDER BY kind, builtIn DESC, name').map(row);
}

export function getTemplate(id: string): TemplateInfo | undefined {
  const r = get('SELECT * FROM templates WHERE id = ?', [id]);
  return r ? row(r) : undefined;
}

export function defaultTemplate(kind: TemplateKind): TemplateInfo | undefined {
  const r = get('SELECT * FROM templates WHERE kind = ? ORDER BY isDefault DESC, builtIn ASC LIMIT 1', [kind]);
  return r ? row(r) : undefined;
}

export function readTemplate(t: TemplateInfo): Buffer {
  const f = templateFile(t);
  if (!existsSync(f)) throw new Error(`Template file is missing: ${t.fileName}`);
  return readFileSync(f);
}

/** Suggest mappings for numbered tags based on the v1 conventions. */
function suggestMapping(kind: TemplateKind, insp: TemplateInspection): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of insp.tags) {
    if (t.status === 'numeric' && LEGACY_MAPPINGS[kind]?.[t.tag]) m[t.tag] = LEGACY_MAPPINGS[kind][t.tag];
  }
  return m;
}

export function importTemplate(kind: TemplateKind, srcPath: string): TemplateInfo {
  if (!/\.docx$/i.test(srcPath)) throw new Error('Templates must be Word .docx files. Open older .doc files in Word and "Save As" .docx first.');
  const buf = readFileSync(srcPath);
  const insp = inspectDocx(buf);
  if (!insp.ok) throw new Error(`This template has a problem:\n${insp.error}`);
  const id = randomUUID();
  const fileName = `${id}.docx`;
  writeFileSync(join(TEMPLATE_DIR, fileName), buf);
  const name = basename(srcPath).replace(/\.docx$/i, '');
  const mapping = suggestMapping(kind, insp);
  const info: TemplateInfo = {
    id, name, kind, description: '', builtIn: false, isDefault: false, fileName, sha256: sha256(buf), mapping,
    outputPattern: kind === 'return' ? '{caseNumber} - Return of Search Warrant {warrantNumber}' : kind === 'notification' ? '{caseNumber} - Notification {warrantNumber}' : `{caseNumber} - ${name}`,
    createdAt: new Date().toISOString(),
  };
  tx(() => {
    run(
      'INSERT INTO templates (id, name, kind, description, builtIn, isDefault, fileName, sha256, mapping, outputPattern, createdAt) VALUES (?,?,?,?,0,0,?,?,?,?,?)',
      [id, name, kind, '', fileName, info.sha256, JSON.stringify(mapping), info.outputPattern, info.createdAt],
    );
    audit(null, 'template-import', `Template imported: ${name}`, { kind, sha256: info.sha256 });
  });
  return info;
}

export function updateTemplate(t: TemplateInfo) {
  const cur = getTemplate(t.id);
  if (!cur) throw new Error('Template not found');
  tx(() => {
    if (t.isDefault) run('UPDATE templates SET isDefault = 0 WHERE kind = ?', [t.kind]);
    run('UPDATE templates SET name = ?, kind = ?, description = ?, isDefault = ?, mapping = ?, outputPattern = ? WHERE id = ?', [
      cur.builtIn ? cur.name : t.name.trim() || cur.name, cur.builtIn ? cur.kind : t.kind, t.description, t.isDefault ? 1 : 0,
      JSON.stringify(t.mapping || {}), t.outputPattern, t.id,
    ]);
    audit(null, 'template-edit', `Template updated: ${t.name}`);
  });
}

export function replaceTemplateFile(id: string, srcPath: string) {
  const t = getTemplate(id);
  if (!t || t.builtIn) throw new Error('Built-in templates cannot be replaced. Duplicate it first.');
  const buf = readFileSync(srcPath);
  const insp = inspectDocx(buf);
  if (!insp.ok) throw new Error(`This template has a problem:\n${insp.error}`);
  writeFileSync(join(TEMPLATE_DIR, t.fileName), buf);
  tx(() => {
    run('UPDATE templates SET sha256 = ? WHERE id = ?', [sha256(buf), id]);
    audit(null, 'template-edit', `Template file replaced: ${t.name}`, { sha256: sha256(buf) });
  });
}

export function duplicateTemplate(id: string): TemplateInfo {
  const t = getTemplate(id);
  if (!t) throw new Error('Template not found');
  const nid = randomUUID();
  const fileName = `${nid}.docx`;
  copyFileSync(templateFile(t), join(TEMPLATE_DIR, fileName));
  const info: TemplateInfo = { ...t, id: nid, name: `${t.name} (copy)`, builtIn: false, isDefault: false, fileName, createdAt: new Date().toISOString() };
  tx(() => {
    run(
      'INSERT INTO templates (id, name, kind, description, builtIn, isDefault, fileName, sha256, mapping, outputPattern, createdAt) VALUES (?,?,?,?,0,0,?,?,?,?,?)',
      [nid, info.name, info.kind, info.description, fileName, info.sha256, JSON.stringify(info.mapping), info.outputPattern, info.createdAt],
    );
    audit(null, 'template-import', `Template duplicated: ${info.name}`);
  });
  return info;
}

export function deleteTemplate(id: string) {
  const t = getTemplate(id);
  if (!t) return;
  if (t.builtIn) throw new Error('Built-in templates cannot be deleted.');
  tx(() => {
    run('DELETE FROM templates WHERE id = ?', [id]);
    if (t.isDefault) {
      const next = get<{ id: string }>('SELECT id FROM templates WHERE kind = ? ORDER BY builtIn DESC LIMIT 1', [t.kind]);
      if (next) run('UPDATE templates SET isDefault = 1 WHERE id = ?', [next.id]);
    }
    audit(null, 'template-delete', `Template deleted: ${t.name}`);
  });
  try {
    unlinkSync(join(TEMPLATE_DIR, t.fileName));
  } catch {
    /* ignore */
  }
}

export function inspectTemplate(id: string): TemplateInspection {
  const t = getTemplate(id);
  if (!t) return { ok: false, error: 'Template not found', tags: [] };
  try {
    return inspectDocx(readTemplate(t), t.mapping);
  } catch (e) {
    return { ok: false, error: String((e as Error).message), tags: [] };
  }
}
