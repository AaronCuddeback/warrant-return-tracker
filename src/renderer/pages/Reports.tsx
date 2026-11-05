import { FileSpreadsheet, Printer, CalendarPlus, ScrollText, HardDriveDownload, HardDriveUpload, DatabaseBackup, History, Import, FolderOpen } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../lib/api';
import { useData, useStore } from '../lib/store';
import { Button, confirmDialog } from '../components/ui';
import { daysUntil, formatDate, todayISO } from '../../shared/dates';

export function ReportsPage() {
  const { toast, settings, info } = useStore();
  const { data: all } = useData(() => api.listWarrants({ view: 'all' }));
  const res = (r: { ok: boolean; error?: string; canceled?: boolean }, m: string) => !r.canceled && toast(r.ok ? 'ok' : 'err', r.ok ? m : r.error!);

  const metrics = useMemo(() => {
    const list = all ?? [];
    const filed = list.filter((w) => w.status === 'filed' && w.filedDate);
    const onTime = filed.filter((w) => w.filedDate! <= w.returnDueDate).length;
    const year = todayISO().slice(0, 4);
    const thisYear = list.filter((w) => w.signedDate.startsWith(year));
    const avg = filed.length ? Math.round(filed.reduce((s, w) => s + (daysUntil(w.filedDate!, w.signedDate) * -1), 0) / filed.length) : 0;
    const byJudge = new Map<string, number>();
    for (const w of thisYear) byJudge.set(w.judge || 'Unknown', (byJudge.get(w.judge || 'Unknown') ?? 0) + 1);
    const byProvider = new Map<string, number>();
    for (const w of thisYear) if (w.provider) byProvider.set(w.provider, (byProvider.get(w.provider) ?? 0) + 1);
    return {
      year, total: thisYear.length, filed: filed.length, onTimePct: filed.length ? Math.round((onTime / filed.length) * 100) : 100, avg: Math.abs(avg),
      judges: [...byJudge.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      providers: [...byProvider.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [all]);

  const max = Math.max(1, ...metrics.judges.map((j) => j[1]), ...metrics.providers.map((p) => p[1]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Output</div>
          <h1>Reports, export & backup</h1>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="kpi u-ok"><div className="v">{metrics.total}</div><div className="l">Warrants signed in {metrics.year}</div></div>
        <div className="kpi u-done"><div className="v">{metrics.filed}</div><div className="l">Returns filed (all time)</div></div>
        <div className={`kpi ${metrics.onTimePct < 100 ? 'u-critical' : 'u-done'}`}><div className="v">{metrics.onTimePct}%</div><div className="l">Filed on or before due date</div></div>
        <div className="kpi u-soon"><div className="v">{metrics.avg}</div><div className="l">Avg. days signed → filed</div></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 18 }}>
        <Bars title={`Warrants by judge (${metrics.year})`} rows={metrics.judges} max={max} />
        <Bars title={`Warrants by provider (${metrics.year})`} rows={metrics.providers} max={max} />
      </div>

      <div className="grid g3">
        <Tile icon={<Printer size={20} />} title="Docket report (PDF)" text="Printable list of every open warrant with deadlines and notice status - for supervisors or court liaison.">
          <Button onClick={() => void api.docketPdf({ view: 'active' })}>Open warrants</Button>
          <Button variant="ghost" onClick={() => void api.docketPdf({ view: 'all' })}>All</Button>
        </Tile>
        <Tile icon={<FileSpreadsheet size={20} />} title="Spreadsheet (CSV)" text="Every field for every warrant, ready for Excel or your RMS. Formula-injection safe.">
          <Button onClick={() => void api.exportCsv({ view: 'active' }).then((r) => res(r, 'CSV saved'))}>Open</Button>
          <Button variant="ghost" onClick={() => void api.exportCsv({ view: 'all' }).then((r) => res(r, 'CSV saved'))}>All</Button>
        </Tile>
        <Tile icon={<CalendarPlus size={20} />} title="Calendar (.ics)" text="All open due dates with reminder alarms. Opens in Outlook; import once or after adding warrants.">
          <Button onClick={() => void api.exportIcs('pending').then((r) => res(r, 'Calendar file created'))}>Export due dates</Button>
        </Tile>
        <Tile icon={<ScrollText size={20} />} title="Audit log (CSV)" text="Complete activity history: who changed what and when, documents generated with SHA-256 hashes.">
          <Button onClick={() => void api.auditCsv().then((r) => res(r, 'Audit log saved'))}>Export audit log</Button>
        </Tile>
        <Tile icon={<HardDriveDownload size={20} />} title="Full backup" text="One .wrtbackup file with all warrants, documents, templates and settings (passwords excluded).">
          <Button variant="primary" onClick={() => void api.exportFullBackup().then((r) => res(r, 'Backup saved'))}>Create backup</Button>
        </Tile>
        <Tile icon={<HardDriveUpload size={20} />} title="Restore backup" text="Replace current data with a .wrtbackup file. A safety snapshot is taken first.">
          <Button variant="danger" onClick={async () => {
            if (await confirmDialog({ title: 'Restore from backup?', body: 'All current warrants will be replaced with the contents of the backup file. A safety snapshot of your current data is saved first.', ok: 'Choose backup file...', danger: true })) {
              res(await api.restoreFullBackup(), 'Backup restored');
            }
          }}>Restore...</Button>
        </Tile>
        <Tile icon={<DatabaseBackup size={20} />} title="Automatic snapshots" text={`${settings?.backup.autoDaily ? `Daily, keeping ${settings.backup.keep}` : 'Off'}. Last: ${settings?.backup.lastBackupAt ? new Date(settings.backup.lastBackupAt).toLocaleString() : 'never'}.`}>
          <Button onClick={() => void api.backupNow().then((r) => res(r, 'Snapshot saved'))}>Snapshot now</Button>
          <Button variant="ghost" icon={<FolderOpen size={14} />} onClick={() => void api.openDataFolder()}>Data folder</Button>
        </Tile>
        <Tile icon={<Import size={20} />} title="Import from version 1" text={info?.v1DataFound ? 'Old Warrant Return Tracker data was found on this computer.' : 'Bring warrants over from the previous app (warrants.db). Duplicates are skipped.'}>
          <Button onClick={async () => {
            const r = await api.importV1(info?.v1DataFound ?? undefined);
            if (r.ok) toast('ok', `Imported ${r.data!.warrants} warrant(s) and ${r.data!.attachments} document(s)${r.data!.profile ? '; profile settings copied' : ''}.`);
            else if (!r.canceled) toast('err', r.error!);
          }}>{info?.v1DataFound ? 'Import now' : 'Choose warrants.db...'}</Button>
        </Tile>
        <Tile icon={<History size={20} />} title="Data location" text={info?.dataDir ?? ''}>
          <span className="small muted">{info?.portable ? 'Portable mode (data folder next to the EXE).' : `As of ${formatDate(todayISO(), 'MMM D, YYYY')}`}</span>
        </Tile>
      </div>
    </div>
  );
}

function Tile({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="card pad col" style={{ gap: 8 }}>
      <div className="row"><span style={{ color: 'var(--accent)' }}>{icon}</span><b>{title}</b></div>
      <div className="small muted" style={{ lineHeight: 1.5, flex: 1, wordBreak: 'break-word' }}>{text}</div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

function Bars({ title, rows, max }: { title: string; rows: [string, number][]; max: number }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body col" style={{ gap: 9 }}>
        {rows.length === 0 && <div className="muted small">No data yet.</div>}
        {rows.map(([k, v]) => (
          <div key={k} className="row small">
            <span className="ellipsis" style={{ width: 170 }}>{k}</span>
            <div style={{ flex: 1, height: 10, background: 'var(--panel-3)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', borderRadius: 6 }} />
            </div>
            <b style={{ width: 28, textAlign: 'right' }}>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
