import { useEffect, useMemo, useRef, useState } from 'react';
import { FileOutput, Plus, Trash2, ClipboardPaste, CheckCircle2, FolderOpen, ExternalLink, ChevronLeft, ChevronRight, Megaphone, ListChecks, AlignLeft, PenLine, Library, BookmarkPlus, Sparkles } from 'lucide-react';
import { navigate } from '../lib/router';
import { api } from '../lib/api';
import { useData, useStore } from '../lib/store';
import { Button, Field, Input, Modal, Select, Textarea, Toggle, Seg, confirmDialog } from '../components/ui';
import { DocxViewer } from '../components/Viewers';
import { isISODate, todayISO } from '../../shared/dates';
import type { ReturnItem, SavedPhrase, TemplateKind, Warrant, WarrantInput } from '../../shared/types';

export function GenerateWizard({ warrant, kind, onClose }: { warrant: Warrant; kind: TemplateKind; onClose: () => void }) {
  const { settings, toast, saveSettings } = useStore();
  const [phraseMenu, setPhraseMenu] = useState(false);
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

  const phrases = settings?.phrases ?? [];
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const inUse = (p: SavedPhrase) =>
    items.some((i) => norm(i.description) === norm(p.text)) || norm(patch.itemsText ?? '').includes(norm(p.text));
  const suggestions = phrases.filter((p) => p.types.includes(warrant.warrantType) && !inUse(p));

  const insertPhrase = (p: SavedPhrase) => {
    setPhraseMenu(false);
    if (mode === 'list') {
      const kept = items.filter((i) => i.description.trim() || i.qty.trim());
      setItems([...kept, { qty: '', description: p.text, locationFound: '' }]);
    } else {
      const cur = (patch.itemsText ?? '').trimEnd();
      setPatch({ ...patch, itemsText: cur ? `${cur}\n${p.text}` : p.text });
    }
    toast('ok', `Added "${p.name}"`);
  };

  const savePhrase = async (text: string) => {
    if (!settings || !text.trim()) return;
    if (phrases.some((p) => norm(p.text) === norm(text))) {
      toast('info', 'That text is already in your saved text.');
      return;
    }
    const name = await confirmDialog({
      title: 'Save as reusable text',
      body: <>This wording will be available from <b>Saved text</b> on every return. It is suggested automatically for this warrant type.</>,
      ok: 'Save',
      input: { label: 'Short name', placeholder: 'e.g. Phone extraction - full file system', required: true },
    });
    if (typeof name !== 'string' || !name.trim()) return;
    const next: SavedPhrase = { id: `p${Date.now()}`, name: name.trim(), text: text.trim(), types: [warrant.warrantType] };
    if (await saveSettings({ ...settings, phrases: [...phrases, next] })) toast('ok', `Saved "${next.name}"`);
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
              <div className="row" style={{ position: 'relative' }}>
                <Seg value={mode} onChange={setMode} options={[{ value: 'list', label: <><ListChecks size={14} /> Itemized</> }, { value: 'text', label: <><AlignLeft size={14} /> Free text</> }]} />
                <div className="spacer" />
                <div>
                  <Button size="sm" icon={<Library size={14} />} onClick={() => setPhraseMenu((v) => !v)}>Saved text</Button>
                  {phraseMenu && (
                    <div className="phrase-menu" onMouseLeave={() => setPhraseMenu(false)}>
                      {phrases.length === 0 && <div className="muted small" style={{ padding: 10 }}>No saved text yet. Use the bookmark on an item to save its wording.</div>}
                      {phrases.map((p) => (
                        <button key={p.id} className="phrase-item" onClick={() => insertPhrase(p)} disabled={inUse(p)}>
                          <b>{p.name}</b>{inUse(p) && <span className="badge green" style={{ marginLeft: 6 }}>added</span>}
                          <span className="muted tiny phrase-preview">{p.text}</span>
                        </button>
                      ))}
                      <div className="muted tiny" style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>Edit saved text in Settings &gt; Saved text.</div>
                    </div>
                  )}
                </div>
                {mode === 'list' && <Button size="sm" icon={<ClipboardPaste size={14} />} onClick={pasteList}>Paste list</Button>}
              </div>
              {suggestions.length > 0 && (
                <div className="callout violet small">
                  <Sparkles size={16} color="var(--violet)" style={{ flex: 'none' }} />
                  <div className="grow col" style={{ gap: 6 }}>
                    <span>Standard language for this kind of warrant:</span>
                    {suggestions.map((p) => (
                      <div key={p.id} className="row" style={{ alignItems: 'flex-start' }}>
                        <span className="grow"><b>{p.name}</b><span className="muted phrase-preview">{p.text}</span></span>
                        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => insertPhrase(p)}>Add</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {mode === 'list' ? (
                <>
                  <div className="items">
                    <div className="item-row tiny muted" style={{ fontWeight: 700 }}><span /> <span>Qty</span><span>Description · where found</span><span /></div>
                    {items.map((it, i) => (
                      <div key={i} className="item-row">
                        <span className="num">{i + 1}.</span>
                        <Input value={it.qty} placeholder="1" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                        <div className="col" style={{ gap: 5 }}>
                        <Textarea
                          className="item-desc"
                          rows={Math.max(1, Math.min(8, Math.ceil(it.description.length / 58)))}
                          value={it.description}
                          placeholder="Apple iPhone 14 (IMEI...)"
                          autoFocus={i === items.length - 1 && !it.description}
                          onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              setItems([...items, { qty: '', description: '', locationFound: '' }]);
                            }
                          }}
                        />
                        <Input className="item-loc" value={it.locationFound} placeholder={warrant.warrantType === 'provider' ? 'Where found / how produced (optional), e.g. provider portal' : 'Where found (optional), e.g. master bedroom'} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, locationFound: e.target.value } : x)))} />
                        </div>
                        <span className="col" style={{ gap: 2 }}>
                          <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} title="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))} />
                          {it.description.trim().length > 12 && <Button size="sm" variant="ghost" iconOnly icon={<BookmarkPlus size={14} />} title="Save this wording as reusable text" onClick={() => void savePhrase(it.description)} />}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button icon={<Plus size={15} />} onClick={() => setItems([...items, { qty: '', description: '', locationFound: '' }])}>Add item</Button>
                  <div className="muted tiny">Whole-number quantities are written out: "Two (2) digital scales". Press Enter in a description to add the next row (Shift+Enter for a new line). Leave the list empty to print "No property was taken."</div>
                  <style>{`.wizard .item-row { grid-template-columns: 22px 52px minmax(0,1fr) 30px; }`}</style>
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
