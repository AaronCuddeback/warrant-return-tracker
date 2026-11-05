import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useData, useStore } from '../lib/store';
import { Button, Toggle } from '../components/ui';
import { addDays, daysUntil, formatDate, toISO, todayISO, urgencyOf, isWeekend } from '../../shared/dates';

export function CalendarPage() {
  const { settings } = useStore();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [showFiled, setShowFiled] = useState(false);
  const { data } = useData(() => api.listWarrants({ view: 'all' }));
  const holidays = new Set(settings?.holidays ?? []);

  const days = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(toISO(start), i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>>();
    for (const w of data ?? []) {
      if (w.status === 'filed' && !showFiled) continue;
      const arr = m.get(w.returnDueDate) ?? [];
      arr.push(w);
      m.set(w.returnDueDate, arr);
    }
    return m;
  }, [data, showFiled]);

  const month = cursor.getMonth();
  const today = todayISO();
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Deadlines</div>
          <h1>{formatDate(toISO(cursor), 'MMMM YYYY')}</h1>
        </div>
        <div className="spacer" />
        <Toggle checked={showFiled} onChange={setShowFiled} label="Show filed" />
        <Button iconOnly icon={<ChevronLeft size={17} />} onClick={() => move(-1)} />
        <Button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
        <Button iconOnly icon={<ChevronRight size={17} />} onClick={() => move(1)} />
        <Button icon={<CalendarPlus size={16} />} onClick={() => void api.exportIcs('pending')}>Export to Outlook</Button>
      </div>
      <div className="cal">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="dow">{d}</div>)}
        {days.map((d) => {
          const inMonth = Number(d.slice(5, 7)) - 1 === month;
          const evs = byDay.get(d) ?? [];
          return (
            <div key={d} className={`day ${inMonth ? '' : 'other'} ${d === today ? 'today' : ''} ${isWeekend(d) ? 'weekend' : ''}`}>
              <div className="row" style={{ gap: 6 }}>
                <span className="dn">{Number(d.slice(8))}</span>
                {holidays.has(d) && <span className="holiday">Court holiday</span>}
              </div>
              {evs.map((w) => {
                const u = urgencyOf(daysUntil(w.returnDueDate), w.status === 'filed');
                return (
                  <div key={w.id} className={`ev u-${u}`} title={`${w.warrantNumber} · Case ${w.caseNumber} · ${w.targets}`} onClick={() => navigate(`/warrant/${w.id}`)}>
                    <span className="mono">{w.warrantNumber || w.caseNumber}</span> {w.targets}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="row small muted" style={{ marginTop: 12, gap: 16 }}>
        {[['overdue', 'Overdue'], ['critical', '1-3 days'], ['soon', '4-7 days'], ['ok', 'Later'], ['done', 'Filed']].map(([u, l]) => (
          <span key={u} className={`row u-${u}`} style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--u)' }} />{l}</span>
        ))}
        <span className="spacer" />
        <span>Next 7 days: {(data ?? []).filter((w) => w.status !== 'filed' && !w.deletedAt && daysUntil(w.returnDueDate) >= 0 && daysUntil(w.returnDueDate) <= 7).length} due</span>
      </div>
    </div>
  );
}
