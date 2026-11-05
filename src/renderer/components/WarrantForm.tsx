import { useMemo } from 'react';
import { Sparkles, Calculator } from 'lucide-react';
import { Field, Input, Select, Textarea, Toggle } from './ui';
import { useStore } from '../lib/store';
import { applyDueRule, formatDate, daysUntil, isISODate, relativeDays, todayISO } from '../../shared/dates';
import { WARRANT_TYPES, type WarrantInput, type WarrantType } from '../../shared/types';

export function emptyWarrant(): WarrantInput {
  const t = todayISO();
  return {
    caseNumber: '', warrantNumber: '', warrantType: 'premises', targets: '', judge: '', court: '',
    signedDate: t, receivedDate: t, executedDate: null, returnDueDate: t, dueRule: '',
    locations: '', provider: '', items: [], itemsText: '', investigationNature: '', notes: '', assignedTo: '', tags: '',
    status: 'pending', notificationRequired: false, notificationServedDate: null, filedDate: null, snoozeUntil: null,
  };
}

const ELECTRONIC: WarrantType[] = ['device', 'provider', 'tracking'];

export function WarrantForm({
  value, onChange, suggested = new Set(), dupWarning, compact,
}: {
  value: WarrantInput;
  onChange: (v: WarrantInput) => void;
  suggested?: Set<string>;
  dupWarning?: React.ReactNode;
  compact?: boolean;
}) {
  const { settings } = useStore();
  const rules = settings?.dueRules ?? [];
  const holidays = settings?.holidays ?? [];
  const set = <K extends keyof WarrantInput>(k: K, v: WarrantInput[K]) => {
    const next = { ...value, [k]: v };
    // keep due date in sync with the selected rule
    if ((k === 'signedDate' || k === 'dueRule') && isISODate(next.signedDate)) {
      const rule = rules.find((r) => r.name === next.dueRule);
      if (rule) next.returnDueDate = applyDueRule(next.signedDate, rule, holidays);
    }
    if (k === 'signedDate' && (!value.receivedDate || value.receivedDate === value.signedDate)) next.receivedDate = v as string;
    if (k === 'warrantType' && ELECTRONIC.includes(v as WarrantType) && !ELECTRONIC.includes(value.warrantType)) next.notificationRequired = true;
    onChange(next);
  };
  const sug = (k: string) => (suggested.has(k) ? 'suggest' : '');
  const SugIcon = ({ k }: { k: string }) => (suggested.has(k) ? <span title="Detected in the document - please verify" style={{ color: 'var(--violet)', display: 'inline-flex' }}><Sparkles size={12} /></span> : null);

  const dueInfo = useMemo(() => {
    if (!isISODate(value.returnDueDate)) return null;
    const d = daysUntil(value.returnDueDate);
    return `${formatDate(value.returnDueDate, 'dddd, MMMM D, YYYY')} - ${relativeDays(d)}`;
  }, [value.returnDueDate]);

  const isElectronic = ELECTRONIC.includes(value.warrantType);

  return (
    <div className="col" style={{ gap: 18 }}>
      <section>
        <div className="section-title">Identification</div>
        <div className="grid g2">
          <Field label={<>Search warrant # <SugIcon k="warrantNumber" /></>} required>
            <Input className={`mono ${sug('warrantNumber')}`} value={value.warrantNumber} onChange={(e) => set('warrantNumber', e.target.value)} placeholder="SW-2026-0001" autoFocus={!compact} />
          </Field>
          <Field label={<>Case / report # <SugIcon k="caseNumber" /></>}>
            <Input className={`mono ${sug('caseNumber')}`} value={value.caseNumber} onChange={(e) => set('caseNumber', e.target.value)} placeholder="26-012345" />
          </Field>
          {dupWarning && <div className="span-all">{dupWarning}</div>}
          <Field label="Warrant type">
            <Select value={value.warrantType} onChange={(e) => set('warrantType', e.target.value as WarrantType)}>
              {WARRANT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label={<>Target(s) / suspect(s) <SugIcon k="targets" /></>}>
            <Input className={sug('targets')} value={value.targets} onChange={(e) => set('targets', e.target.value)} placeholder="Last, First (DOB)" />
          </Field>
          <Field label={<>Issuing judge <SugIcon k="judge" /></>}>
            <Input className={sug('judge')} value={value.judge} onChange={(e) => set('judge', e.target.value)} placeholder="Hon. Jane Smith" list="judge-list" />
          </Field>
          {isElectronic ? (
            <Field label={<>Service provider <SugIcon k="provider" /></>}>
              <Input className={sug('provider')} value={value.provider} onChange={(e) => set('provider', e.target.value)} placeholder="Google LLC" list="provider-list" />
            </Field>
          ) : (
            <Field label="Court" hint={!value.court && settings?.profile.courtName ? `Default: ${settings.profile.courtName}` : undefined}>
              <Input value={value.court} onChange={(e) => set('court', e.target.value)} placeholder={settings?.profile.courtName || 'Superior Court'} />
            </Field>
          )}
        </div>
      </section>

      <section>
        <div className="section-title"><Calculator size={13} /> Dates & deadline</div>
        <div className="grid g3">
          <Field label={<>Signed / issued <SugIcon k="signedDate" /></>} required>
            <Input type="date" className={sug('signedDate')} value={value.signedDate} onChange={(e) => set('signedDate', e.target.value)} max="2100-12-31" />
          </Field>
          <Field label="Received by you" hint="Printed in the return">
            <Input type="date" value={value.receivedDate ?? ''} onChange={(e) => set('receivedDate', e.target.value || null)} />
          </Field>
          <Field label="Executed / searched" hint="Leave blank until served">
            <Input type="date" value={value.executedDate ?? ''} onChange={(e) => set('executedDate', e.target.value || null)} />
          </Field>
          <Field label="Due-date rule">
            <Select value={rules.some((r) => r.name === value.dueRule) ? value.dueRule : ''} onChange={(e) => set('dueRule', e.target.value)}>
              <option value="">Custom date</option>
              {rules.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Return due" required className="span2" hint={dueInfo}>
            <Input type="date" value={value.returnDueDate} onChange={(e) => onChange({ ...value, returnDueDate: e.target.value, dueRule: '' })} />
          </Field>
        </div>
      </section>

      <section>
        <div className="section-title">Scope</div>
        <div className="grid g2">
          <Field label={<>{isElectronic ? 'Accounts / devices / records' : 'Premises, vehicles, persons to be searched'} <SugIcon k="locations" /></>} className="span-all" hint="Printed in the return as the place searched. You can refine this when generating the return.">
            <Textarea className={sug('locations')} rows={3} value={value.locations} onChange={(e) => set('locations', e.target.value)} placeholder={isElectronic ? 'Google account associated with example@gmail.com' : '123 Main Street, Placerville, CA, including all rooms, garages and outbuildings'} />
          </Field>
        </div>
      </section>

      <section>
        <div className="section-title">CalECPA notification</div>
        <div className="col">
          <Toggle checked={value.notificationRequired} onChange={(v) => set('notificationRequired', v)} label="Contemporaneous notice required (Pen. Code 1546.2)" />
          {value.notificationRequired && (
            <div className="grid g3">
              <Field label="Nature of the investigation" className="span2" hint="Used in the notification document">
                <Input value={value.investigationNature} onChange={(e) => set('investigationNature', e.target.value)} placeholder="possession of controlled substances for sale (H&S 11351)" />
              </Field>
              <Field label="Notice served on">
                <Input type="date" value={value.notificationServedDate ?? ''} onChange={(e) => set('notificationServedDate', e.target.value || null)} />
              </Field>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="section-title">Organization</div>
        <div className="grid g3">
          <Field label="Assigned to"><Input value={value.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} placeholder={settings?.profile.fullName} /></Field>
          <Field label="Tags" hint="Comma separated" className="span2"><Input value={value.tags} onChange={(e) => set('tags', e.target.value)} placeholder="ICAC, homicide, task force" /></Field>
          <Field label="Notes" className="span-all"><Textarea rows={compact ? 2 : 3} value={value.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      </section>

      <datalist id="provider-list">
        {['Google LLC', 'Apple Inc.', 'Meta Platforms, Inc.', 'Snap Inc.', 'Microsoft Corporation', 'Verizon', 'AT&T', 'T-Mobile', 'Dropbox, Inc.', 'Yahoo Inc.', 'TikTok Inc.', 'Discord Inc.', 'X Corp.', 'Amazon.com, Inc.', 'Uber Technologies'].map((p) => <option key={p} value={p} />)}
      </datalist>
    </div>
  );
}
