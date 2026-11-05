import { useEffect, useMemo, useState } from 'react';
import { Upload, FileText, Sparkles, X, Save, AlertTriangle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useStore, useData } from '../lib/store';
import { Button, Field } from '../components/ui';
import { PdfViewer } from '../components/Viewers';
import { WarrantForm, emptyWarrant } from '../components/WarrantForm';
import { extractFromFile } from '../lib/extract';
import { pendingDrop } from '../App';
import { applyDueRule, isISODate } from '../../shared/dates';
import type { WarrantInput, WarrantListItem } from '../../shared/types';

export function NewWarrant() {
  const { settings, toast } = useStore();
  const [w, setW] = useState<WarrantInput>(() => {
    const e = emptyWarrant();
    const rule = settings?.dueRules[0];
    if (rule) {
      e.dueRule = rule.name;
      e.returnDueDate = applyDueRule(e.signedDate, rule, settings?.holidays);
    }
    e.assignedTo = '';
    return e;
  });
  const [file, setFile] = useState<{ path: string; name: string; bytes: Uint8Array } | null>(null);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [dups, setDups] = useState<WarrantListItem[]>([]);
  const { data: judges } = useData(async () => [...new Set((await api.listWarrants({ view: 'all' })).map((x) => x.judge).filter(Boolean))].sort(), []);

  const loadFile = async (path: string) => {
    const bytes = await api.readFileBytes(path);
    if (!bytes) {
      toast('err', 'Could not read that file.');
      return;
    }
    const name = path.split(/[\\/]/).pop() || 'warrant';
    setFile({ path, name, bytes });
    setReading(true);
    try {
      const { found } = await extractFromFile(bytes, name);
      const keys = new Set<string>();
      setW((cur) => {
        const next = { ...cur };
        for (const [k, v] of Object.entries(found)) {
          if (!v) continue;
          const key = k as keyof WarrantInput;
          if (key === 'signedDate') {
            if (isISODate(v)) {
              next.signedDate = v;
              next.receivedDate = v;
              const rule = settings?.dueRules.find((r) => r.name === next.dueRule);
              if (rule) next.returnDueDate = applyDueRule(v, rule, settings?.holidays);
              keys.add(k);
            }
          } else if (!String(cur[key] ?? '').trim()) {
            (next as Record<string, unknown>)[key] = v;
            keys.add(k);
          }
        }
        if (found.provider && next.warrantType === 'premises') {
          next.warrantType = 'provider';
          next.notificationRequired = true;
        }
        return next;
      });
      setSuggested(keys);
      if (keys.size) toast('info', `Read the document and pre-filled ${keys.size} field${keys.size > 1 ? 's' : ''} (marked in purple). Please verify each one.`);
    } finally {
      setReading(false);
    }
  };

  useEffect(() => {
    if (pendingDrop.path) {
      const p = pendingDrop.path;
      pendingDrop.path = null;
      void loadFile(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (w.warrantNumber.trim()) void api.findDuplicates(w.warrantNumber, w.caseNumber).then(setDups);
      else setDups([]);
    }, 350);
    return () => clearTimeout(t);
  }, [w.warrantNumber, w.caseNumber]);

  const valid = useMemo(() => (w.warrantNumber.trim() || w.caseNumber.trim()) && isISODate(w.signedDate) && isISODate(w.returnDueDate), [w]);

  const save = async (another = false) => {
    setSaving(true);
    const r = await api.createWarrant({ ...w, assignedTo: w.assignedTo || settings?.profile.fullName || '' }, file?.path ?? null);
    setSaving(false);
    if (!r.ok) {
      toast('err', r.error || 'Could not save');
      return;
    }
    toast('ok', `Warrant ${w.warrantNumber || w.caseNumber} added${file ? ' with the signed warrant attached' : ''}.`);
    if (another) navigate(`/new?n=${Date.now()}`);
    else navigate(`/warrant/${r.data}`);
  };

  const pick = async () => {
    const p = await api.pickFile([{ name: 'Warrant document', extensions: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'tif', 'tiff'] }]);
    if (p) void loadFile(p);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadFile(api.getPathForFile(f));
  };

  return (
    <div className="page" style={{ maxWidth: 1560 }}>
      <div className="page-head">
        <Button variant="ghost" iconOnly onClick={() => history.back()} icon={<ArrowLeft size={18} />} title="Back" />
        <div>
          <div className="eyebrow">Intake</div>
          <h1>Add search warrant</h1>
          <div className="sub">Drop the signed warrant to attach it (a hashed copy is stored with the case) and auto-detect its details.</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: file ? 'minmax(0, 1fr) minmax(0, 1fr)' : '360px minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="col" style={{ position: 'sticky', top: 0 }}>
          {!file ? (
            <div
              className={`drop ${over ? 'over' : ''}`}
              onClick={pick}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <div className="big-ico"><Upload size={26} /></div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Drop the signed warrant here</div>
              <div className="muted small" style={{ marginTop: 6 }}>or click to browse · PDF, DOCX, images</div>
              <div className="callout violet small" style={{ marginTop: 18, textAlign: 'left' }}>
                <Sparkles size={16} color="var(--violet)" style={{ flex: 'none' }} />
                <span>Text-based PDFs and Word files are scanned for the warrant #, case #, judge, signed date, provider and address. Scanned images are attached but can't be read.</span>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-head">
                <FileText size={16} />
                <div className="grow ellipsis" style={{ fontWeight: 650 }}>{file.name}</div>
                {reading && <span className="badge violet">Reading...</span>}
                <Button size="sm" variant="ghost" iconOnly icon={<X size={15} />} title="Remove file" onClick={() => { setFile(null); setSuggested(new Set()); }} />
              </div>
              <div style={{ height: 'calc(100vh - 230px)', padding: 10 }}>
                {/\.pdf$/i.test(file.name) ? (
                  <PdfViewer bytes={file.bytes} />
                ) : (
                  <div className="empty">This file type will be attached; preview it from the warrant's Documents tab.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card pad">
          <WarrantForm
            value={w}
            onChange={setW}
            suggested={suggested}
            dupWarning={
              dups.length ? (
                <div className="callout warn">
                  <AlertTriangle size={17} color="var(--orange)" style={{ flex: 'none' }} />
                  <div>
                    Warrant # <b className="mono">{w.warrantNumber}</b> already exists{' '}
                    {dups.map((d) => (
                      <a key={d.id} href={`#/warrant/${d.id}`} style={{ marginRight: 8 }}>(case {d.caseNumber}, {d.status})</a>
                    ))}
                  </div>
                </div>
              ) : null
            }
          />
          <datalist id="judge-list">{(judges ?? []).map((j) => <option key={j} value={j} />)}</datalist>
          <div className="hr" />
          <div className="row">
            <Field hint="Required: warrant # or case #, signed date, due date"><span /></Field>
            <div className="spacer" />
            <Button onClick={() => save(true)} disabled={!valid} busy={saving}>Save & add another</Button>
            <Button variant="primary" size="lg" onClick={() => save(false)} disabled={!valid} busy={saving} icon={<Save size={17} />}>Save warrant</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
