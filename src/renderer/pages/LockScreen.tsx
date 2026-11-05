import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { Button } from '../components/ui';
import appIcon from '../../../resources/icons/app.png';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { settings } = useStore();
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const waiting = waitUntil > now;

  const submit = async () => {
    if (waiting || !pin) return;
    if (await api.verifyPin(pin)) {
      onUnlock();
      return;
    }
    const n = tries + 1;
    setTries(n);
    setBad(true);
    setPin('');
    setTimeout(() => setBad(false), 400);
    if (n >= 5) setWaitUntil(Date.now() + Math.min(300, 15 * 2 ** (n - 5)) * 1000); // escalating back-off
  };

  return (
    <div className="lock">
      <div className="box col" style={{ alignItems: 'center', gap: 14 }}>
        <img src={appIcon} style={{ width: 72 }} alt="" />
        <h2 style={{ margin: 0 }}>Locked</h2>
        <div className="muted small">{[settings?.profile.title, settings?.profile.fullName].filter(Boolean).join(' ')} · {settings?.profile.agencyShortName || settings?.profile.agencyName}</div>
        <input
          ref={ref}
          className={`input pin ${bad ? 'shake invalid' : ''}`}
          type="password"
          inputMode="numeric"
          maxLength={12}
          placeholder="PIN"
          value={pin}
          disabled={waiting}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        {waiting ? <div className="small" style={{ color: 'var(--red)' }}>Too many attempts. Try again in {Math.ceil((waitUntil - now) / 1000)}s.</div> : tries > 0 ? <div className="small" style={{ color: 'var(--red)' }}>Incorrect PIN</div> : null}
        <Button variant="primary" size="lg" icon={<Lock size={16} />} style={{ width: '100%' }} onClick={() => void submit()} disabled={waiting}>Unlock</Button>
      </div>
    </div>
  );
}
