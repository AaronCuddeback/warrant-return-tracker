import { useMemo, useState } from 'react';
import { Plus, Search, FileSpreadsheet, Printer, Trash2, RotateCcw, ArrowUpDown, Paperclip, FileCheck2, Inbox, CalendarPlus } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useData, useStore } from '../lib/store';
import { Button, EmptyState, Input, Seg, StatusBadge, confirmDialog } from '../components/ui';
import { daysUntil, formatDate, relativeDays, urgencyOf } from '../../shared/dates';
import { WARRANT_TYPES, type WarrantFilter, type WarrantListItem } from '../../shared/types';

type View = WarrantFilter['view'];
type SortKey = 'due' | 'signed' | 'warrant' | 'case' | 'target' | 'judge' | 'created';

export function WarrantsPage({ view }: { view: View }) {
  const { settings, toast } = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: view === 'filed' ? 'created' : 'due', dir: view === 'filed' ? -1 : 1 });
  const [type, setType] = useState('');
  const { data: rows, loading } = useData(() => api.listWarrants({ view, search: q }), [view, q]);
  const { data: all } = useData(() => Promise.all([api.listWarrants({ view: 'active' }), api.listWarrants({ view: 'filed' }), api.listWarrants({ view: 'trash' })]));
  const fmt = settings!.app.dateFormat;

  const sorted = useMemo(() => {
    const list = (rows ?? []).filter((w) => !type || w.warrantType === type);
    const key = (w: WarrantListItem): string | number => {
      switch (sort.k) {
        case 'due': return w.returnDueDate;
        case 'signed': return w.signedDate;
        case 'warrant': return w.warrantNumber.toLowerCase();
        case 'case': return w.caseNumber.toLowerCase();
        case 'target': return w.targets.toLowerCase();
        case 'judge': return w.judge.toLowerCase();
        case 'created': return w.filedDate || w.createdAt;
      }
    };
    return [...list].sort((a, b) => (key(a) < key(b) ? -sort.dir : key(a) > key(b) ? sort.dir : 0));
  }, [rows, sort, type]);

  const th = (k: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      <span className="row" style={{ gap: 4 }}>{label}{sort.k === k && <ArrowUpDown size={11} />}</span>
    </th>
  );

  const views: { value: View; label: string; n?: number }[] = [
    { value: 'active', label: 'Open', n: all?.[0].length },
    { value: 'pending', label: 'Not executed' },
    { value: 'executed', label: 'Awaiting return' },
    { value: 'filed', label: 'Filed / archived', n: all?.[1].length },
    { value: 'trash', label: 'Trash', n: all?.[2].length },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Case load</div>
          <h1>Search warrants</h1>
        </div>
        <div className="spacer" />
        <Button icon={<CalendarPlus size={16} />} onClick={() => void api.exportIcs('pending')} title="Export all open due dates to Outlook / calendar">Calendar</Button>
        <Button icon={<FileSpreadsheet size={16} />} onClick={() => void api.exportCsv({ view, search: q })}>CSV</Button>
        <Button icon={<Printer size={16} />} onClick={() => void api.docketPdf({ view, search: q })}>Docket PDF</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>Add warrant</Button>
      </div>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg value={view} onChange={(v) => navigate(`/warrants?view=${v}`)} options={views} />
        <div className="spacer" />
        <select className="select" style={{ width: 220 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All warrant types</option>
          {WARRANT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div style={{ position: 'relative', width: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--muted)' }} />
          <Input style={{ paddingLeft: 34 }} placeholder="Filter by #, target, judge, provider, tag..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {view === 'trash' && sorted.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 12 }}>
          <Trash2 size={17} color="var(--orange)" style={{ flex: 'none' }} />
          Items in the trash keep their documents and history until permanently deleted. Permanent deletion is recorded in the audit log.
        </div>
      )}

      {loading && !rows ? (
        <div className="col">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 46 }} />)}</div>
      ) : sorted.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Inbox size={26} />} title={q ? 'No matches' : view === 'filed' ? 'No filed returns yet' : view === 'trash' ? 'Trash is empty' : 'No warrants here'}>
            {q ? 'Try a different search term.' : view === 'active' ? 'Add a warrant or drop a signed warrant PDF anywhere in this window.' : null}
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th style={{ width: 6, padding: 0 }} />
                {th('due', view === 'filed' ? 'Due' : 'Deadline')}
                {th('warrant', 'Warrant #')}
                {th('case', 'Case #')}
                {th('target', 'Target(s)')}
                <th>Type</th>
                {th('judge', 'Judge')}
                {th('signed', 'Signed')}
                <th>Status</th>
                <th style={{ width: 70 }} />
                {view === 'trash' && <th />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const d = daysUntil(w.returnDueDate);
                const u = urgencyOf(d, w.status === 'filed');
                return (
                  <tr key={w.id} className={`u-${u}`} onClick={() => navigate(`/warrant/${w.id}`)}>
                    <td className="urg" />
                    <td className="nowrap">
                      <div className="strong" style={{ color: 'var(--u)' }}>{w.status === 'filed' ? `Filed ${formatDate(w.filedDate, fmt)}` : relativeDays(d)}</div>
                      <div className="muted tiny">{formatDate(w.returnDueDate, fmt)}</div>
                    </td>
                    <td className="mono strong">{w.warrantNumber || '-'}</td>
                    <td className="mono">{w.caseNumber || '-'}</td>
                    <td style={{ maxWidth: 220 }}><div className="ellipsis">{w.targets || <span className="muted">-</span>}</div></td>
                    <td className="small muted">{w.provider || WARRANT_TYPES.find((t) => t.value === w.warrantType)?.label}</td>
                    <td className="small">{w.judge}</td>
                    <td className="small nowrap">{formatDate(w.signedDate, fmt)}</td>
                    <td><span className="row" style={{ gap: 5 }}><StatusBadge status={w.status} />{w.amendmentCount > 0 && <span className="badge orange" title={`${w.amendmentCount} amendment(s)`}>Amended</span>}</span></td>
                    <td className="nowrap muted">
                      <span className="row" style={{ gap: 8 }}>
                        {w.attachmentCount > 0 && <span title={`${w.attachmentCount} document(s)`} className="row tiny" style={{ gap: 2 }}><Paperclip size={13} />{w.attachmentCount}</span>}
                        {w.returnGenerated && <span title="Return generated"><FileCheck2 size={14} color="var(--green)" /></span>}
                      </span>
                    </td>
                    {view === 'trash' && (
                      <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => void api.restoreWarrant(w.id).then(() => toast('ok', 'Restored'))}>Restore</Button>{' '}
                        <Button size="sm" variant="danger" onClick={async () => {
                          const ok = await confirmDialog({ title: 'Delete permanently?', body: <>Warrant <b>{w.warrantNumber}</b> and all of its stored documents will be erased. This cannot be undone. A record of the deletion stays in the audit log.</>, ok: 'Delete permanently', danger: true });
                          if (ok) {
                            const r = await api.purgeWarrant(w.id);
                            toast(r.ok ? 'ok' : 'err', r.ok ? 'Permanently deleted' : r.error!);
                          }
                        }}>Delete</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted small" style={{ marginTop: 10 }}>{sorted.length} warrant{sorted.length === 1 ? '' : 's'}</div>
    </div>
  );
}
