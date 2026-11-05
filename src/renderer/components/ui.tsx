import { useEffect, useRef, useState, type ReactNode, type ComponentProps, type ButtonHTMLAttributes } from 'react';
import { X, FileText, FileImage, File, FileType2, Loader2 } from 'lucide-react';
import { daysUntil, urgencyOf } from '../../shared/dates';
import type { Warrant, WarrantStatus } from '../../shared/types';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' | 'default'; size?: 'sm' | 'lg'; icon?: ReactNode; busy?: boolean; iconOnly?: boolean };
export function Button({ variant = 'default', size, icon, busy, iconOnly, children, className = '', ...rest }: BtnProps) {
  return (
    <button className={`btn ${variant !== 'default' ? variant : ''} ${size ?? ''} ${iconOnly ? 'icon' : ''} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Loader2 size={15} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function Field({ label, required, hint, error, children, className = '' }: { label?: ReactNode; required?: boolean; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = ({ className = '', ...p }: ComponentProps<'input'>) => <input className={`input ${className}`} {...p} />;
export const Textarea = ({ className = '', ...p }: ComponentProps<'textarea'>) => <textarea className={`textarea ${className}`} {...p} />;
export const Select = ({ className = '', children, ...p }: ComponentProps<'select'>) => (
  <select className={`select ${className}`} {...p}>
    {children}
  </select>
);

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; n?: number }[] }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.n !== undefined && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'mid'; icon?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon}
          <h2>{title}</h2>
          <div className="spacer" />
          <Button variant="ghost" iconOnly size="sm" onClick={onClose} aria-label="Close" icon={<X size={16} />} />
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Promise-based confirmation dialog. */
let confirmHost: ((o: ConfirmOpts) => Promise<string | boolean>) | null = null;
interface ConfirmOpts {
  title: string;
  body: ReactNode;
  ok?: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string; required?: boolean; type?: string; defaultValue?: string };
}
export function confirmDialog(o: ConfirmOpts): Promise<string | boolean> {
  return confirmHost ? confirmHost(o) : Promise.resolve(window.confirm(o.title));
}
export function ConfirmHost() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: string | boolean) => void }) | null>(null);
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    confirmHost = (o) => new Promise((resolve) => {
      setVal(o.input?.defaultValue ?? '');
      setState({ ...o, resolve });
    });
    return () => {
      confirmHost = null;
    };
  }, []);
  useEffect(() => {
    if (state?.input) setTimeout(() => inputRef.current?.focus(), 30);
  }, [state]);
  if (!state) return null;
  const close = (v: string | boolean) => {
    state.resolve(v);
    setState(null);
  };
  const okDisabled = !!state.input?.required && !val.trim();
  return (
    <Modal
      title={state.title}
      onClose={() => close(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button variant={state.danger ? 'danger' : 'primary'} className={state.danger ? 'solid' : ''} disabled={okDisabled} onClick={() => close(state.input ? val : true)}>
            {state.ok ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="modal-body col">
        <div style={{ lineHeight: 1.55 }}>{state.body}</div>
        {state.input && (
          <Field label={state.input.label} required={state.input.required}>
            <Input
              ref={inputRef}
              type={state.input.type ?? 'text'}
              value={val}
              placeholder={state.input.placeholder}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !okDisabled && close(val)}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function Countdown({ w, big }: { w: Pick<Warrant, 'returnDueDate' | 'status'>; big?: boolean }) {
  if (w.status === 'filed') {
    return (
      <div className={`cd u-done ${big ? 'big' : ''}`}>
        <span className="n">✓</span>
        <span className="t">Filed</span>
      </div>
    );
  }
  const d = daysUntil(w.returnDueDate);
  const u = urgencyOf(d);
  return (
    <div className={`cd u-${u} ${big ? 'big' : ''}`} title={d < 0 ? `${-d} days overdue` : `${d} days remaining`}>
      <span className="n">{d === 0 ? '0' : Math.abs(d)}</span>
      <span className="t">{d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Day left' : 'Days left'}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: WarrantStatus }) {
  const map = { pending: ['blue', 'Pending'], executed: ['violet', 'Executed'], filed: ['green', 'Filed'] } as const;
  const [c, l] = map[status];
  return <span className={`badge ${c}`}>{l}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <h3>{title}</h3>
      {children && <div style={{ maxWidth: 440, margin: '0 auto 14px', lineHeight: 1.5 }}>{children}</div>}
      {action}
    </div>
  );
}

export function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return <div className="fi pdf"><FileType2 size={19} /></div>;
  if (['doc', 'docx', 'rtf'].includes(ext)) return <div className="fi doc"><FileText size={19} /></div>;
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'heic'].includes(ext)) return <div className="fi img"><FileImage size={19} /></div>;
  return <div className="fi"><File size={19} /></div>;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
}
