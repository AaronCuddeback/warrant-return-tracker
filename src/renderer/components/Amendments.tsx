import { useMemo, useState } from 'react';
import { FilePlus2, Paperclip, Pencil, Trash2, X, FileSignature, ArrowRight, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Button, Field, Input, Modal, Select, Textarea, Toggle, confirmDialog } from './ui';
import { applyDueRule, formatDate, isISODate, relativeDays, daysUntil, todayISO } from '../../shared/dates';
import type { Amendment, Warrant } from '../../shared/types';

export function AmendmentModal({ w, amendment, onClose }: { w: Warrant; amendment?: Amendment; onClose: () => void }) {
  const { settings, toast } = useStore();
  const editing = !!amendment;
  const nextNo = (w.amendments?.length ?? 0) + 1;
  const [signedDate, setSignedDate] = useState(amendment?.signedDate ?? todayISO());
  const [judge, setJudge] = useState(amendment?.judge ?? w.judge);
  const [summary, setSummary] = useState(amendment?.summary ?? '');
  const [addedScope, setAddedScope] = useState(amendment?.addedScope ?? '');
  const [appendScope, setAppendScope] = useState(true);
  const [dueMode, setDueMode] = useState<'keep' | 'rule' | 'custom'>('keep');
  const [ruleName, setRuleName] = useState(settings?.dueRules[0]?.name ?? '');
  const [customDue, setCustomDue] = useState(w.returnDueDate);
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fmt = settings!.app.dateFormat;

  const newDue = useMemo(() => {
    if (dueMode === 'custom') return isISODate(customDue) ? customDue : null;
    if (dueMode === 'rule' && isISODate(signedDate)) {
      const r = settings?.dueRules.find((x) => x.name === ruleName);
      return r ? applyDueRule(signedDate, r, settings?.holidays) : null;
    }
    return null;
  }, [dueMode, customDue, signedDate, ruleName, settings]);

  const choose = async () => {
    const p = await api.pickFile([{ name: 'Signed amendment', extensions: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'tif', 'tiff'] }]);
    if (p) setFile({ path: p, name: p.split(/[\\/]/).pop() ?? p });
  };

  const save = async () => {
    setSaving(true);
    const r = await api.saveAmendment(
      { id: amendment?.id, warrantId: w.id, signedDate, judge, summary, addedScope, appendScope: !editing && appendScope, newDueDate: editing ? null : newDue },
      file?.path ?? null,
    );
    setSaving(false);
    if (!r.ok) {
      toast('err', r.error!);
      return;
    }
    toast('ok', editing ? `Amendment ${amendment!.number} updated` : `Amendment ${nextNo} recorded${newDue && newDue !== w.returnDueDate ? ` - return now due ${formatDate(newDue, fmt)}` : ''}`);
    onClose();
  };

  const valid = isISODate(signedDate) && summary.trim() && (dueMode !== 'custom' || isISODate(customDue));

  return (
    <Modal title={editing ? `Edit amendment ${amendment!.number}` : `Amend warrant ${w.warrantNumber} - Amendment ${nextNo}`} onClose={onClose} size="mid" icon={<FileSignature size={19} color="var(--accent)" />}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" busy={saving} disabled={!valid} onClick={save}>{editing ? 'Save changes' : 'Record amendment'}</Button></>}>
      <div className="modal-body col" style={{ gap: 16 }}>
        <div className="grid g2">
          <Field label="Amendment signed on" required><Input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} /></Field>
          <Field label="Signing judge"><Input value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="Hon. Jane Smith" /></Field>
          <Field label="What the amendment changes" required className="span-all" hint="e.g. Adds the detached garage and 2019 Toyota Tacoma; corrects the suspect's DOB">
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus />
          </Field>
          <Field label="Added places / persons / property / accounts (optional)" className="span-all">
            <Textarea rows={2} value={addedScope} onChange={(e) => setAddedScope(e.target.value)} placeholder="Detached garage at 123 Main Street; 2019 Toyota Tacoma CA 8ABC123" />
          </Field>
          {!editing && addedScope.trim() && (
            <div className="span-all"><Toggle checked={appendScope} onChange={setAppendScope} label="Add these to the places searched that print in the return" /></div>
          )}
        </div>

        {!editing && (
          <div className="col" style={{ gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>Return due date</div>
            <div className="row wrap">
              <label className="row small" style={{ cursor: 'pointer' }}><input type="radio" checked={dueMode === 'keep'} onChange={() => setDueMode('keep')} /> Keep {formatDate(w.returnDueDate, fmt)}</label>
              <label className="row small" style={{ cursor: 'pointer' }}><input type="radio" checked={dueMode === 'rule'} onChange={() => setDueMode('rule')} /> Restart from amendment date</label>
              <label className="row small" style={{ cursor: 'pointer' }}><input type="radio" checked={dueMode === 'custom'} onChange={() => setDueMode('custom')} /> Set a date</label>
            </div>
            {dueMode === 'rule' && (
              <Select value={ruleName} onChange={(e) => setRuleName(e.target.value)} style={{ maxWidth: 320 }}>
                {settings?.dueRules.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </Select>
            )}
            {dueMode === 'custom' && <Input type="date" value={customDue} onChange={(e) => setCustomDue(e.target.value)} style={{ maxWidth: 220 }} />}
            {newDue && newDue !== w.returnDueDate && (
              <div className="callout warn small">
                <span className="mono">{formatDate(w.returnDueDate, fmt)}</span><ArrowRight size={14} /><b className="mono">{formatDate(newDue, fmt)}</b>
                <span className="muted">({relativeDays(daysUntil(newDue))}) - logged in the audit trail and reminders restart</span>
              </div>
            )}
          </div>
        )}

        <div
          className={`drop ${over ? 'over' : ''}`}
          style={{ padding: 16 }}
          onClick={choose}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) {
              const p = api.getPathForFile(f);
              setFile({ path: p, name: f.name });
            }
          }}
        >
          {file ? (
            <div className="row" style={{ justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
              <Paperclip size={16} /> <b>{file.name}</b>
              <Button size="sm" variant="ghost" iconOnly icon={<X size={14} />} onClick={() => setFile(null)} />
            </div>
          ) : (
            <div className="row" style={{ justifyContent: 'center' }}>
              <FilePlus2 size={18} color="var(--accent)" />
              <span><b>Attach the signed amendment</b> <span className="muted small">- drop it here or click to browse (optional, can be added later)</span></span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function AmendmentsCard({ w }: { w: Warrant }) {
  const { settings, toast } = useStore();
  const [edit, setEdit] = useState<Amendment | 'new' | null>(null);
  const list = w.amendments ?? [];
  const fmt = settings!.app.dateFormat;
  return (
    <div className="card">
      <div className="card-head">
        <FileSignature size={16} color="var(--accent)" />
        <h3>Amendments</h3>
        <span className="muted small">{list.length ? `${list.length}` : 'none'}</span>
        <div className="spacer" />
        <Button size="sm" icon={<FilePlus2 size={14} />} onClick={() => setEdit('new')}>Add amendment</Button>
      </div>
      {list.length === 0 ? (
        <div className="card-body muted small">If the judge signs an amendment (added location, corrected description, extended deadline...), record it here and attach the signed copy. Templates can print it with <span className="mono">{'{asAmendedText}'}</span> or <span className="mono">{'{amendmentsText}'}</span>.</div>
      ) : (
        <div>
          {list.map((a) => (
            <div key={a.id} className="att" style={{ alignItems: 'flex-start' }}>
              <div className="fi" style={{ background: 'var(--orange-bg)', color: 'var(--orange)', fontWeight: 800 }}>{a.number}</div>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>Signed {formatDate(a.signedDate, fmt)}{a.judge ? ` · ${a.judge}` : ''}</div>
                <div className="small pre" style={{ marginTop: 3 }}>{a.summary}</div>
                {a.addedScope && <div className="small muted pre" style={{ marginTop: 3 }}>Added: {a.addedScope}</div>}
                {a.newDueDate && <div className="small" style={{ marginTop: 3, color: 'var(--orange)' }}>Due date {formatDate(a.previousDueDate, fmt)} → {formatDate(a.newDueDate, fmt)}</div>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                {a.attachmentId ? (
                  <Button size="sm" icon={<Eye size={13} />} onClick={() => navigate(`/warrant/${w.id}/documents`)}>Document</Button>
                ) : (
                  <span className="badge orange" title="No signed copy attached">No document</span>
                )}
                <Button size="sm" variant="ghost" iconOnly icon={<Pencil size={13} />} title="Edit / attach document" onClick={() => setEdit(a)} />
                <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={13} />} title="Delete record" onClick={async () => {
                  if (await confirmDialog({ title: `Delete amendment ${a.number}?`, body: 'The amendment record is removed. Its attached document stays in Documents, and any due-date change it made is not reversed. The deletion is logged.', ok: 'Delete', danger: true })) {
                    const r = await api.deleteAmendment(a.id);
                    toast(r.ok ? 'ok' : 'err', r.ok ? 'Amendment record deleted' : r.error!);
                  }
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <AmendmentModal w={w} amendment={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
