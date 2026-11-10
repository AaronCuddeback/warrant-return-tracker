import { useEffect, useState, useCallback, useRef } from 'react';
import { clampUiScale, stepUiScale } from '../shared/types';
import { LayoutDashboard, FileStack, CalendarDays, FileCog, BarChart3, Settings as SettingsIcon, Plus, Search, Lock, Upload } from 'lucide-react';
import { StoreProvider, useStore, useData } from './lib/store';
import { useRoute, navigate } from './lib/router';
import { api } from './lib/api';
import { ConfirmHost, initials } from './components/ui';
import { Toasts } from './components/Toasts';
import { CommandPalette } from './components/CommandPalette';
import { Dashboard } from './pages/Dashboard';
import { WarrantsPage } from './pages/Warrants';
import { WarrantDetail } from './pages/WarrantDetail';
import { NewWarrant } from './pages/NewWarrant';
import { CalendarPage } from './pages/CalendarPage';
import { TemplatesPage } from './pages/Templates';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { Setup } from './pages/Setup';
import { LockScreen } from './pages/LockScreen';
import appIcon from '../../resources/icons/app.png';

export function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

/** Files dropped anywhere in the window start a new warrant. */
export const pendingDrop: { path: string | null } = { path: null };

function Root() {
  const { settings, reloadSettings } = useStore();
  const [locked, setLocked] = useState<boolean | null>(null);

  // Display size: Ctrl + / Ctrl - / Ctrl 0 (works on every screen, including setup and lock).
  const scaleRef = useRef(1);
  useEffect(() => {
    scaleRef.current = clampUiScale(settings?.app.uiScale);
  }, [settings]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const dir = e.key === '=' || e.key === '+' ? 1 : e.key === '-' || e.key === '_' ? -1 : e.key === '0' ? 0 : null;
      if (dir === null) return;
      e.preventDefault();
      const next = stepUiScale(scaleRef.current, dir);
      if (next === scaleRef.current) return;
      scaleRef.current = next;
      void api.setUiScale(next).then(() => reloadSettings());
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [reloadSettings]);

  useEffect(() => {
    if (!settings) return;
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = settings.app.theme === 'dark' || (settings.app.theme === 'system' && sys);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    void api.setTitleBarTheme(dark);
    if (locked === null) setLocked(settings.app.lockEnabled && settings.app.hasPin);
  }, [settings, locked]);

  useEffect(() => api.onLock(() => setLocked(true)), []);
  useEffect(() => api.onNavigate((r) => navigate(String(r))), []);

  if (!settings) return <div className="setup"><img src={appIcon} className="hero-ico" alt="" /></div>;
  if (!settings.setupComplete) return (<><Setup /><ConfirmHost /><Toasts /></>);
  return (
    <>
      <Shell onLock={() => setLocked(true)} />
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      <ConfirmHost />
      <Toasts />
    </>
  );
}

function Shell({ onLock }: { onLock: () => void }) {
  const route = useRoute();
  const { settings, logo, info } = useStore();
  const { data: stats } = useData(() => api.stats());
  const [palette, setPalette] = useState(false);
  const [dragging, setDragging] = useState(false);

  const lock = useCallback(() => {
    if (settings?.app.hasPin) onLock();
  }, [settings, onLock]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/new');
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [lock]);

  // Window-wide file drop -> new warrant (unless a page-level drop zone handles it)
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      pendingDrop.path = api.getPathForFile(f);
      navigate(`/new?drop=${Date.now()}`);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const top = route.path[0] ?? 'dashboard';
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, to: '/dashboard' },
    { id: 'warrants', label: 'Warrants', icon: <FileStack size={18} />, to: '/warrants', count: stats ? stats.pending + stats.executed : undefined, red: (stats?.overdue ?? 0) > 0 },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} />, to: '/calendar' },
    { id: 'templates', label: 'Templates', icon: <FileCog size={18} />, to: '/templates' },
    { id: 'reports', label: 'Reports & Export', icon: <BarChart3 size={18} />, to: '/reports' },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} />, to: '/settings' },
  ];
  const p = settings!.profile;

  let page;
  switch (top) {
    case 'warrants':
      page = <WarrantsPage view={(route.query.get('view') as never) || 'active'} />;
      break;
    case 'warrant':
      page = <WarrantDetail id={Number(route.path[1])} tab={route.path[2]} action={route.query.get('do')} />;
      break;
    case 'new':
      page = <NewWarrant key={route.raw} />;
      break;
    case 'calendar':
      page = <CalendarPage />;
      break;
    case 'templates':
      page = <TemplatesPage />;
      break;
    case 'reports':
      page = <ReportsPage />;
      break;
    case 'settings':
      page = <SettingsPage section={route.path[1]} />;
      break;
    default:
      page = <Dashboard />;
  }

  return (
    <div className="shell">
      <div className="titlebar">
        <div className="brand">
          <img src={appIcon} alt="" />
          <span>Warrant Return Tracker</span>
          {info?.portable && <span className="badge" title={info.dataDir}>Portable</span>}
        </div>
        <div className="searchbox" onClick={() => setPalette(true)} role="button" tabIndex={0}>
          <Search size={14} />
          <span className="grow">Search warrants, cases, targets, actions...</span>
          <span className="kbd">Ctrl K</span>
        </div>
        <div className="tb-actions">
          {settings?.app.hasPin && (
            <button className="btn ghost sm icon" title="Lock (Ctrl+L)" onClick={lock}>
              <Lock size={15} />
            </button>
          )}
        </div>
      </div>

      <aside className="sidebar">
        <button className="btn primary new-btn" onClick={() => navigate('/new')} title="Ctrl+N">
          <Plus size={17} /> Add Warrant
        </button>
        {nav.map((n) => (
          <button key={n.id} className={`nav-btn ${top === n.id || (n.id === 'warrants' && top === 'warrant') ? 'active' : ''}`} onClick={() => navigate(n.to)}>
            {n.icon}
            {n.label}
            {n.count !== undefined && n.count > 0 && <span className={`count ${n.red ? 'red' : ''}`}>{n.count}</span>}
          </button>
        ))}
        <div className="sidebar-foot">
          {logo ? <img src={logo} alt="" /> : <div className="avatar">{initials(p.fullName)}</div>}
          <div className="grow">
            <div className="ellipsis" style={{ fontWeight: 650 }}>{[p.title, p.fullName].filter(Boolean).join(' ')}</div>
            <div className="ellipsis muted tiny">{p.agencyShortName || p.agencyName}{p.badgeNumber ? ` · #${p.badgeNumber}` : ''}</div>
          </div>
        </div>
      </aside>

      <main className="main">{page}</main>
      {palette && <CommandPalette onClose={() => setPalette(false)} onLock={lock} />}
      {dragging && top !== 'new' && (
        <div className="drop over-window">
          <div className="col" style={{ alignItems: 'center' }}>
            <Upload size={42} />
            Drop the signed warrant to start a new entry
          </div>
        </div>
      )}
    </div>
  );
}
