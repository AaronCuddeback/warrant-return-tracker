import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, LayoutDashboard, CalendarDays, FileCog, BarChart3, Settings, Lock, FileText, Bell, Download, FileStack, Archive } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { daysUntil, relativeDays, urgencyOf } from '../../shared/dates';
import type { WarrantListItem } from '../../shared/types';

interface Cmd {
  id: string;
  group: string;
  label: ReactNode;
  sub?: string;
  icon: ReactNode;
  keywords: string;
  run: () => void;
  hint?: string;
}

export function CommandPalette({ onClose, onLock }: { onClose: () => void; onLock: () => void }) {
  const { toast, settings } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [ws, setWs] = useState<WarrantListItem[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    void api.listWarrants({ view: 'all' }).then(setWs);
  }, []);

  const cmds = useMemo<Cmd[]>(() => {
    const actions: Cmd[] = [
      { id: 'new', group: 'Actions', label: 'Add a new warrant', icon: <Plus size={16} />, keywords: 'new add create warrant intake', run: () => navigate('/new'), hint: 'Ctrl N' },
      { id: 'dash', group: 'Go to', label: 'Dashboard', icon: <LayoutDashboard size={16} />, keywords: 'dashboard home', run: () => navigate('/dashboard') },
      { id: 'open', group: 'Go to', label: 'Open warrants', icon: <FileStack size={16} />, keywords: 'warrants open pending list', run: () => navigate('/warrants') },
      { id: 'filed', group: 'Go to', label: 'Filed / archived warrants', icon: <Archive size={16} />, keywords: 'archive archived filed returned', run: () => navigate('/warrants?view=filed') },
      { id: 'cal', group: 'Go to', label: 'Calendar', icon: <CalendarDays size={16} />, keywords: 'calendar month schedule', run: () => navigate('/calendar') },
      { id: 'tpl', group: 'Go to', label: 'Templates', icon: <FileCog size={16} />, keywords: 'template docx word form', run: () => navigate('/templates') },
      { id: 'rep', group: 'Go to', label: 'Reports & export', icon: <BarChart3 size={16} />, keywords: 'report export csv pdf docket backup', run: () => navigate('/reports') },
      { id: 'set', group: 'Go to', label: 'Settings', icon: <Settings size={16} />, keywords: 'settings preferences profile email smtp', run: () => navigate('/settings') },
      { id: 'check', group: 'Actions', label: 'Check due dates & send reminders now', icon: <Bell size={16} />, keywords: 'remind notify check', run: () => void api.runReminderCheck().then((r) => toast('ok', `Reminder check complete - ${r.data ?? 0} sent`)) },
      { id: 'docket', group: 'Actions', label: 'Print docket of open warrants (PDF)', icon: <FileText size={16} />, keywords: 'print docket pdf report', run: () => void api.docketPdf({ view: 'active' }) },
      { id: 'ics', group: 'Actions', label: 'Export all open due dates to calendar (.ics)', icon: <Download size={16} />, keywords: 'calendar outlook ics export', run: () => void api.exportIcs('pending') },
    ];
    if (settings?.app.hasPin) actions.push({ id: 'lock', group: 'Actions', label: 'Lock the app', icon: <Lock size={16} />, keywords: 'lock pin secure', run: onLock, hint: 'Ctrl L' });
    const warrants: Cmd[] = ws
      .filter((w) => !w.deletedAt)
      .map((w) => {
        const d = daysUntil(w.returnDueDate);
        const u = urgencyOf(d, w.status === 'filed');
        return {
          id: `w${w.id}`,
          group: 'Warrants',
          label: (
            <span className="row" style={{ gap: 8 }}>
              <span className={`dot u-${u}`} style={{ background: 'var(--u)' }} />
              <span className="mono">{w.warrantNumber || '(no #)'}</span>
              <span className="muted">Case {w.caseNumber}</span>
            </span>
          ),
          sub: `${w.targets || 'No target'} · ${w.status === 'filed' ? 'Filed' : relativeDays(d)}`,
          icon: <FileText size={16} />,
          keywords: `${w.warrantNumber} ${w.caseNumber} ${w.targets} ${w.judge} ${w.provider} ${w.locations} ${w.tags}`.toLowerCase(),
          run: () => navigate(`/warrant/${w.id}`),
        };
      });
    return [...actions, ...warrants];
  }, [ws, settings, toast, onLock]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const res = terms.length ? cmds.filter((c) => terms.every((t) => c.keywords.includes(t) || String(c.label).toLowerCase().includes(t))) : cmds.filter((c) => c.group !== 'Warrants').concat(cmds.filter((c) => c.group === 'Warrants').slice(0, 8));
    return res.slice(0, 60);
  }, [q, cmds]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.p-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette">
        <input
          ref={input}
          className="input"
          placeholder="Type a warrant #, case #, target, or command..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter') run(filtered[sel]);
          }}
        />
        <div className="p-list" ref={list}>
          {filtered.length === 0 && <div className="empty small">No matches</div>}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? <div className="p-group">{c.group}</div> : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head}
                <div className={`p-item ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                  {c.icon}
                  <div className="grow">
                    <div>{c.label}</div>
                    {c.sub && <div className="muted tiny">{c.sub}</div>}
                  </div>
                  {c.hint && <span className="kbd k">{c.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
