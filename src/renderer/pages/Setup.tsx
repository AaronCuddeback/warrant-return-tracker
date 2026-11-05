import { useState } from 'react';
import { ChevronRight, ChevronLeft, Import, ShieldCheck, Bell, FileCog, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { Button, Toggle } from '../components/ui';
import { ProfileFields } from './Settings';
import appIcon from '../../../resources/icons/app.png';
import type { Settings } from '../../shared/types';

export function Setup() {
  const { settings, saveSettings, info, toast, reloadSettings } = useStore();
  const [s, setS] = useState<Settings>(settings!);
  const [step, setStep] = useState(0);
  const [imported, setImported] = useState<string | null>(null);
  const up = (fn: (d: Settings) => void) => {
    const next = structuredClone(s);
    fn(next);
    setS(next);
  };

  const importV1 = async () => {
    const r = await api.importV1(info?.v1DataFound ?? undefined);
    if (r.ok) {
      setImported(`Imported ${r.data!.warrants} warrant(s) and ${r.data!.attachments} document(s).`);
      await reloadSettings();
      const fresh = await api.getSettings();
      setS((cur) => ({ ...cur, profile: { ...cur.profile, ...Object.fromEntries(Object.entries(fresh.profile).filter(([, v]) => v)) } }));
    } else if (!r.canceled) toast('err', r.error!);
  };

  const finish = async () => {
    const ok = await saveSettings({ ...s, setupComplete: true });
    if (ok) toast('ok', 'All set. Drop a signed warrant anywhere to add it.');
  };

  const canNext = step !== 1 || (s.profile.fullName.trim() && s.profile.agencyName.trim());

  return (
    <div className="setup">
      <div className="setup-card card" style={{ padding: 34 }}>
        <div className="row" style={{ gap: 18, marginBottom: 24 }}>
          <img src={appIcon} className="hero-ico" alt="" />
          <div>
            <div className="eyebrow">Step {step + 1} of 3</div>
            <h1 style={{ margin: 0, fontSize: 26 }}>{['Welcome to Warrant Return Tracker', 'Officer & agency', 'Reminders'][step]}</h1>
          </div>
        </div>

        {step === 0 && (
          <div className="col" style={{ gap: 16 }}>
            <div className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>Track every search warrant from signature to filed return. Get reminders before returns are due, and generate court-ready returns and notices from your agency's own Word templates.</div>
            <div className="grid g3">
              <Feature icon={<Bell size={20} />} title="Never miss a return" text="Reminders catch up even if the computer was off." />
              <Feature icon={<FileCog size={20} />} title="Your forms" text="Import any agency .docx and fill it automatically." />
              <Feature icon={<ShieldCheck size={20} />} title="Local & audited" text="Data stays on this PC. Documents are hashed and every change is logged." />
            </div>
            {(
              <div className="callout violet">
                <Import size={18} color="var(--violet)" style={{ flex: 'none' }} />
                <div className="grow">
                  <b>Upgrading from version 1?</b>
                  <div className="small muted">{info?.v1DataFound ? 'Data from the previous version was found on this computer.' : 'Choose your old warrants.db file (usually in %APPDATA%\\warrant-return-tracker).'}</div>
                  {imported && <div className="small" style={{ color: 'var(--green)', marginTop: 4 }}><Check size={13} /> {imported}</div>}
                </div>
                <Button onClick={importV1}>{info?.v1DataFound ? 'Import my data' : 'Choose file...'}</Button>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="col" style={{ gap: 14 }}>
            <div className="muted">These details fill in the officer and agency fields on every return and notice. You can change them later in Settings.</div>
            <ProfileFields s={s} up={up} />
          </div>
        )}

        {step === 2 && (
          <div className="col" style={{ gap: 14 }}>
            <div className="muted">How should the app remind you? You can add automatic email later in Settings.</div>
            <Toggle checked={s.notifications.methods.includes('desktop')} onChange={(v) => up((d) => { d.notifications.methods = v ? [...new Set([...d.notifications.methods, 'desktop' as const])] : d.notifications.methods.filter((m) => m !== 'desktop'); })} label="Windows notifications" />
            <Toggle checked={s.notifications.methods.includes('mailto')} onChange={(v) => up((d) => { d.notifications.methods = v ? [...new Set([...d.notifications.methods, 'mailto' as const])] : d.notifications.methods.filter((m) => m !== 'mailto'); })} label="Draft a reminder email in Outlook" />
            <Toggle checked={s.app.minimizeToTray} onChange={(v) => up((d) => { d.app.minimizeToTray = v; })} label="Keep running in the tray when closed" />
            <Toggle checked={s.app.startOnLogin} onChange={(v) => up((d) => { d.app.startOnLogin = v; })} label="Start when I sign in to Windows (recommended)" />
            <div className="muted small">Default reminders: 7, 3 and 1 day(s) before due, on the due date, and daily while overdue.</div>
          </div>
        )}

        <div className="row" style={{ marginTop: 28 }}>
          {step > 0 && <Button icon={<ChevronLeft size={16} />} onClick={() => setStep(step - 1)}>Back</Button>}
          <div className="spacer" />
          {step < 2 ? (
            <Button variant="primary" size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue <ChevronRight size={16} /></Button>
          ) : (
            <Button variant="primary" size="lg" onClick={finish}>Start tracking <ChevronRight size={16} /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card pad" style={{ background: 'var(--panel-2)' }}>
      <div style={{ color: 'var(--accent)', marginBottom: 8 }}>{icon}</div>
      <b>{title}</b>
      <div className="muted small" style={{ marginTop: 4, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}
