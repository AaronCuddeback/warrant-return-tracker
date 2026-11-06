import { useEffect, useMemo, useRef, useState } from 'react';
import { FileOutput, Plus, Trash2, ClipboardPaste, CheckCircle2, FolderOpen, ExternalLink, ChevronLeft, ChevronRight, Megaphone, ListChecks, AlignLeft, PenLine } from 'lucide-react';
import { navigate } from '../lib/router';
import { api } from '../lib/api';
import { useData, useStore } from '../lib/store';
import { Button, Field, Input, Modal, Select, Textarea, Toggle, Seg } from '../components/ui';
import { DocxViewer } from '../components/Viewers';
import { isISODate, todayISO } from '../../shared/dates';
import type { ReturnItem, TemplateKind, Warrant, WarrantInput } from '../../shared/types';

export function GenerateWizard({ warrant, kind, onClose }: { warrant: Warrant; kind: TemplateKind; onClose: () => void }) {
  const { settings, toast } = useStore();
  const { data: templates } = useData(() => api.listTemplates());
  const choices = useMemo(() => (templates ?? []).filter((t) => t.kind === kind), [templates, kind]);
  const [templateId, setTemplateId] = useState('');
  useEffect(() => {
    if (!templateId && choices.length) setTemplateId((choices.find((t) => t.isDefault) ?? choices[0]).id);
  }, [choices, templateId]);

  const [patch, setPatch] = useState<Partial<WarrantInput>>(() => ({
    receivedDate: warrant.receivedDate || warrant.signedDate,
    executedDate: warrant.executedDate || (kind === 'return' ? todayISO() : todayISO()),
    locations: warrant.locations,
    items: warrant.items.length ? warrant.items : [],
    itemsText: warrant.itemsText,
    investigationNature: warrant.investigationNature,
  }));
  const [mode, setMode] = useState<'list' | 'text'>(warrant.itemsText && !warrant.items.length ? 'text' : 'list');
  const [step, setStep] = useState(0);
  const [markFiled, setMarkFiled] = useState(settings?.app.archiveOnReturn ?? true);
  const [markServed, setMarkServed] = useState(true);
  const [sign, setSign] = useState(!!settings?.signature.useByDefault);
  const [sigImg, setSigImg] = useState<string | null>(null);
  const [usesSig, setUsesSig] = useState(false);
  useEffect(() => {
    void api.getSignature().then(setSigImg);
  }, []);
  useEffect(() => {
    if (templateId) void api.templateUsesSignature(templateId).then(setUsesSig);
  }, [templateId]);
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const [previewErr, setPreviewErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ filePath?: string; sha256: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const items = patch.items ?? [];
  const setItems = (it: ReturnItem[]) => setPatch((p) => ({ ...p, items: it }));
  const effectivePatch = useMemo<Partial<WarrantInput>>(() => (mode === 'list' ? { ...patch, items: items.filter((i) => i.description.trim()), itemsText: '' } : { ...patch, items: [] }), [patch, mode, items]);

  useEffect(() => {
    if (!templateId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await api.generateDocument({ warrantId: warrant.id, templateId, patch: effectivePatch, preview: true, sign });
      if (r.ok && r.data?.bytes) {
        setPreview(r.data.bytes);
        setPreviewErr('');
      } else setPreviewErr(r.error || 'Preview failed');
    }, 450);
    return () => clearTimeout(timer.current);
  }, [effectivePatch, templateId, warrant.id, sign]);

  const steps = kind === 'return' ? ['Search details', 'Property taken', 'Save'] : ['Notice details', 'Save'];
  const last = step === steps.length - 1;
  const canSave = !!templateId && isISODate(patch.executedDate ?? '');

  const save = async () => {
    setSaving(true);
    const r = await api.generateDocument({
      warrantId: warrant.id, templateId, patch: effectivePatch,
      markFiled: kind === 'return' ? markFiled : undefined,
      markNoticeServed: kind === 'notification' ? markServed : undefined,
      sign,
    });
    setSaving(false);
    if (r.canceled) return;
    if (!r.ok) {
      toast('err', r.error || 'Could not generate the document');
      return;
    }
    setDone({ filePath: r.data?.filePath, sha256: r.data!.sha256 });
  };

  const pasteList = async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (!text.trim()) {
      toast('info', 'Copy a list (one item per line) first, then click Paste list.');
      return;
    }
    const rows = text.split(/\r?\n/).map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean).map((l) => {
      const m = /^(\d+)\s*[x\-:]?\s+(.*)$/i.exec(l);
      return m ? { qty: m[1], description: m[2], locationFound: '' } : { qty: '', description: l, locationFound: '' };
    });
    setItems([...items.filter((i) => i.description.trim()), ...rows]);
    toast('ok', `Added ${rows.length} item(s) from the clipboard.`);
  };

  if (done) {
    return (
      <Modal title={kind === 'return' ? 'Return generated' : 'Notification generated'} onClose={onClose} icon={<CheckCircle2 size={20} color="var(--green)" />}
        footer={<><Button onClick={onClose} variant="primary">Done</Button></>}>
        <div className="modal-body col">
          <div className="callout ok"><CheckCircle2 size={18} color="var(--green)" style={{ flex: 'none' }} /><div>Saved and a hashed copy was added to this warrant's documents{kind === 'return' && markFiled ? '. The warrant is now marked filed and archived.' : '.'}</div></div>
          {done.filePath && <div className="mono small" style={{ wordBreak: 'break-all' }}>{done.filePath}</div>}
          <div className="tiny muted mono" style={{ wordBreak: 'break-all' }}>SHA-256 {done.sha256}</div>
          <div className="row">
            {done.filePath && <Button icon={<ExternalLink size={15} />} onClick={() => void api.openPath(done.filePath!)}>Open in Word</Button>}
            {done.filePath && <Button icon={<FolderOpen size={15} />} onClick={() => void api.showInFolder(done.filePath!)}>Show in folder</Button>}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={kind === 'return' ? `Return of search warrant · ${warrant.warrantNumber}` : `Contemporaneous notification · ${warrant.warrantNumber}`} onClose={onClose} size="wide" icon={kind === 'return' ? <FileOutput size={20} color="var(--accent)" /> : <Megaphone size={20} color="var(--accent)" />}
      footer={
        <>
          <span className="muted small grow">Everything you confirm here is saved back to the warrant record.</span>
          {step > 0 && <Button icon={<ChevronLeft size={15} />} onClick={() => setStep(step - 1)}>Back</Button>}
          {!last && <Button variant="primary" onClick={() => setStep(step + 1)}>Next <ChevronRight size={15} /></Button>}
          {last && <Button variant="primary" size="lg" busy={saving} disabled={!canSave} icon={<FileOutput size={16} />} onClick={save}>Generate & save .docx</Button>}
        </>
      }>
      <div className="wizard">
        <div className="left">
          <div className="wsteps">{steps.map((s, i) => <div key={s} className={`wstep ${i <= step ? 'on' : ''}`} title={s} />)}</div>
          <div className="eyebrow">Step {step + 1} of {steps.length}</div>
          <h3 style={{ margin: '0 0 14px' }}>{steps[step]}</h3>

          {kind === 'return' && step === 0 && (
            <div className="col" style={{ gap: 14 }}>
              <div className="grid g2">
                <Field label="Warrant received on" hint="Printed: 'I received said warrant on the...'"><Input type="date" value={patch.receivedDate ?? ''} onChange={(e) => setPatch({ ...patch, receivedDate: e.target.value || null })} /></Field>
                <Field label="Search conducted on" required><Input type="date" value={patch.executedDate ?? ''} onChange={(e) => setPatch({ ...patch, executedDate: e.target.value || null })} /></Field>
              </div>
              <Field label="Premises / persons / property searched" hint="Exactly as it should read after 'TO WIT:'">
                <Textarea rows={7} value={patch.locations ?? ''} onChange={(e) => setPatch({ ...patch, locations: e.target.value })} placeholder="123 Main Street, Placerville, California..." />
              </Field>
            </div>
          )}

          {kind === 'return' && step === 1 && (
            <div className="col" style={{ gap: 12 }}>
              <div className="row">
                <Seg value={mode} onChange={setMode} options={[{ value: 'list', label: <><ListChecks size={14} /> Itemized</> }, { value: 'text', label: <><AlignLeft size={14} /> Free text</> }]} />
                <div className="spacer" />
                {mode === 'list' && <Button size="sm" icon={<ClipboardPaste size={14} />} onClick={pasteList}>Paste list</Button>}
              </div>
              {mode === 'list' ? (
                <>
                  <div className="items">
                    <div className="item-row tiny muted" style={{ fontWeight: 700 }}><span /> <span>Qty</span><span>Description</span><span>Where found</span><span /></div>
                    {items.map((it, i) => (
                      <div key={i} className="item-row">
                        <span className="num">{i + 1}.</span>
                        <Input value={it.qty} placeholder="1" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                        <Input value={it.description} placeholder="Apple iPhone 14 (IMEI...)" autoFocus={i === items.length - 1 && !it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                          onKeyDown={(e) => { if (e.key === 'Enter') setItems([...items, { qty: '', description: '', locationFound: '' }]); }} />
                        <Input value={it.locationFound} placeholder="bedroom" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, locationFound: e.target.value } : x)))} />
                        <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} onClick={() => setItems(items.filter((_, j) => j !== i))} />
                      </div>
                    ))}
                  </div>
                  <Button icon={<Plus size={15} />} onClick={() => setItems([...items, { qty: '', description: '', locationFound: '' }])}>Add item</Button>
                  <div className="muted tiny">Whole-number quantities are written out: "Two (2) digital scales". Press Enter in a description to add the next row. Leave the list empty to print "No property was taken."</div>
                  <style>{`.wizard .item-row { grid-template-columns: 22px 56px minmax(0,1fr) 110px 28px; }`}</style>
                </>
              ) : (
                <Field label="Property taken" hint="Printed after 'AND THERE I DISCOVERED:'">
                  <Textarea rows={14} value={patch.itemsText ?? ''} onChange={(e) => setPatch({ ...patch, itemsText: e.target.value })} placeholder={'One (1) Apple iPhone 14...\nTwo (2) digital scales...'} />
                </Field>
              )}
            </div>
          )}

          {kind === 'notification' && step === 0 && (
            <div className="col" style={{ gap: 14 }}>
              <Field label="Search conducted on" required><Input type="date" value={patch.executedDate ?? ''} onChange={(e) => setPatch({ ...patch, executedDate: e.target.value || null })} /></Field>
              <Field label="Criminal investigation pertaining to" hint="Completes: 'These records were requested for a criminal investigation pertaining to...'">
                <Textarea rows={4} value={patch.investigationNature ?? ''} onChange={(e) => setPatch({ ...patch, investigationNature: e.target.value })} />
              </Field>
            </div>
          )}

          {last && (
            <div className="col" style={{ gap: 14 }}>
              <Field label="Template">
                <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {choices.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
                </Select>
              </Field>
              {choices.length === 0 && <div className="callout warn">No {kind} templates. Add one under Templates.</div>}
              {usesSig && (
                sigImg ? (
                  <div className="col" style={{ gap: 8 }}>
                    <Toggle checked={sign} onChange={setSign} label="Sign with my saved signature" />
                    {sign && <div className="sig-show" style={{ minHeight: 0, padding: 8 }}><img src={sigImg} alt="" style={{ maxHeight: 54 }} /></div>}
                  </div>
                ) : (
                  <div className="callout small">
                    <PenLine size={16} color="var(--blue)" style={{ flex: 'none' }} />
                    <div className="grow">This template has a signature line. Add your signature once and it can be signed automatically.</div>
                    <Button size="sm" onClick={() => { onClose(); navigate('/settings/signature'); }}>Add signature</Button>
                  </div>
                )
              )}
              {kind === 'return' && (
                <Toggle checked={markFiled} onChange={setMarkFiled} label="Mark this warrant as filed and archive it" />
              )}
              {kind === 'notification' && (
                <Toggle checked={markServed} onChange={setMarkServed} label="Record the notice as served on the search date" />
              )}
              <div className="callout small">
                <FileOutput size={16} color="var(--blue)" style={{ flex: 'none' }} />
                <div>
                  {settings?.app.askWhereToSave || !settings?.app.outputFolder ? 'You will choose where to save the .docx.' : <>Saves to <span className="mono">{settings.app.outputFolder}</span></>} A copy is stored with the warrant and fingerprinted (SHA-256) for chain of custody.
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="right">
          <div className="row small muted"><span className="dot" style={{ background: 'var(--green)' }} /> Live preview - exactly what will be saved</div>
          {previewErr ? <div className="callout danger pre">{previewErr}</div> : preview ? <DocxViewer bytes={preview} /> : <div className="skeleton" style={{ flex: 1 }} />}
        </div>
      </div>
    </Modal>
  );
}
