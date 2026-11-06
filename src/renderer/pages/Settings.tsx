import { useEffect, useState } from 'react';
import { User, Bell, CalendarClock, FileOutput, ShieldCheck, Monitor, Database, Info, Plus, Trash2, Send, ImagePlus, KeyRound, FolderOpen, Save, PenLine } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Button, Field, Input, Select, Toggle, confirmDialog } from '../components/ui';
import { formatDate, isISODate } from '../../shared/dates';
import type { Settings, NotifyMethod } from '../../shared/types';

const SECTIONS = [
  { id: 'profile', label: 'Officer & agency', icon: <User size={16} /> },
  { id: 'signature', label: 'Signature', icon: <PenLine size={16} /> },
  { id: 'notifications', label: 'Reminders', icon: <Bell size={16} /> },
  { id: 'deadlines', label: 'Deadline rules', icon: <CalendarClock size={16} /> },
  { id: 'documents', label: 'Documents', icon: <FileOutput size={16} /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={16} /> },
  { id: 'app', label: 'Appearance & startup', icon: <Monitor size={16} /> },
  { id: 'data', label: 'Data & backup', icon: <Database size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

export function SettingsPage({ section = 'profile' }: { section?: string }) {
  const { settings, saveSettings, toast } = useStore();
  const [s, setS] = useState<Settings | null>(settings);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setS(settings);
  }, [settings, dirty]);
  if (!s) return null;

  const up = (fn: (d: Settings) => void) => {
    const next = structuredClone(s);
    fn(next);
    setS(next);
    setDirty(true);
  };
  const save = async () => {
    if (await saveSettings(s)) {
      setDirty(false);
      toast('ok', 'Settings saved');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Configuration</div><h1>Settings</h1></div>
        <div className="spacer" />
        {dirty && <span className="badge orange">Unsaved changes</span>}
        <Button variant="primary" icon={<Save size={16} />} disabled={!dirty} onClick={save}>Save settings</Button>
      </div>
      <div className="settings-layout">
        <div className="settings-nav">
          {SECTIONS.map((x) => (
            <button key={x.id} className={`nav-btn ${section === x.id ? 'active' : ''}`} onClick={() => navigate(`/settings/${x.id}`)}>{x.icon}{x.label}</button>
          ))}
        </div>
        <div className="card pad" style={{ minHeight: 400 }}>
          {section === 'profile' && <ProfileSection s={s} up={up} />}
          {section === 'signature' && <SignatureSection s={s} up={up} />}
          {section === 'notifications' && <NotifySection s={s} up={up} dirty={dirty} save={save} />}
          {section === 'deadlines' && <DeadlineSection s={s} up={up} />}
          {section === 'documents' && <DocsSection s={s} up={up} />}
          {section === 'security' && <SecuritySection s={s} up={up} />}
          {section === 'app' && <AppSection s={s} up={up} />}
          {section === 'data' && <DataSection s={s} up={up} />}
          {section === 'about' && <About />}
        </div>
      </div>
    </div>
  );
}

type SecProps = { s: Settings; up: (fn: (d: Settings) => void) => void };

export function ProfileFields({ s, up }: SecProps) {
  const p = s.profile;
  const set = (k: keyof Settings['profile']) => (e: React.ChangeEvent<HTMLInputElement>) => up((d) => { d.profile[k] = e.target.value; });
  return (
    <div className="grid g3">
      <Field label="Title / rank"><Input value={p.title} onChange={set('title')} placeholder="Detective" list="titles" /></Field>
      <Field label="Full name" required><Input value={p.fullName} onChange={set('fullName')} placeholder="Jane Doe" /></Field>
      <Field label="Badge / ID #"><Input className="mono" value={p.badgeNumber} onChange={set('badgeNumber')} placeholder="K1234" /></Field>
      <Field label="Phone"><Input value={p.phone} onChange={set('phone')} placeholder="(530) 555-0100" /></Field>
      <Field label="Email" className="span2"><Input type="email" value={p.email} onChange={set('email')} placeholder="name@agency.gov" /></Field>
      <Field label="Agency name" required className="span2"><Input value={p.agencyName} onChange={set('agencyName')} placeholder="County Sheriff's Office" /></Field>
      <Field label="Short name"><Input value={p.agencyShortName} onChange={set('agencyShortName')} placeholder="CSO" /></Field>
      <Field label="Unit / division"><Input value={p.unit} onChange={set('unit')} placeholder="High Tech Unit" /></Field>
      <Field label="County" hint="Printed as 'COUNTY OF ...'"><Input value={p.county} onChange={set('county')} placeholder="El Dorado" /></Field>
      <Field label="State"><Input value={p.state} onChange={set('state')} placeholder="California" /></Field>
      <Field label="Court name" className="span-all" hint="Default issuing court"><Input value={p.courtName} onChange={set('courtName')} placeholder="Superior Court of California, County of ..." /></Field>
      <datalist id="titles">{['Detective', 'Deputy', 'Officer', 'Sergeant', 'Investigator', 'Special Agent', 'Agent', 'Trooper', 'Corporal', 'Lieutenant'].map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

function ProfileSection(props: SecProps) {
  const { logo, reloadLogo, toast } = useStore();
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Officer & agency</h3><div className="muted small">Fills the officer and agency fields in every template, so the same app works for any agency.</div></div>
      <ProfileFields {...props} />
      <div className="hr" />
      <div className="row">
        {logo ? <img src={logo} style={{ height: 64, borderRadius: 8, background: '#fff', padding: 4 }} alt="" /> : <div className="avatar" style={{ width: 64, height: 64 }}><ImagePlus size={22} /></div>}
        <div className="grow"><b>Agency logo</b><div className="muted small">Shown in the sidebar and on PDF reports.</div></div>
        <Button icon={<ImagePlus size={15} />} onClick={async () => { const r = await api.setAgencyLogo(); if (r.ok) { reloadLogo(); toast('ok', 'Logo updated'); } else if (!r.canceled) toast('err', r.error!); }}>Choose image...</Button>
      </div>
    </div>
  );
}

export function SignatureSection({ s, up }: SecProps) {
  const { toast, reloadSettings, version } = useStore();
  const [img, setImg] = useState<string | null>(null);
  const [pad, setPad] = useState(false);
  useEffect(() => {
    void api.getSignature().then(setImg);
  }, [version, s.signature.updatedAt]);
  const save = async (png: Uint8Array) => {
    const r = await api.setSignature(png);
    if (r.ok) {
      toast('ok', 'Signature saved. It will be placed on documents that have a signature line.');
      setPad(false);
      await reloadSettings();
      setImg(await api.getSignature());
    } else toast('err', r.error!);
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Signature</h3><div className="muted small">Draw or import your signature once. It is inserted wherever a template has a <span className="mono">{'{signature}'}</span> tag - the built-in Return of Search Warrant has one above the officer's signature line.</div></div>
      <div className="sig-show">
        {img ? <img src={img} alt="Your signature" /> : <span style={{ color: '#7b8496' }}>No signature saved - documents print with a blank line for a wet signature.</span>}
      </div>
      <div className="row wrap">
        <Button variant="primary" icon={<PenLine size={15} />} onClick={() => setPad(true)}>{img ? 'Replace signature' : 'Add signature'}</Button>
        {img && <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
          if (await confirmDialog({ title: 'Remove signature?', body: 'Documents will print with a blank signature line until you add a new one.', ok: 'Remove', danger: true })) {
            await api.setSignature(null);
            await reloadSettings();
            setImg(null);
            toast('ok', 'Signature removed');
          }
        }}>Remove</Button>}
        {img && s.signature.updatedAt && <span className="muted small">Saved {new Date(s.signature.updatedAt).toLocaleString()}</span>}
      </div>
      <div className="grid g2">
        <Field label={`Printed width: ${s.signature.widthInches.toFixed(2)} in`} hint="Height follows automatically. 1.75-2.25 in fits most signature lines.">
          <input type="range" min={1} max={3.5} step={0.05} value={s.signature.widthInches} onChange={(e) => up((d) => { d.signature.widthInches = Number(e.target.value); })} />
        </Field>
        <div className="col" style={{ justifyContent: 'flex-end' }}>
          <Toggle checked={s.signature.useByDefault} onChange={(v) => up((d) => { d.signature.useByDefault = v; })} label="Sign documents by default (you can switch it off per document)" />
        </div>
      </div>
      <div className="callout small"><ShieldCheck size={16} color="var(--blue)" style={{ flex: 'none' }} /><div>Stored encrypted with Windows DPAPI for your Windows account only. It is not included in full backups and cannot be used if the data folder is copied to another computer or user. Every document that is signed is recorded in the warrant's audit log.</div></div>
      {pad && <SignaturePad onClose={() => setPad(false)} onSave={save} />}
    </div>
  );
}

function NotifySection({ s, up, dirty, save }: SecProps & { dirty: boolean; save: () => Promise<void> }) {
  const { toast } = useStore();
  const [pw, setPw] = useState('');
  const n = s.notifications;
  const has = (m: NotifyMethod) => n.methods.includes(m);
  const toggle = (m: NotifyMethod, on: boolean) => up((d) => { d.notifications.methods = on ? [...new Set([...d.notifications.methods, m])] : d.notifications.methods.filter((x) => x !== m); });
  const [lead, setLead] = useState(n.leadTimes.join(', '));
  const res = (r: { ok: boolean; error?: string }, m: string) => toast(r.ok ? 'ok' : 'err', r.ok ? m : r.error!);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Reminders</h3><div className="muted small">The app checks every 30 minutes, at startup and when the computer wakes or unlocks. A missed reminder is sent as soon as the app runs again - none are skipped.</div></div>
      <div className="col">
        <Toggle checked={has('desktop')} onChange={(v) => toggle('desktop', v)} label={<><b>Windows notifications</b> <span className="muted small">- pop-up toasts while the app runs (it stays in the tray when closed)</span></>} />
        <Toggle checked={has('smtp')} onChange={(v) => toggle('smtp', v)} label={<><b>Automatic email (SMTP)</b> <span className="muted small">- sent directly; needs your mail server details</span></>} />
        <Toggle checked={has('mailto')} onChange={(v) => toggle('mailto', v)} label={<><b>Draft in my mail program</b> <span className="muted small">- opens a pre-filled Outlook message for you to send</span></>} />
      </div>
      <div className="row"><Button size="sm" onClick={() => void api.testDesktopNotification().then((r) => res(r, 'Test notification sent'))}>Test Windows notification</Button></div>
      <div className="grid g3">
        <Field label="Remind me (days before due)" hint="Comma separated. 0 = on the due date.">
          <Input value={lead} onChange={(e) => { setLead(e.target.value); const nums = e.target.value.split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < 366); up((d) => { d.notifications.leadTimes = [...new Set(nums)].sort((a, b) => b - a); }); }} />
        </Field>
        <Field label="Send reminders to" hint="Defaults to your profile email"><Input type="email" value={n.recipient} onChange={(e) => up((d) => { d.notifications.recipient = e.target.value; })} placeholder={s.profile.email} /></Field>
        <div className="col" style={{ justifyContent: 'flex-end' }}><Toggle checked={n.overdueDaily} onChange={(v) => up((d) => { d.notifications.overdueDaily = v; })} label="Daily alert while overdue" /></div>
      </div>

      {has('smtp') && (
        <>
          <div className="hr" />
          <h4 style={{ margin: 0 }}>Mail server (SMTP)</h4>
          <div className="grid g4">
            <Field label="Server" className="span2"><Input value={s.smtp.host} onChange={(e) => up((d) => { d.smtp.host = e.target.value; })} placeholder="smtp.office365.com" /></Field>
            <Field label="Port"><Input type="number" value={s.smtp.port} onChange={(e) => up((d) => { d.smtp.port = Number(e.target.value); })} /></Field>
            <Field label="Security">
              <Select value={s.smtp.security} onChange={(e) => up((d) => { d.smtp.security = e.target.value as Settings['smtp']['security']; })}>
                <option value="starttls">STARTTLS (587)</option>
                <option value="tls">TLS / SSL (465)</option>
                <option value="none">None (internal relay)</option>
              </Select>
            </Field>
            <Field label="Username" className="span2"><Input value={s.smtp.username} onChange={(e) => up((d) => { d.smtp.username = e.target.value; })} autoComplete="off" /></Field>
            <Field label="From address" className="span2"><Input value={s.smtp.from} onChange={(e) => up((d) => { d.smtp.from = e.target.value; })} placeholder={s.smtp.username} /></Field>
            <Field label="Password" className="span2" hint={s.smtp.hasPassword ? 'A password is saved (encrypted with Windows DPAPI). Enter a new one to replace it.' : 'Stored encrypted with Windows DPAPI - never in plain text.'}>
              <div className="row">
                <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder={s.smtp.hasPassword ? '••••••••' : ''} />
                <Button icon={<KeyRound size={14} />} disabled={!pw} onClick={async () => { const r = await api.setSmtpPassword(pw); res(r, 'Password saved securely'); if (r.ok) setPw(''); }}>Save</Button>
              </div>
            </Field>
            <div className="span2 col" style={{ justifyContent: 'flex-end' }}>
              <Toggle checked={s.smtp.allowSelfSigned} onChange={(v) => up((d) => { d.smtp.allowSelfSigned = v; })} label={<span className="small">Allow self-signed certificate (internal servers only)</span>} />
            </div>
          </div>
          <div className="row">
            <Toggle checked={n.digestEnabled} onChange={(v) => up((d) => { d.notifications.digestEnabled = v; })} label="Send one daily summary email instead of one email per warrant, at" />
            <Select style={{ width: 110 }} value={n.digestHour} onChange={(e) => up((d) => { d.notifications.digestHour = Number(e.target.value); })} disabled={!n.digestEnabled}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`}</option>)}
            </Select>
          </div>
          <div className="row">
            <Button icon={<Send size={15} />} onClick={async () => { if (dirty) await save(); res(await api.sendTestEmail(), 'Test email sent - check your inbox'); }}>Save & send test email</Button>
            <span className="muted small">Ask IT for the SMTP relay used by scanners/copiers if you are unsure.</span>
          </div>
        </>
      )}
    </div>
  );
}

function DeadlineSection({ s, up }: SecProps) {
  const [hol, setHol] = useState('');
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Deadline rules</h3><div className="muted small">Rules appear in the "Due-date rule" menu when adding a warrant. Court-day rules skip weekends and the holidays below.</div></div>
      <div className="col">
        {s.dueRules.map((r, i) => (
          <div key={r.id} className="row">
            <Input value={r.name} onChange={(e) => up((d) => { d.dueRules[i].name = e.target.value; })} style={{ flex: 2 }} />
            <Input type="number" min={0} value={r.days} onChange={(e) => up((d) => { d.dueRules[i].days = Math.max(0, Number(e.target.value)); })} style={{ width: 90 }} />
            <Select value={r.dayType} onChange={(e) => up((d) => { d.dueRules[i].dayType = e.target.value as 'calendar' | 'court'; })} style={{ width: 160 }}>
              <option value="calendar">calendar days</option>
              <option value="court">court days</option>
            </Select>
            <Button variant="ghost" iconOnly icon={<Trash2 size={15} />} onClick={() => up((d) => { d.dueRules.splice(i, 1); })} disabled={s.dueRules.length <= 1} />
          </div>
        ))}
        <div><Button size="sm" icon={<Plus size={14} />} onClick={() => up((d) => { d.dueRules.push({ id: `r${Date.now()}`, name: 'New rule', days: 10, dayType: 'calendar' }); })}>Add rule</Button></div>
        <div className="muted tiny">The first rule is pre-selected for new warrants. Verify rules against your jurisdiction's statutes and local court rules.</div>
      </div>
      <div className="hr" />
      <h4 style={{ margin: 0 }}>Court holidays</h4>
      <div className="row">
        <Input type="date" value={hol} onChange={(e) => setHol(e.target.value)} style={{ width: 200 }} />
        <Button size="sm" icon={<Plus size={14} />} disabled={!isISODate(hol)} onClick={() => { up((d) => { d.holidays = [...new Set([...d.holidays, hol])].sort(); }); setHol(''); }}>Add holiday</Button>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {s.holidays.length === 0 && <span className="muted small">No holidays entered.</span>}
        {s.holidays.map((h) => (
          <span key={h} className="badge">{formatDate(h, 'ddd MMM D, YYYY')} <button className="btn ghost sm icon" style={{ height: 18, width: 18 }} onClick={() => up((d) => { d.holidays = d.holidays.filter((x) => x !== h); })}><Trash2 size={11} /></button></span>
        ))}
      </div>
    </div>
  );
}

function DocsSection({ s, up }: SecProps) {
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Generated documents</h3></div>
      <Field label="Default save folder" hint="Leave empty to use Documents">
        <div className="row">
          <Input value={s.app.outputFolder} readOnly placeholder="Documents" />
          <Button icon={<FolderOpen size={15} />} onClick={async () => { const f = await api.chooseFolder(); if (f) up((d) => { d.app.outputFolder = f; }); }}>Choose...</Button>
          {s.app.outputFolder && <Button variant="ghost" onClick={() => up((d) => { d.app.outputFolder = ''; })}>Clear</Button>}
        </div>
      </Field>
      <Toggle checked={s.app.askWhereToSave} onChange={(v) => up((d) => { d.app.askWhereToSave = v; })} label="Ask where to save each document" />
      <Toggle checked={s.app.archiveOnReturn} onChange={(v) => up((d) => { d.app.archiveOnReturn = v; })} label="When a return is generated, mark the warrant filed and archive it (can be changed per return)" />
      <div className="callout small"><Info size={16} color="var(--blue)" style={{ flex: 'none' }} />Every generated document is also stored inside the app with its SHA-256 hash, so you can always re-download the exact version that was produced.</div>
    </div>
  );
}

function SecuritySection({ s, up }: SecProps) {
  const { toast, reloadSettings } = useStore();
  const setPin = async () => {
    const pin = await confirmDialog({ title: s.app.hasPin ? 'Change PIN' : 'Set a PIN', body: 'Use 4-12 digits. The PIN is stored as a salted scrypt hash - it cannot be recovered, only reset by someone with access to this Windows account.', ok: 'Continue', input: { label: 'New PIN', type: 'password', required: true } });
    if (typeof pin !== 'string') return;
    const again = await confirmDialog({ title: 'Confirm PIN', body: 'Enter the PIN again.', ok: 'Save PIN', input: { label: 'PIN', type: 'password', required: true } });
    if (again !== pin) {
      if (typeof again === 'string') toast('err', 'PINs did not match.');
      return;
    }
    const r = await api.setPin(pin);
    toast(r.ok ? 'ok' : 'err', r.ok ? 'PIN saved' : r.error!);
    await reloadSettings();
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>Security</h3><div className="muted small">Protects case information on a shared or unattended workstation.</div></div>
      <div className="row">
        <Button icon={<KeyRound size={15} />} onClick={setPin}>{s.app.hasPin ? 'Change PIN' : 'Set PIN'}</Button>
        {s.app.hasPin && <Button variant="danger" onClick={async () => { await api.setPin(null); await reloadSettings(); toast('ok', 'PIN removed'); }}>Remove PIN</Button>}
      </div>
      <Toggle disabled={!s.app.hasPin} checked={s.app.lockEnabled} onChange={(v) => up((d) => { d.app.lockEnabled = v; })} label="Require PIN at startup and lock automatically" />
      <Field label="Auto-lock after inactivity (minutes)" hint="The app also locks whenever Windows is locked (Win+L).">
        <Input type="number" min={1} max={240} style={{ width: 120 }} value={s.app.lockMinutes} disabled={!s.app.lockEnabled} onChange={(e) => up((d) => { d.app.lockMinutes = Math.max(1, Number(e.target.value)); })} />
      </Field>
      <div className="callout small"><ShieldCheck size={16} color="var(--blue)" style={{ flex: 'none' }} /><div>Data stays on this computer - the app makes no network connections except to your own mail server for email reminders. The SMTP password is encrypted with Windows DPAPI. Every change is written to a tamper-evident audit trail with the Windows username.</div></div>
    </div>
  );
}

function AppSection({ s, up }: SecProps) {
  return (
    <div className="col" style={{ gap: 18 }}>
      <h3 style={{ margin: 0 }}>Appearance & startup</h3>
      <Field label="Theme">
        <Select value={s.app.theme} onChange={(e) => up((d) => { d.app.theme = e.target.value as Settings['app']['theme']; })} style={{ width: 220 }}>
          <option value="dark">Dark (night shift)</option>
          <option value="light">Light</option>
          <option value="system">Match Windows</option>
        </Select>
      </Field>
      <Field label="Date format">
        <Select value={s.app.dateFormat} onChange={(e) => up((d) => { d.app.dateFormat = e.target.value as Settings['app']['dateFormat']; })} style={{ width: 220 }}>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
        </Select>
      </Field>
      <Toggle checked={s.app.minimizeToTray} onChange={(v) => up((d) => { d.app.minimizeToTray = v; })} label="Keep running in the system tray when the window is closed (needed for reminders)" />
      <Toggle checked={s.app.startOnLogin} onChange={(v) => up((d) => { d.app.startOnLogin = v; })} label="Start automatically when I sign in to Windows" />
      <Toggle disabled={!s.app.minimizeToTray} checked={s.app.startMinimized} onChange={(v) => up((d) => { d.app.startMinimized = v; })} label="Start minimized to the tray" />
      <div className="muted small">Shortcuts: <span className="kbd">Ctrl K</span> search · <span className="kbd">Ctrl N</span> new warrant · <span className="kbd">Ctrl L</span> lock</div>
    </div>
  );
}

function DataSection({ s, up }: SecProps) {
  const { info } = useStore();
  return (
    <div className="col" style={{ gap: 18 }}>
      <h3 style={{ margin: 0 }}>Data & backup</h3>
      <Field label="Data folder" hint={info?.portable ? 'Portable mode: a "data" folder next to the EXE is used.' : 'Tip: create a folder named "data" next to the EXE to run in portable mode.'}>
        <div className="row"><Input readOnly value={info?.dataDir ?? ''} className="mono" /><Button icon={<FolderOpen size={15} />} onClick={() => void api.openDataFolder()}>Open</Button></div>
      </Field>
      <Toggle checked={s.backup.autoDaily} onChange={(v) => up((d) => { d.backup.autoDaily = v; })} label="Automatic daily database snapshot" />
      <div className="grid g3">
        <Field label="Snapshots to keep"><Input type="number" min={3} max={365} value={s.backup.keep} onChange={(e) => up((d) => { d.backup.keep = Math.max(3, Number(e.target.value)); })} /></Field>
        <Field label="Snapshot folder" className="span2" hint="e.g. a network share or encrypted drive. Empty = data folder\backups">
          <div className="row">
            <Input readOnly value={s.backup.folder} placeholder="(data folder)\backups" />
            <Button icon={<FolderOpen size={15} />} onClick={async () => { const f = await api.chooseFolder(); if (f) up((d) => { d.backup.folder = f; }); }}>Choose...</Button>
          </div>
        </Field>
      </div>
      <div className="row"><Button onClick={() => navigate('/reports')}>Full backup, restore & import from v1...</Button></div>
    </div>
  );
}

function About() {
  const { info } = useStore();
  return (
    <div className="col" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>Warrant Return Tracker {info?.version}</h3>
      <div className="muted">Tracks search warrants from signature to filed return, with deadline reminders and court-ready documents from your agency's own templates.</div>
      <div className="kv small">
        <div>Data folder</div><div className="mono">{info?.dataDir}</div>
        <div>Mode</div><div>{info?.portable ? 'Portable' : 'Installed (per-user)'}</div>
        <div>Windows user</div><div>{info?.user}</div>
        <div>Secure storage</div><div>{info?.encryptionAvailable ? 'Windows DPAPI available' : 'Unavailable'}</div>
      </div>
      <div className="muted small">Built with Electron, React and SQLite (WebAssembly). No telemetry, no auto-update, no cloud services. For official law enforcement use.</div>
    </div>
  );
}
