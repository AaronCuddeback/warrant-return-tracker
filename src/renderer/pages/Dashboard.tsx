import { AlertOctagon, Clock3, CalendarRange, FolderOpen, CheckCircle2, Plus, FileOutput, Megaphone, Printer, Activity, ChevronRight, Siren } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useData, useStore } from '../lib/store';
import { Button, Countdown, EmptyState, StatusBadge } from '../components/ui';
import { daysUntil, formatDate, relativeDays, todayISO, urgencyOf, addDays } from '../../shared/dates';
import type { WarrantListItem } from '../../shared/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard() {
  const { settings } = useStore();
  const { data: stats } = useData(() => api.stats());
  const { data: open, loading } = useData(() => api.listWarrants({ view: 'active' }));
  const { data: activity } = useData(() => api.audit(null, 12));
  const p = settings!.profile;
  const fmt = settings!.app.dateFormat;

  const kpis = [
    { k: 'overdue', label: 'Overdue', v: stats?.overdue ?? 0, u: 'overdue', icon: <AlertOctagon size={20} />, to: '/warrants' },
    { k: 'soon', label: 'Due within 3 days', v: stats?.dueSoon ?? 0, u: 'critical', icon: <Clock3 size={20} />, to: '/warrants' },
    { k: 'week', label: 'Due this week', v: stats?.dueThisWeek ?? 0, u: 'soon', icon: <CalendarRange size={20} />, to: '/calendar' },
    { k: 'open', label: 'Open warrants', v: (stats?.pending ?? 0) + (stats?.executed ?? 0), u: 'ok', icon: <FolderOpen size={20} />, to: '/warrants' },
    { k: 'filed', label: 'Returns filed this month', v: stats?.filedThisMonth ?? 0, u: 'done', icon: <CheckCircle2 size={20} />, to: '/warrants?view=filed' },
  ];

  const upcoming = (open ?? []).slice(0, 12);
  const today = todayISO();
  const agenda: { date: string; items: WarrantListItem[] }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const items = (open ?? []).filter((w) => w.returnDueDate === d);
    if (items.length) agenda.push({ date: d, items });
  }
  const noticeOutstanding = (open ?? []).filter((w) => w.notificationRequired && w.executedDate && !w.notificationServedDate);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{formatDate(today, 'dddd, MMMM D, YYYY')}</div>
          <h1>{greeting()}{p.fullName ? `, ${p.title} ${p.fullName.split(' ').slice(-1)[0]}` : ''}</h1>
          <div className="sub">
            {stats ? (stats.overdue ? `${stats.overdue} return${stats.overdue > 1 ? 's are' : ' is'} overdue - start there.` : stats.dueSoon ? `${stats.dueSoon} return${stats.dueSoon > 1 ? 's' : ''} due in the next 3 days.` : 'Nothing urgent. All returns are on track.') : ' '}
          </div>
        </div>
        <div className="spacer" />
        <Button icon={<Printer size={16} />} onClick={() => void api.docketPdf({ view: 'active' })}>Print docket</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>Add warrant</Button>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <button key={k.k} className={`kpi u-${k.u} ${k.v > 0 && ['overdue', 'critical'].includes(k.u) ? 'hot' : ''}`} onClick={() => navigate(k.to)}>
            <span className="ic" style={{ color: 'var(--u)' }}>{k.icon}</span>
            <div className="v">{k.v}</div>
            <div className="l">{k.label}</div>
          </button>
        ))}
      </div>

      {noticeOutstanding.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 16 }}>
          <Megaphone size={18} color="var(--orange)" style={{ flex: 'none' }} />
          <div className="grow">
            <b>{noticeOutstanding.length} CalECPA notification{noticeOutstanding.length > 1 ? 's' : ''} not marked as served</b> for executed warrants:{' '}
            {noticeOutstanding.slice(0, 5).map((w) => <a key={w.id} href={`#/warrant/${w.id}`} className="mono" style={{ marginRight: 10 }}>{w.warrantNumber || w.caseNumber}</a>)}
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <Siren size={16} color="var(--accent)" />
            <h3>Action queue</h3>
            <span className="muted small">sorted by deadline</span>
            <div className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => navigate('/warrants')}>View all <ChevronRight size={14} /></Button>
          </div>
          {loading && !open ? (
            <div className="card-body col">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div>
          ) : upcoming.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={26} />} title="No open warrants" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/new')}>Add your first warrant</Button>}>
              Drop a signed warrant anywhere in this window to get started.
            </EmptyState>
          ) : (
            <div className="queue">
              {upcoming.map((w) => {
                const d = daysUntil(w.returnDueDate);
                return (
                  <div key={w.id} className={`qrow u-${urgencyOf(d)}`} onClick={() => navigate(`/warrant/${w.id}`)}>
                    <Countdown w={w} />
                    <div className="grow">
                      <div className="t1">
                        <span className="mono">{w.warrantNumber || '(no warrant #)'}</span>
                        <StatusBadge status={w.status} />
                        {w.notificationRequired && !w.notificationServedDate && <span className="badge orange">Notice</span>}
                        {w.snoozeUntil && daysUntil(w.snoozeUntil) >= 0 && <span className="badge">Snoozed</span>}
                      </div>
                      <div className="t2 ellipsis">
                        Case <span className="mono">{w.caseNumber || '-'}</span> · {w.targets || 'No target listed'} · {w.provider || w.judge || ''} · due {formatDate(w.returnDueDate, fmt)}
                      </div>
                    </div>
                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                      {w.status === 'pending' && <Button size="sm" onClick={() => void api.setStatus(w.id, 'executed')}>Mark executed</Button>}
                      <Button size="sm" variant="primary" icon={<FileOutput size={14} />} onClick={() => navigate(`/warrant/${w.id}?do=return`)}>Return</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><CalendarRange size={16} color="var(--accent)" /><h3>Next 14 days</h3></div>
            <div className="card-body col" style={{ gap: 12 }}>
              {agenda.length === 0 && <div className="muted small">No returns due in the next two weeks.</div>}
              {agenda.map((a) => {
                const d = daysUntil(a.date);
                return (
                  <div key={a.date} className={`u-${urgencyOf(d)}`}>
                    <div className="row small" style={{ fontWeight: 700, color: 'var(--u)' }}>
                      {formatDate(a.date, 'ddd, MMM D')} <span className="muted" style={{ fontWeight: 500 }}>· {relativeDays(d).replace('Due ', '')}</span>
                    </div>
                    {a.items.map((w) => (
                      <a key={w.id} href={`#/warrant/${w.id}`} className="row small" style={{ textDecoration: 'none', color: 'var(--text)', padding: '4px 0 0 12px' }}>
                        <span className="mono">{w.warrantNumber || w.caseNumber}</span>
                        <span className="muted ellipsis">{w.targets}</span>
                      </a>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><Activity size={16} color="var(--accent)" /><h3>Recent activity</h3></div>
            <div className="card-body">
              <div className="timeline">
                {(activity ?? []).map((a) => (
                  <div key={a.id} className="tl">
                    <div className="small">{a.warrantId ? <a href={`#/warrant/${a.warrantId}`} style={{ color: 'var(--text)' }}>{a.summary}</a> : a.summary}</div>
                    <div className="when">{new Date(a.at).toLocaleString()} · {a.user}</div>
                  </div>
                ))}
                {!activity?.length && <div className="muted small">Nothing yet.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
