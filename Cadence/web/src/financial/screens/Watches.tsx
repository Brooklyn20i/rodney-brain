import { useMemo, useState } from 'react';
import { Card, Metric, ScreenHeader } from '../components/bits';
import { useCadenceFinancial } from '../lib/store';
import type { Watch, WatchCollectionRole, WatchFullSetStatus, WatchOwnershipStatus } from '../lib/types';
import { filterWatches, parseOptionalMoneyInput, summarizeWatches, watchPL, type WatchRoleFilter, type WatchStatusFilter } from '../lib/watchCalc';
import { formatMoney, formatPercent } from '../lib/util';

const ROLE_LABEL: Record<WatchCollectionRole, string> = {
  permanent: 'Permanent',
  rotation: 'Rotation',
  exit_trade: 'Exit & trade',
  future: 'Future',
};

const STATUS_LABEL: Record<WatchOwnershipStatus, string> = {
  owned: 'Owned',
  candidate: 'Candidate',
  traded: 'Traded',
  sold: 'Sold',
};

const FULL_SET_LABEL: Record<WatchFullSetStatus, string> = {
  full: 'Full set',
  partial: 'Partial set',
  none: 'No set',
  unknown: 'Full-set unknown',
};

const ROLES: WatchRoleFilter[] = ['all', 'permanent', 'rotation', 'exit_trade', 'future'];
const STATUSES: WatchStatusFilter[] = ['all', 'owned', 'candidate', 'traded', 'sold'];

const blankForm = {
  brand: '',
  model: '',
  reference: '',
  nickname: '',
  year: '',
  collection_role: 'rotation' as WatchCollectionRole,
  ownership_status: 'owned' as WatchOwnershipStatus,
  currency: 'AUD',
  purchase_price: '',
  purchase_date: '',
  current_value: '',
  value_as_of: '',
  valuation_source: '',
  insurance_value: '',
  full_set_status: 'unknown' as WatchFullSetStatus,
  accessories: '',
  material: '',
  dial: '',
  service_history: '',
  provenance: '',
  insurance_notes: '',
  storage_location: '',
  security_notes: '',
  notes: '',
  sentimental: false,
  external_ref: '',
};

type WatchFormState = typeof blankForm;

function numOrNull(value: string): number | null {
  return parseOptionalMoneyInput(value).value;
}

function intOrNull(value: string): number | null {
  const parsed = numOrNull(value);
  return parsed === null ? null : Math.round(parsed);
}

function textOrEmpty(value: string): string {
  return value.trim();
}

function notRecorded(value: string | number | null | undefined, formatter?: (v: number) => string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return formatter ? formatter(value) : String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return 'Not recorded';
}

function formFromWatch(watch: Watch): WatchFormState {
  return {
    brand: watch.brand,
    model: watch.model,
    reference: watch.reference,
    nickname: watch.nickname,
    year: watch.year === null ? '' : String(watch.year),
    collection_role: watch.collection_role,
    ownership_status: watch.ownership_status,
    currency: watch.currency,
    purchase_price: watch.purchase_price === null ? '' : String(watch.purchase_price),
    purchase_date: watch.purchase_date ?? '',
    current_value: watch.current_value === null ? '' : String(watch.current_value),
    value_as_of: watch.value_as_of ?? '',
    valuation_source: watch.valuation_source,
    insurance_value: watch.insurance_value === null ? '' : String(watch.insurance_value),
    full_set_status: watch.full_set_status,
    accessories: watch.accessories,
    material: watch.material,
    dial: watch.dial,
    service_history: watch.service_history,
    provenance: watch.provenance,
    insurance_notes: watch.insurance_notes,
    storage_location: watch.storage_location,
    security_notes: watch.security_notes,
    notes: watch.notes,
    sentimental: watch.sentimental,
    external_ref: watch.external_ref,
  };
}

function payloadFromForm(form: WatchFormState) {
  return {
    brand: textOrEmpty(form.brand),
    model: textOrEmpty(form.model),
    reference: textOrEmpty(form.reference),
    nickname: textOrEmpty(form.nickname),
    year: intOrNull(form.year),
    collection_role: form.collection_role,
    ownership_status: form.ownership_status,
    currency: textOrEmpty(form.currency).toUpperCase() || 'AUD',
    purchase_price: numOrNull(form.purchase_price),
    purchase_date: form.purchase_date || null,
    current_value: numOrNull(form.current_value),
    value_as_of: form.value_as_of || null,
    valuation_source: textOrEmpty(form.valuation_source),
    insurance_value: numOrNull(form.insurance_value),
    full_set_status: form.full_set_status,
    accessories: textOrEmpty(form.accessories),
    material: textOrEmpty(form.material),
    dial: textOrEmpty(form.dial),
    service_history: textOrEmpty(form.service_history),
    provenance: textOrEmpty(form.provenance),
    insurance_notes: textOrEmpty(form.insurance_notes),
    storage_location: textOrEmpty(form.storage_location),
    security_notes: textOrEmpty(form.security_notes),
    notes: textOrEmpty(form.notes),
    sentimental: form.sentimental,
    external_ref: textOrEmpty(form.external_ref),
  };
}

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatMoney(value, true)}`;
}

function invalidNonnegativeMoney(form: WatchFormState): string | null {
  for (const [field, label] of [
    ['purchase_price', 'Purchase price'],
    ['current_value', 'Current value'],
    ['insurance_value', 'Insurance value'],
  ] as const) {
    const parsed = parseOptionalMoneyInput(form[field]);
    if (!parsed.valid) return `${label} must be a number or blank.`;
    const value = parsed.value;
    if (value !== null && value < 0) return `${label} cannot be negative.`;
  }
  return null;
}

function WatchForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: WatchFormState;
  onCancel: () => void;
  onSave: (form: WatchFormState) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof WatchFormState>(key: K, value: WatchFormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setError(null);
    if (!form.brand.trim()) return setError('Brand is required.');
    if (!form.model.trim()) return setError('Model is required.');
    if (form.currency.trim().toUpperCase() !== 'AUD') return setError('Currency must be AUD until FX conversion is supported.');
    const parsedYear = parseOptionalMoneyInput(form.year);
    if (!parsedYear.valid || (parsedYear.value !== null && !Number.isInteger(parsedYear.value))) {
      return setError('Year must be a whole number or blank.');
    }
    if (parsedYear.value !== null && (parsedYear.value < 1800 || parsedYear.value > new Date().getFullYear() + 1)) {
      return setError('Year must be between 1800 and next year.');
    }
    const moneyError = invalidNonnegativeMoney(form);
    if (moneyError) return setError(moneyError);
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? `Save failed: ${e.message}` : 'Save failed.');
    }
  };

  const input = (key: keyof WatchFormState, label: string, type = 'text') => (
    <div className="form-group">
      <label className="field">{label}</label>
      <input type={type} value={String(form[key])} onChange={(e) => set(key, e.target.value as never)} />
    </div>
  );

  return (
    <Card title="Watch details">
      <div className="wizard-grid">
        {input('brand', 'Brand')}
        {input('model', 'Model')}
        {input('reference', 'Reference')}
        {input('nickname', 'Nickname')}
        {input('year', 'Year')}
        <div className="form-group">
          <label className="field">Collection role</label>
          <select value={form.collection_role} onChange={(e) => set('collection_role', e.target.value as WatchCollectionRole)}>
            {Object.entries(ROLE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="field">Ownership status</label>
          <select value={form.ownership_status} onChange={(e) => set('ownership_status', e.target.value as WatchOwnershipStatus)}>
            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="field">Currency</label>
          <select aria-label="Currency" value="AUD" disabled><option value="AUD">AUD</option></select>
        </div>
        {input('purchase_price', 'Purchase price')}
        {input('purchase_date', 'Purchase date', 'date')}
        {input('current_value', 'Current value')}
        {input('value_as_of', 'Valuation date', 'date')}
        {input('valuation_source', 'Valuation source')}
        {input('insurance_value', 'Insurance value')}
        {input('insurance_notes', 'Insurance notes')}
        <div className="form-group">
          <label className="field">Full set</label>
          <select value={form.full_set_status} onChange={(e) => set('full_set_status', e.target.value as WatchFullSetStatus)}>
            {Object.entries(FULL_SET_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {input('accessories', 'Accessories')}
        {input('material', 'Material')}
        {input('dial', 'Dial')}
        {input('service_history', 'Service history')}
        {input('provenance', 'Provenance')}
        {input('storage_location', 'Storage location')}
        {input('security_notes', 'Security notes')}
        {input('notes', 'Notes')}
        {input('external_ref', 'External reference')}
        <label className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <input type="checkbox" checked={form.sentimental} onChange={(e) => set('sentimental', e.target.checked)} style={{ width: 'auto' }} />
          <span className="field">Sentimental / coherence keeper</span>
        </label>
      </div>
      {error && <p className="inv-warning" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save watch'}</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}

function WatchCard({ watch, onEdit, onDelete }: { watch: Watch; onEdit: (watch: Watch) => void; onDelete: (watch: Watch) => void }) {
  const pl = watchPL(watch);
  const valueKnown = typeof watch.current_value === 'number';
  const context = [
    FULL_SET_LABEL[watch.full_set_status],
    watch.accessories ? 'Accessories logged' : 'Accessories not recorded',
    watch.service_history ? 'Service logged' : 'Service not recorded',
    typeof watch.insurance_value === 'number' ? 'Insurance value logged' : 'Insurance value not recorded',
    watch.storage_location ? 'Storage logged' : 'Storage not recorded',
    watch.security_notes ? 'Security notes logged' : 'Security notes not recorded',
    watch.sentimental ? 'Sentimental' : null,
  ].filter(Boolean);

  return (
    <article className="watch-card">
      <div className="watch-card-head">
        <div>
          <h3>{watch.brand} {watch.model}</h3>
          <p>{[watch.reference, watch.nickname].filter(Boolean).join(' · ') || 'No reference / nickname recorded'}</p>
        </div>
        <span className="grade-tag">{STATUS_LABEL[watch.ownership_status]} · {ROLE_LABEL[watch.collection_role]}</span>
      </div>
      <div className="watch-value-grid">
        <div>
          <span>Current value</span>
          <strong>{valueKnown ? formatMoney(watch.current_value!, true) : 'Not recorded'}</strong>
          <small>{watch.value_as_of ? `As of ${watch.value_as_of}` : 'As-of date not recorded'}</small>
        </div>
        <div>
          <span>Valuation source</span>
          <strong>{watch.valuation_source || 'Not recorded'}</strong>
          <small>Unknown values stay blank until evidenced</small>
        </div>
        <div>
          <span>Acquisition</span>
          <strong>{notRecorded(watch.purchase_price, (v) => formatMoney(v, true))}</strong>
          <small>{watch.purchase_date || 'Purchase date not recorded'}</small>
        </div>
        <div>
          <span>Unrealised P/L</span>
          {pl ? (
            <strong className={pl.amount >= 0 ? 'cf-tone-good' : 'cf-tone-bad'}>{signedMoney(pl.amount)}{pl.percent === null ? '' : ` / ${formatPercent(pl.percent)}`}</strong>
          ) : (
            <strong>Not recorded</strong>
          )}
          <small>{pl ? 'Purchase and current value known' : 'Needs both purchase and current values'}</small>
        </div>
      </div>
      <div className="watch-context-row">
        {context.map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="watch-notes">
        <div><strong>Provenance:</strong> {watch.provenance || 'Not recorded'}</div>
        <div><strong>Accessories:</strong> {watch.accessories || 'Not recorded'}</div>
        <div><strong>Insurance:</strong> {watch.insurance_notes || 'Not recorded'}</div>
        <div><strong>Storage:</strong> {watch.storage_location || 'Not recorded'}</div>
        <div><strong>Security:</strong> {watch.security_notes || 'Not recorded'}</div>
        {watch.notes && <div><strong>Notes:</strong> {watch.notes}</div>}
      </div>
      <div className="watch-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(watch)}>Edit</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onDelete(watch)}>Delete</button>
      </div>
    </article>
  );
}

export function Watches({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFinancial();
  const [search, setSearch] = useState('');
  const [collectionRole, setCollectionRole] = useState<WatchRoleFilter>('all');
  const [status, setStatus] = useState<WatchStatusFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Watch | null>(null);

  const watches = data.watches;
  const summary = useMemo(() => summarizeWatches(watches), [watches]);
  const visible = useMemo(() => filterWatches(watches, { search, collectionRole, status }), [watches, search, collectionRole, status]);
  const gapCount = Object.values(summary.dataGaps).reduce((sum, count) => sum + count, 0);

  const saveNew = async (form: WatchFormState) => {
    await insert('watches', payloadFromForm(form));
    setAdding(false);
  };

  const saveEdit = async (form: WatchFormState) => {
    if (!editing) return;
    await update('watches', editing.id, payloadFromForm(form));
    setEditing(null);
  };

  return (
    <>
      <ScreenHeader title="Watches" subtitle="Owner-scoped collection control: ownership, role, provenance, full set, accessories, service, insurance, storage, security and sentiment." onMenu={onMenu}>
        <button className="btn btn-primary btn-sm" onClick={() => { setAdding((s) => !s); setEditing(null); }}>
          {adding ? 'Cancel' : '+ Watch'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {adding && <WatchForm initial={blankForm} onCancel={() => setAdding(false)} onSave={saveNew} />}
        {editing && <WatchForm key={editing.id} initial={formFromWatch(editing)} onCancel={() => setEditing(null)} onSave={saveEdit} />}

        <div className="cf-metric-grid">
          <Metric label="Owned collection value" value={formatMoney(summary.ownedCollectionValue, true)} delta="Owned only; candidate/future/sold/traded rows excluded" />
          <Metric label="Known acquisition basis" value={formatMoney(summary.knownAcquisitionBasis, true)} delta="Owned pieces with purchase prices" />
          <Metric label="Unrealised P/L" value={signedMoney(summary.unrealisedPL)} tone={summary.unrealisedPL >= 0 ? 'good' : 'bad'} delta="Only rows with purchase + current value" />
          <Metric label="Owned count" value={String(summary.ownedCount)} delta="Future candidates do not inflate count" />
          <Metric label="Data gaps" value={String(gapCount)} delta="Valuation / insurance / full-set / storage-security fields to backfill" tone={gapCount ? 'bad' : 'good'} />
        </div>

        <Card title="Collection filters">
          <div className="watch-filter-bar">
            <input aria-label="Search watches" placeholder="Search brand, model, reference, nickname, provenance, accessories or valuation source…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="watch-filter-pills" aria-label="Collection role filters">
              {ROLES.map((role) => (
                <button key={role} className={`btn btn-sm ${collectionRole === role ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCollectionRole(role)}>
                  {role === 'all' ? 'All' : ROLE_LABEL[role]}
                  {role !== 'all' ? ` (${summary.roleCounts[role]})` : ''}
                </button>
              ))}
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as WatchStatusFilter)} aria-label="Ownership status filter">
              {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        </Card>

        <div className="watch-grid">
          {visible.map((watch) => <WatchCard key={watch.id} watch={watch} onEdit={setEditing} onDelete={(w) => remove('watches', w.id)} />)}
          {visible.length === 0 && <Card>No watches match this view. Add a watch or relax the filters.</Card>}
        </div>
      </div>
    </>
  );
}
