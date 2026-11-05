import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useStore } from '../lib/store';

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'ok' ? <CheckCircle2 size={18} color="var(--green)" /> : t.kind === 'err' ? <AlertTriangle size={18} color="var(--red)" /> : <Info size={18} color="var(--blue)" />}
          <div className="msg">{t.text}</div>
          {t.action && (
            <button className="btn sm" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="btn ghost sm icon" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
