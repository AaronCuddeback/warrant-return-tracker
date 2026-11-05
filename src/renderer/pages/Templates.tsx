import { useEffect, useMemo, useState } from 'react';
import { FileUp, FileText, Star, Copy, Trash2, Download, FlaskConical, Replace, Tags, Search, CheckCircle2, AlertTriangle, Lock, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useData, useStore } from '../lib/store';
import { Button, EmptyState, Field, Input, Modal, Select, Toggle, confirmDialog } from '../components/ui';
import type { TemplateInfo, TemplateInspection, TemplateKind } from '../../shared/types';

const KINDS: { value: TemplateKind; label: string; hint: string }[] = [
  { value: 'return', label: 'Return of search warrant', hint: 'Generated from the "Generate return" wizard' },
  { value: 'notification', label: 'Notification', hint: 'CalECPA / contemporaneous notice' },
  { value: 'other', label: 'Other documents', hint: 'Cover letters, preservation letters, inventories...' },
];

export function TemplatesPage() {
  const { toast } = useStore();
  const { data: templates } = useData(() => api.listTemplates());
  const [editing, setEditing] = useState<TemplateInfo | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [importKind, setImportKind] = useState<TemplateKind>('return');

  const importTpl = async () => {
    const r = await api.importTemplate(importKind);
    if (r.canceled) return;
    if (!r.ok) {
      toast('err', r.error!);
      return;
    }
    toast('ok', `Imported "${r.data!.name}". Review its fields below.`);
    setEditing(r.data!);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Documents</div>
          <h1>Templates</h1>
          <div className="sub">Use your agency's own Word forms. Put {'{tags}'} where the app should fill in data, then import the .docx.</div>
        </div>
        <div className="spacer" />
        <Button icon={<Tags size={16} />} onClick={() => setShowRef(true)}>Field reference</Button>
        <Select value={importKind} onChange={(e) => setImportKind(e.target.value as TemplateKind)} style={{ width: 210 }}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <Button variant="primary" icon={<FileUp size={16} />} onClick={importTpl}>Import .docx template</Button>
      </div>

      <div className="callout" style={{ marginBottom: 18 }}>
        <Info size={18} color="var(--blue)" style={{ flex: 'none' }} />
        <div className="small" style={{ lineHeight: 1.6 }}>
          <b>How to make a template:</b> open your agency form in Word and type tags where values go, e.g. <span className="mono">I RECEIVED SAID WARRANT ON THE {'{receivedDateLegal | upper}'}</span> or <span className="mono">SEARCH WARRANT# {'{warrantNumber}'}</span>.
          Filters: <span className="mono">| upper</span>, <span className="mono">| lower</span>, <span className="mono">| title</span>, <span className="mono">| date:"MMMM Do, YYYY"</span>. Repeat rows with <span className="mono">{'{#items}…{/items}'}</span>.
          Templates from the old version that use <span className="mono">{'{1} {2} {3}'}</span> still work - map each number to a field after importing.
        </div>
      </div>

      {KINDS.map((k) => {
        const list = (templates ?? []).filter((t) => t.kind === k.value);
        return (
          <section key={k.value} style={{ marginBottom: 22 }}>
            <div className="section-title">{k.label} <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· {k.hint}</span></div>
            {list.length === 0 ? (
              <div className="card"><EmptyState icon={<FileText size={22} />} title="None yet">Import a .docx to add one.</EmptyState></div>
            ) : (
              <div className="grid g2">
                {list.map((t) => <TemplateCard key={t.id} t={t} onEdit={() => setEditing(t)} />)}
              </div>
            )}
          </section>
        );
      })}

      {editing && <TemplateEditor t={editing} onClose={() => setEditing(null)} />}
      {showRef && <FieldReference onClose={() => setShowRef(false)} />}
    </div>
  );
}

function TemplateCard({ t, onEdit }: { t: TemplateInfo; onEdit: () => void }) {
  const { toast } = useStore();
  const { data: insp } = useData(() => api.inspectTemplate(t.id), [t.id, t.sha256]);
  const problems = insp ? (insp.ok ? insp.tags.filter((x) => x.status === 'unknown' || x.status === 'numeric').length : 1) : 0;
  const res = (r: { ok: boolean; error?: string; canceled?: boolean }, m: string) => !r.canceled && toast(r.ok ? 'ok' : 'err', r.ok ? m : r.error!);
  return (
    <div className="card tpl-card">
      <div className="tpl-ico"><FileText size={22} /></div>
      <div className="grow">
        <div className="row" style={{ gap: 8 }}>
          <b className="ellipsis">{t.name}</b>
          {t.isDefault && <span className="badge yellow"><Star size={11} /> Default</span>}
          {t.builtIn && <span className="badge"><Lock size={11} /> Built-in</span>}
        </div>
        {t.description && <div className="small muted" style={{ marginTop: 4 }}>{t.description}</div>}
        <div className="row small" style={{ marginTop: 8 }}>
          {insp && (problems ? (
            <span className="badge orange"><AlertTriangle size={12} /> {insp.ok ? `${problems} field${problems > 1 ? 's' : ''} need mapping` : 'Template error'}</span>
          ) : (
            <span className="badge green"><CheckCircle2 size={12} /> {insp.tags.length} fields OK</span>
          ))}
        </div>
        <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
          <Button size="sm" onClick={onEdit}>Settings & fields</Button>
          <Button size="sm" icon={<FlaskConical size={13} />} onClick={() => void api.testTemplate(t.id).then((r) => res(r, 'Opened a test document filled with sample data'))}>Test</Button>
          {!t.isDefault && <Button size="sm" icon={<Star size={13} />} onClick={() => void api.updateTemplate({ ...t, isDefault: true }).then((r) => res(r, `"${t.name}" is now the default`))}>Make default</Button>}
          <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void api.duplicateTemplate(t.id).then((r) => res(r, 'Duplicated - you can now replace the file with your edited version'))}>Duplicate</Button>
          <Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={() => void api.exportTemplate(t.id).then((r) => res(r, 'Template saved - edit it in Word, then import it back'))}>Download</Button>
          {!t.builtIn && <Button size="sm" variant="ghost" icon={<Replace size={13} />} onClick={() => void api.replaceTemplateFile(t.id).then((r) => res(r, 'Template file replaced'))}>Replace file</Button>}
          {!t.builtIn && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={async () => {
            if (await confirmDialog({ title: 'Delete template?', body: `"${t.name}" will be removed. Documents already generated are not affected.`, ok: 'Delete', danger: true })) res(await api.deleteTemplate(t.id), 'Template deleted');
          }} />}
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ t: initial, onClose }: { t: TemplateInfo; onClose: () => void }) {
  const { toast } = useStore();
  const [t, setT] = useState(initial);
  const [insp, setInsp] = useState<TemplateInspection | null>(null);
  const { data: catalog } = useData(() => api.templateFieldCatalog());
  useEffect(() => {
    void api.inspectTemplate(initial.id).then(setInsp);
  }, [initial.id, initial.sha256]);

  const fields = useMemo(() => (catalog ?? []).filter((f) => !f.tag.startsWith('#') && !['qty', 'qtyWords', 'description', 'locationFound', 'index'].includes(f.tag)), [catalog]);
  const save = async () => {
    const r = await api.updateTemplate(t);
    if (r.ok) {
      toast('ok', 'Template saved');
      onClose();
    } else toast('err', r.error!);
  };
  const needsMap = insp?.tags.filter((x) => x.status === 'numeric' || x.status === 'unknown' || x.status === 'mapped') ?? [];

  return (
    <Modal title="Template settings" onClose={onClose} size="mid" icon={<FileText size={19} color="var(--accent)" />}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={<FlaskConical size={15} />} onClick={async () => { await api.updateTemplate(t); const r = await api.testTemplate(t.id); if (!r.ok) toast('err', r.error!); }}>Save & test</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="modal-body col" style={{ gap: 16 }}>
        <div className="grid g2">
          <Field label="Name"><Input value={t.name} disabled={t.builtIn} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
          <Field label="Used for">
            <Select value={t.kind} disabled={t.builtIn} onChange={(e) => setT({ ...t, kind: e.target.value as TemplateKind })}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Description" className="span-all"><Input value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
          <Field label="Saved file name" className="span-all" hint="Tags allowed, e.g. {caseNumber} - Return {warrantNumber}"><Input className="mono" value={t.outputPattern} onChange={(e) => setT({ ...t, outputPattern: e.target.value })} /></Field>
          <div className="span-all"><Toggle checked={t.isDefault} onChange={(v) => setT({ ...t, isDefault: v })} label="Default template for this document type" /></div>
        </div>

        <div>
          <div className="section-title">Fields found in this document</div>
          {!insp ? <div className="skeleton" style={{ height: 60 }} /> : !insp.ok ? (
            <div className="callout danger pre"><AlertTriangle size={17} color="var(--red)" style={{ flex: 'none' }} />{insp.error}</div>
          ) : (
            <>
              <div className="row wrap" style={{ gap: 6 }}>
                {insp.tags.length === 0 && <span className="muted small">No {'{tags}'} found. Add tags in Word, then use Replace file.</span>}
                {insp.tags.map((x) => (
                  <span key={x.tag} className={`tagchip ${x.status}`} title={x.status === 'known' ? 'Recognized field' : x.status === 'loop' ? 'Repeating section' : x.status === 'mapped' ? `Mapped to ${x.field}` : 'Needs mapping'}>
                    {'{'}{x.tag}{'}'}
                  </span>
                ))}
              </div>
              {needsMap.length > 0 && (
                <div className="col" style={{ marginTop: 14, gap: 10 }}>
                  <div className="small muted">Map these tags to app fields (old numbered tags and your own custom tag names):</div>
                  {needsMap.map((x) => (
                    <div key={x.tag} className="row">
                      <span className="tagchip numeric" style={{ width: 150, justifyContent: 'center' }}>{'{'}{x.tag}{'}'}</span>
                      <span className="muted">→</span>
                      <Select value={t.mapping[x.tag] ?? ''} onChange={(e) => setT({ ...t, mapping: { ...t.mapping, [x.tag]: e.target.value } })}>
                        <option value="">(leave blank)</option>
                        {fields.map((f) => <option key={f.tag} value={f.tag}>{f.label} - {'{'}{f.tag}{'}'}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FieldReference({ onClose }: { onClose: () => void }) {
  const { toast } = useStore();
  const [q, setQ] = useState('');
  const { data } = useData(() => api.templateFieldCatalog());
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>>();
    for (const f of data ?? []) {
      if (q && !`${f.tag} ${f.label}`.toLowerCase().includes(q.toLowerCase())) continue;
      m.set(f.group, [...(m.get(f.group) ?? []), f]);
    }
    return [...m.entries()];
  }, [data, q]);
  return (
    <Modal title="Template field reference" onClose={onClose} size="mid" icon={<Tags size={19} color="var(--accent)" />}>
      <div className="modal-body col">
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--muted)' }} />
          <Input style={{ paddingLeft: 34 }} placeholder="Search fields..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="small muted">Click a tag to copy it, then paste it into your Word template.</div>
        {groups.map(([g, list]) => (
          <div key={g}>
            <div className="section-title" style={{ marginTop: 8 }}>{g}</div>
            <table className="t" style={{ fontSize: 12.5 }}>
              <tbody>
                {list.map((f) => (
                  <tr key={f.tag} onClick={() => { void navigator.clipboard.writeText(`{${f.tag}}`); toast('ok', `Copied {${f.tag}}`); }}>
                    <td style={{ width: 230 }}><span className="tagchip">{'{'}{f.tag}{'}'}</span></td>
                    <td>{f.label}</td>
                    <td className="muted mono">{f.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}
