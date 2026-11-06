import { useEffect, useState } from 'react';
import {
  ArrowLeft, FileOutput, Megaphone, CheckCircle2, Circle, Pencil, Save, X, Upload, Download, ExternalLink, Trash2, ShieldCheck,
  CalendarPlus, BellRing, BellOff, CalendarClock, FileText, Package, RotateCcw, PlayCircle, History, Paperclip, Eye, FileSignature,
} from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useData, useStore } from '../lib/store';
import { Button, Countdown, EmptyState, Field, FileIcon, Input, Modal, Select, StatusBadge, confirmDialog, fmtBytes } from '../components/ui';
import { WarrantForm } from '../components/WarrantForm';
import { PdfViewer, DocxViewer } from '../components/Viewers';
import { GenerateWizard } from './GenerateWizard';
import { AmendmentModal, AmendmentsCard } from '../components/Amendments';
import { addDays, daysUntil, formatDate, relativeDays, todayISO, urgencyOf } from '../../shared/dates';
import { formatItem } from '../../shared/fields';
import { ATTACHMENT_KINDS, WARRANT_TYPES, type Attachment, type AttachmentKind, type Warrant, type WarrantInput } from '../../shared/types';

export function WarrantDetail({ id, tab = 'overview', action }: { id: number; tab?: string; action?: string | null }) {
  const { settings, toast } = useStore();
  const { data: w, loading } = useData(() => api.getWarrant(id), [id]);
  const { data: atts } = useData(() => api.listAttachments(id), [id]);
  const [wizard, setWizard] = useState<'return' | 'notification' | null>(null);
  const [extend, setExtend] = useState(false);
  const [amend, setAmend] = useState(false);

  useEffect(() => {
    if (action === 'return' || action === 'notification') setWizard(action);
  }, [action]);

  if (loading && !w) return <div className="page"><div className="skeleton" style={{ height: 120 }} /></div>;
  if (!w) return <div className="page"><EmptyState icon={<FileText size={26} />} title="Warrant not found" action={<Button onClick={() => navigate('/warrants')}>Back to warrants</Button>} /></div>;

  const fmt = settings!.app.dateFormat;
  const d = daysUntil(w.returnDueDate);
  const u = urgencyOf(d, w.status === 'filed');
  const trashed = !!w.deletedAt;

  const markExecuted = async () => {
    const date = await confirmDialog({ title: 'Mark warrant executed', body: 'Record the date the search was conducted / the warrant was served on the provider.', ok: 'Mark executed', input: { label: 'Executed on', type: 'date', defaultValue: w.executedDate || todayISO(), required: true } });
    if (typeof date === 'string') {
      const r = await api.updateWarrant(w.id, { status: 'executed', executedDate: date });
      toast(r.ok ? 'ok' : 'err', r.ok ? 'Marked executed' : r.error!);
    }
  };
  const markFiled = async () => {
    const date = await confirmDialog({ title: 'Mark return filed', body: 'Record the date the return was filed with the court. The warrant moves to the archive.', ok: 'Mark filed', input: { label: 'Filed on', type: 'date', defaultValue: todayISO(), required: true } });
    if (typeof date === 'string') {
      const r = await api.updateWarrant(w.id, { status: 'filed', filedDate: date });
      toast(r.ok ? 'ok' : 'err', r.ok ? 'Return filed - warrant archived' : r.error!);
    }
  };
  const reopen = async () => {
    const r = await api.setStatus(w.id, w.executedDate ? 'executed' : 'pending');
    toast(r.ok ? 'ok' : 'err', r.ok ? 'Reopened' : r.error!);
  };
  const snooze = async () => {
    if (w.snoozeUntil && daysUntil(w.snoozeUntil) >= 0) {
      await api.snooze(w.id, null);
      toast('ok', 'Reminders resumed');
      return;
    }
    const date = await confirmDialog({ title: 'Snooze reminders', body: 'Pause reminders for this warrant until the date below (it still shows on the dashboard).', ok: 'Snooze', input: { label: 'Snooze until', type: 'date', defaultValue: addDays(todayISO(), 2), required: true } });
    if (typeof date === 'string') {
      await api.snooze(w.id, date);
      toast('ok', `Reminders snoozed until ${formatDate(date, fmt)}`);
    }
  };
  const trash = async () => {
    const ok = await confirmDialog({ title: 'Move to trash?', body: 'The warrant and its documents can be restored from Warrants > Trash.', ok: 'Move to trash', danger: true });
    if (ok) {
      await api.trashWarrant(w.id);
      toast('ok', 'Moved to trash', { label: 'Undo', run: () => void api.restoreWarrant(w.id) });
      navigate('/warrants');
    }
  };
  const result = (r: { ok: boolean; error?: string; canceled?: boolean }, msg: string) => !r.canceled && toast(r.ok ? 'ok' : 'err', r.ok ? msg : r.error!);

  const hasWarrantDoc = atts?.some((a) => a.kind === 'warrant');
  const returnDoc = atts?.find((a) => a.kind === 'return' && a.generated);
  const noticeDoc = atts?.find((a) => a.kind === 'notification' && a.generated);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <FileText size={15} /> },
    { id: 'documents', label: `Documents${atts?.length ? ` (${atts.length})` : ''}`, icon: <Paperclip size={15} /> },
    { id: 'activity', label: 'Activity & audit', icon: <History size={15} /> },
  ];

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate(w.status === 'filed' ? '/warrants?view=filed' : '/warrants')}>Warrants</Button>
      </div>

      {trashed && (
        <div className="callout danger" style={{ marginBottom: 14 }}>
          <Trash2 size={17} color="var(--red)" style={{ flex: 'none' }} />
          <div className="grow">This warrant is in the trash.</div>
          <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void api.restoreWarrant(w.id)}>Restore</Button>
        </div>
      )}

      <div className={`detail-head u-${u}`}>
        <Countdown w={w} big />
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--u)' }}>{w.status === 'filed' ? `Return filed ${formatDate(w.filedDate, fmt)}` : `${relativeDays(d)} · ${formatDate(w.returnDueDate, 'dddd, MMMM D, YYYY')}`}</div>
          <h1 className="mono">{w.warrantNumber || '(no warrant #)'}</h1>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <span className="muted">Case</span> <span className="mono">{w.caseNumber || '-'}</span>
            <StatusBadge status={w.status} />
            <span className="badge">{WARRANT_TYPES.find((t) => t.value === w.warrantType)?.label}</span>
            {w.provider && <span className="badge blue">{w.provider}</span>}
            {(w.amendments?.length ?? 0) > 0 && <span className="badge orange">Amended{w.amendments!.length > 1 ? ` x${w.amendments!.length}` : ''}</span>}
            {w.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="badge violet">{t}</span>)}
          </div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <div className="row">
            {w.status !== 'filed' && <Button icon={<FileSignature size={16} />} onClick={() => setAmend(true)}>Amend</Button>}
            {w.status === 'pending' && <Button icon={<PlayCircle size={16} />} onClick={markExecuted}>Mark executed</Button>}
            {w.status !== 'filed' && <Button variant="primary" size="lg" icon={<FileOutput size={17} />} onClick={() => setWizard('return')}>Generate return</Button>}
            {w.status === 'filed' && <Button icon={<RotateCcw size={16} />} onClick={reopen}>Reopen</Button>}
            {w.status === 'filed' && <Button icon={<FileOutput size={16} />} onClick={() => setWizard('return')}>Regenerate return</Button>}
          </div>
          <Stepper w={w} />
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => navigate(`/warrant/${w.id}${t.id === 'overview' ? '' : '/' + t.id}`)}>{t.icon}{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="detail-grid">
          <Overview w={w} />
          <div className="col" style={{ gap: 16 }}>
            <div className="card">
              <div className="card-head"><CheckCircle2 size={16} color="var(--accent)" /><h3>Checklist</h3></div>
              <div className="card-body col" style={{ gap: 10 }}>
                <Check done={!!hasWarrantDoc} label="Signed warrant attached" action={!hasWarrantDoc && <Button size="sm" onClick={() => void api.addAttachments(w.id, 'warrant').then((r) => result(r, 'Attached'))}>Attach</Button>} />
                <Check done={!!w.executedDate} label={w.executedDate ? `Executed ${formatDate(w.executedDate, fmt)}` : 'Warrant executed'} action={!w.executedDate && <Button size="sm" onClick={markExecuted}>Mark</Button>} />
                {w.notificationRequired && (
                  <Check done={!!w.notificationServedDate} label={w.notificationServedDate ? `Notice served ${formatDate(w.notificationServedDate, fmt)}` : noticeDoc ? 'Notice generated - not marked served' : 'CalECPA notice'}
                    action={<Button size="sm" icon={<Megaphone size={13} />} onClick={() => setWizard('notification')}>{noticeDoc ? 'Again' : 'Generate'}</Button>} />
                )}
                <Check done={!!returnDoc} label="Return generated" action={!returnDoc && w.status !== 'filed' && <Button size="sm" onClick={() => setWizard('return')}>Generate</Button>} />
                <Check done={w.status === 'filed'} label={w.status === 'filed' ? `Filed ${formatDate(w.filedDate, fmt)}` : 'Return filed with court'} action={w.status !== 'filed' && <Button size="sm" onClick={markFiled}>Mark filed</Button>} />
              </div>
            </div>

            <div className="card">
              <div className="card-head"><BellRing size={16} color="var(--accent)" /><h3>Deadline & reminders</h3></div>
              <div className="card-body col" style={{ gap: 8 }}>
                <div className="small">Due <b>{formatDate(w.returnDueDate, 'dddd, MMMM D, YYYY')}</b>{w.dueRule && <span className="muted"> · {w.dueRule}</span>}</div>
                {w.snoozeUntil && daysUntil(w.snoozeUntil) >= 0 && <div className="badge">Snoozed until {formatDate(w.snoozeUntil, fmt)}</div>}
                <div className="row wrap" style={{ marginTop: 4 }}>
                  <Button size="sm" icon={<CalendarClock size={14} />} onClick={() => setExtend(true)} disabled={w.status === 'filed'}>Change due date</Button>
                  <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => void api.exportIcs([w.id]).then((r) => result(r, 'Calendar file created'))}>Add to calendar</Button>
                  <Button size="sm" icon={<BellRing size={14} />} onClick={() => void api.sendReminderNow(w.id).then((r) => result(r, 'Reminder sent'))} disabled={w.status === 'filed'}>Remind now</Button>
                  <Button size="sm" icon={<BellOff size={14} />} onClick={snooze} disabled={w.status === 'filed'}>{w.snoozeUntil && daysUntil(w.snoozeUntil) >= 0 ? 'Resume' : 'Snooze'}</Button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><Package size={16} color="var(--accent)" /><h3>Export</h3></div>
              <div className="card-body col" style={{ gap: 8 }}>
                <Button icon={<FileText size={15} />} onClick={() => void api.caseSummaryPdf(w.id).then((r) => result(r, 'Case summary saved'))}>Case summary & chain of custody (PDF)</Button>
                <Button icon={<Package size={15} />} onClick={() => void api.casePacket(w.id).then((r) => result(r, 'Case packet saved'))}>Case packet (.zip of all documents)</Button>
                <div className="hr" style={{ margin: '6px 0' }} />
                {!trashed && <Button variant="danger" icon={<Trash2 size={15} />} onClick={trash}>Move to trash</Button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'documents' && <Documents w={w} atts={atts ?? []} />}
      {tab === 'activity' && <ActivityTab id={w.id} />}

      {wizard && <GenerateWizard warrant={w} kind={wizard} onClose={() => { setWizard(null); if (action) navigate(`/warrant/${w.id}`); }} />}
      {extend && <ExtendModal w={w} onClose={() => setExtend(false)} />}
      {amend && <AmendmentModal w={w} onClose={() => setAmend(false)} />}
    </div>
  );
}

function Stepper({ w }: { w: Warrant }) {
  const s = w.status;
  const st = (n: number) => (n === 0 ? 'done' : n === 1 ? (s !== 'pending' ? 'done' : 'cur') : s === 'filed' ? 'done' : s === 'executed' ? 'cur' : '');
  return (
    <div className="stepper" style={{ marginTop: 12, minWidth: 360 }}>
      <div className={`step ${st(0)}`}><span className="b">✓</span>Signed</div>
      <div className={`step-line ${s !== 'pending' ? 'done' : ''}`} />
      <div className={`step ${st(1)}`}><span className="b">{s !== 'pending' ? '✓' : '2'}</span>Executed</div>
      <div className={`step-line ${s === 'filed' ? 'done' : ''}`} />
      <div className={`step ${st(2)}`}><span className="b">{s === 'filed' ? '✓' : '3'}</span>Return filed</div>
    </div>
  );
}

function Check({ done, label, action }: { done: boolean; label: string; action?: React.ReactNode }) {
  return (
    <div className="row">
      {done ? <CheckCircle2 size={18} color="var(--green)" /> : <Circle size={18} color="var(--muted)" />}
      <span className="grow" style={{ color: done ? 'var(--text)' : 'var(--text-2)' }}>{label}</span>
      {action}
    </div>
  );
}

function Overview({ w }: { w: Warrant }) {
  const { settings, toast } = useStore();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<WarrantInput>(w);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const fmt = settings!.app.dateFormat;
  useEffect(() => {
    if (!edit) setDraft(w);
  }, [w, edit]);

  const save = async () => {
    setSaving(true);
    const r = await api.updateWarrant(w.id, draft, reason.trim() || undefined);
    setSaving(false);
    if (r.ok) {
      toast('ok', 'Changes saved and logged');
      setEdit(false);
      setReason('');
    } else toast('err', r.error!);
  };

  if (edit) {
    return (
      <div className="card pad">
        <div className="row" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Edit warrant</h3>
          <div className="spacer" />
          <Button variant="ghost" icon={<X size={15} />} onClick={() => setEdit(false)}>Cancel</Button>
        </div>
        <WarrantForm value={draft} onChange={setDraft} compact />
        <div className="hr" />
        <div className="row">
          <Field label="Reason for change (optional, kept in the audit log)" className="grow"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected warrant number per signed copy" /></Field>
          <Button variant="primary" size="lg" busy={saving} icon={<Save size={16} />} onClick={save} style={{ alignSelf: 'flex-end' }}>Save changes</Button>
        </div>
      </div>
    );
  }

  const kv: [string, React.ReactNode][] = [
    ['Warrant #', <span className="mono">{w.warrantNumber || '-'}</span>],
    ['Case #', <span className="mono">{w.caseNumber || '-'}</span>],
    ['Target(s)', w.targets || '-'],
    ['Judge', w.judge || '-'],
    ['Court', w.court || settings?.profile.courtName || '-'],
    ...(w.provider ? [['Provider', w.provider] as [string, string]] : []),
    ['Signed', formatDate(w.signedDate, fmt)],
    ['Received', formatDate(w.receivedDate || w.signedDate, fmt)],
    ['Executed', w.executedDate ? formatDate(w.executedDate, fmt) : <span className="muted">Not yet</span>],
    ['Return due', <b>{formatDate(w.returnDueDate, fmt)}</b>],
    ['Notification', w.notificationRequired ? (w.notificationServedDate ? `Served ${formatDate(w.notificationServedDate, fmt)}` : <span style={{ color: 'var(--orange)' }}>Required - not served</span>) : 'Not required'],
    ...(w.investigationNature ? [['Investigation', w.investigationNature] as [string, string]] : []),
    ['Assigned to', w.assignedTo || '-'],
  ];
  const inventory = w.items.length ? w.items.map(formatItem).join('\n') : w.itemsText;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h3>Warrant details</h3>
          <div className="spacer" />
          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Button>
        </div>
        <div className="card-body kv">
          {kv.map(([k, v]) => [<div key={k + 'k'}>{k}</div>, <div key={k + 'v'}>{v}</div>])}
        </div>
      </div>
      <AmendmentsCard w={w} />
      <div className="card">
        <div className="card-head"><h3>Searched</h3></div>
        <div className="card-body pre">{w.locations || <span className="muted">Not entered yet - add it when generating the return.</span>}</div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Property taken</h3><span className="muted small">{w.items.length ? `${w.items.length} item(s)` : ''}</span></div>
        <div className="card-body pre">{inventory || <span className="muted">Not entered yet.</span>}</div>
      </div>
      {w.notes && (
        <div className="card">
          <div className="card-head"><h3>Notes</h3></div>
          <div className="card-body pre">{w.notes}</div>
        </div>
      )}
    </div>
  );
}

function Documents({ w, atts }: { w: Warrant; atts: Attachment[] }) {
  const { toast } = useStore();
  const [sel, setSel] = useState<Attachment | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [kind, setKind] = useState<AttachmentKind>('other');
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!sel && atts.length) setSel(atts.find((a) => a.kind === 'warrant') ?? atts[0]);
  }, [atts, sel]);
  useEffect(() => {
    setBytes(null);
    if (sel) void api.readAttachment(sel.id).then(setBytes);
  }, [sel]);

  const add = async (paths?: string[]) => {
    const r = await api.addAttachments(w.id, kind, paths);
    if (!r.canceled) toast(r.ok ? 'ok' : 'err', r.ok ? `Added ${r.data} file(s)` : r.error!);
  };
  const ext = sel?.originalName.split('.').pop()?.toLowerCase();

  return (
    <div className="grid" style={{ gridTemplateColumns: '420px minmax(0, 1fr)', alignItems: 'start' }}>
      <div className="col">
        <div
          className={`drop ${over ? 'over' : ''}`}
          style={{ padding: 18 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const paths = [...e.dataTransfer.files].map((f) => api.getPathForFile(f));
            if (paths.length) void add(paths);
          }}
        >
          <div className="row" style={{ justifyContent: 'center' }}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)} style={{ width: 210 }} onClick={(e) => e.stopPropagation()}>
              {ATTACHMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
            <Button icon={<Upload size={15} />} onClick={() => void add()}>Add files</Button>
          </div>
          <div className="muted tiny" style={{ marginTop: 8 }}>or drop files here · copies are stored and SHA-256 hashed</div>
        </div>
        <div className="card">
          {atts.length === 0 && <EmptyState icon={<Paperclip size={24} />} title="No documents yet" />}
          {atts.map((a) => (
            <div key={a.id} className="att" style={{ background: sel?.id === a.id ? 'var(--panel-2)' : undefined, cursor: 'pointer' }} onClick={() => setSel(a)}>
              <FileIcon name={a.originalName} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 600 }}>{a.originalName}</div>
                <div className="tiny muted">{ATTACHMENT_KINDS.find((k) => k.value === a.kind)?.label}{a.generated ? ` · generated from ${a.templateName}` : ''} · {fmtBytes(a.size)} · {new Date(a.addedAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {sel ? (
          <>
            <div className="card-head">
              <Eye size={16} />
              <div className="grow ellipsis" style={{ fontWeight: 650 }}>{sel.originalName}</div>
              <Button size="sm" icon={<ExternalLink size={14} />} onClick={() => void api.openAttachment(sel.id)} title="Opens a temporary copy so the stored original is never modified">Open</Button>
              <Button size="sm" icon={<Download size={14} />} onClick={() => void api.saveAttachmentAs(sel.id)}>Save as...</Button>
              <Button size="sm" icon={<ShieldCheck size={14} />} onClick={async () => {
                const r = await api.verifyAttachment(sel.id);
                toast(r.ok && r.data ? 'ok' : 'err', r.ok ? (r.data ? 'Integrity verified - file matches its original SHA-256 hash.' : 'INTEGRITY CHECK FAILED - the stored file does not match its hash.') : r.error!);
              }}>Verify</Button>
              <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} title="Remove" onClick={async () => {
                if (await confirmDialog({ title: 'Remove document?', body: <>Remove <b>{sel.originalName}</b> from this warrant? The removal is logged.</>, ok: 'Remove', danger: true })) {
                  await api.removeAttachment(sel.id);
                  setSel(null);
                }
              }} />
            </div>
            <div className="tiny muted mono" style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>SHA-256 {sel.sha256}</div>
            <div style={{ height: 'calc(100vh - 330px)', padding: 12 }}>
              {!bytes ? <div className="skeleton" style={{ height: '100%' }} />
                : ext === 'pdf' ? <PdfViewer bytes={bytes} />
                : ext === 'docx' ? <DocxViewer bytes={bytes} />
                : ['png', 'jpg', 'jpeg', 'gif'].includes(ext ?? '') ? <div className="viewer"><img src={URL.createObjectURL(new Blob([bytes.slice()]))} style={{ maxWidth: '100%' }} alt="" /></div>
                : <EmptyState icon={<FileText size={24} />} title="No preview for this file type">Use Open to view it in its default program.</EmptyState>}
            </div>
          </>
        ) : (
          <EmptyState icon={<Eye size={24} />} title="Select a document to preview" />
        )}
      </div>
    </div>
  );
}

function ActivityTab({ id }: { id: number }) {
  const { data } = useData(() => api.audit(id, 1000), [id]);
  const color: Record<string, string> = { create: 'var(--green)', generate: 'var(--accent)', 'due-date': 'var(--orange)', reminder: 'var(--blue)', trash: 'var(--red)', status: 'var(--violet)', verify: 'var(--green)' };
  return (
    <div className="card pad">
      <div className="muted small" style={{ marginBottom: 14 }}>Every change, document, reminder and export is recorded with the Windows user and time. This log cannot be edited from the app.</div>
      <div className="timeline">
        {(data ?? []).map((a) => {
          let changes: { field: string; from: string; to: string }[] = [];
          let sha = '';
          try {
            const d = a.details ? JSON.parse(a.details) : null;
            changes = d?.changes ?? [];
            sha = d?.sha256 ?? '';
          } catch { /* ignore */ }
          return (
            <div key={a.id} className="tl" style={{ ['--c' as string]: color[a.action] ?? 'var(--border-2)' }}>
              <div style={{ fontWeight: 600 }}>{a.summary}</div>
              {changes.length > 1 && (
                <div className="small muted" style={{ margin: '4px 0' }}>
                  {changes.map((c, i) => <div key={i}>{c.field}: <s>{c.from}</s> → {c.to}</div>)}
                </div>
              )}
              {sha && <div className="tiny muted mono" style={{ wordBreak: 'break-all' }}>SHA-256 {sha}</div>}
              <div className="when">{new Date(a.at).toLocaleString()} · {a.user} · {a.action}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExtendModal({ w, onClose }: { w: Warrant; onClose: () => void }) {
  const { toast } = useStore();
  const [date, setDate] = useState(w.returnDueDate);
  const [reason, setReason] = useState('');
  const save = async () => {
    const r = await api.extendDueDate(w.id, date, reason);
    if (r.ok) {
      toast('ok', 'Due date changed and logged. Reminders were reset for the new date.');
      onClose();
    } else toast('err', r.error!);
  };
  return (
    <Modal title="Change return due date" onClose={onClose} icon={<CalendarClock size={19} color="var(--accent)" />}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!reason.trim() || !date} onClick={save}>Save new due date</Button></>}>
      <div className="modal-body col">
        <div className="muted small">Current: <b>{formatDate(w.returnDueDate, 'dddd, MMMM D, YYYY')}</b></div>
        <div className="grid g2">
          <Field label="New due date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Quick set">
            <div className="row">
              {[7, 10, 30].map((n) => <Button key={n} size="sm" onClick={() => setDate(addDays(w.returnDueDate, n))}>+{n}d</Button>)}
            </div>
          </Field>
        </div>
        <Field label="Reason" required hint="Recorded in the audit log (e.g. extension granted by Judge Smith on 3/2)"><Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </div>
    </Modal>
  );
}
