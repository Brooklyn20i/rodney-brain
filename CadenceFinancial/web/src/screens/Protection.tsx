import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import {
  ESTATE_ITEM_PRESETS,
  ESTATE_STATUS_LABEL,
  INSURANCE_CATEGORY_LABEL,
  INSURANCE_STATUS_LABEL,
  fmtDMY,
  formatMoney,
} from '../lib/util';
import type { EstateItemStatus, InsuranceCategory, InsuranceStatus } from '../lib/types';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;

const ESTATE_STATUS_CLASS: Record<string, string> = {
  executed: 'grade-strong',
  in_progress: 'status-clarified',
  review_due: 'grade-weak',
  missing: 'status-blocked',
};

const INSURANCE_STATUS_CLASS: Record<string, string> = {
  active: 'grade-strong',
  under_review: 'grade-weak',
  lapsed: 'status-blocked',
};

export function Protection({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const [form, setForm] = useState<'policy' | 'estate' | null>(null);

  const [policy, setPolicy] = useState({
    category: 'life' as InsuranceCategory,
    insurer: '',
    policy_label: '',
    cover_amount: '',
    premium_annual: '',
    renewal_date: '',
  });
  const [estate, setEstate] = useState({ item_key: 'will', status: 'missing' as EstateItemStatus, notes: '' });

  // Per-row edit state
  const [policyEdit, setPolicyEdit] = useState<Record<string, { cover: string; premium: string; renewal: string; status: InsuranceStatus }>>({});
  const [estateEdit, setEstateEdit] = useState<Record<string, { status: EstateItemStatus; last_reviewed: string }>>({});

  const addPolicy = async () => {
    if (!policy.policy_label.trim()) return;
    await insert('insurance_policies', {
      category: policy.category,
      insurer: policy.insurer.trim(),
      policy_label: policy.policy_label.trim(),
      cover_amount: num(policy.cover_amount),
      premium_annual: num(policy.premium_annual),
      renewal_date: policy.renewal_date || null,
      status: 'active',
      notes: '',
    });
    setPolicy({ category: 'life', insurer: '', policy_label: '', cover_amount: '', premium_annual: '', renewal_date: '' });
    setForm(null);
  };

  const addEstate = async () => {
    const preset = ESTATE_ITEM_PRESETS.find((p) => p.key === estate.item_key);
    await insert('estate_items', {
      item_key: estate.item_key,
      label: preset?.label ?? estate.item_key,
      status: estate.status,
      last_reviewed: null,
      notes: estate.notes.trim(),
    });
    setEstate({ item_key: 'will', status: 'missing', notes: '' });
    setForm(null);
  };

  const savePolicy = async (id: string) => {
    const e = policyEdit[id];
    if (!e) return;
    await update('insurance_policies', id, {
      cover_amount: num(e.cover),
      premium_annual: num(e.premium),
      renewal_date: e.renewal || null,
      status: e.status,
    });
    setPolicyEdit((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  const saveEstate = async (id: string) => {
    const e = estateEdit[id];
    if (!e) return;
    await update('estate_items', id, { status: e.status, last_reviewed: e.last_reviewed || null });
    setEstateEdit((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  const totalPremiums = data.insurance_policies
    .filter((p) => p.status !== 'lapsed')
    .reduce((s, p) => s + p.premium_annual, 0);

  return (
    <>
      <ScreenHeader
        title="Protection"
        subtitle="Insurance register and estate readiness — record only, never advice."
        onMenu={onMenu}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(form === 'estate' ? null : 'estate')}>
          {form === 'estate' ? 'Cancel' : '+ Estate item'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setForm(form === 'policy' ? null : 'policy')}>
          {form === 'policy' ? 'Cancel' : '+ Policy'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {form === 'policy' && (
          <Card title="New insurance policy">
            <div className="wizard-grid">
              <div className="form-group">
                <label className="field">Category</label>
                <select
                  value={policy.category}
                  onChange={(e) => setPolicy((p) => ({ ...p, category: e.target.value as InsuranceCategory }))}
                >
                  {Object.entries(INSURANCE_CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ['policy_label', 'Label (e.g. "Life cover — self")'],
                  ['insurer', 'Insurer'],
                  ['cover_amount', 'Cover amount (A$)'],
                  ['premium_annual', 'Annual premium (A$)'],
                  ['renewal_date', 'Renewal date (YYYY-MM-DD)'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={policy[key]} onChange={(e) => setPolicy((p) => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addPolicy}>
              Add policy
            </button>
          </Card>
        )}
        {form === 'estate' && (
          <Card title="New estate item">
            <div className="wizard-grid">
              <div className="form-group">
                <label className="field">Item</label>
                <select value={estate.item_key} onChange={(e) => setEstate((s) => ({ ...s, item_key: e.target.value }))}>
                  {ESTATE_ITEM_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="field">Status</label>
                <select value={estate.status} onChange={(e) => setEstate((s) => ({ ...s, status: e.target.value as EstateItemStatus }))}>
                  {Object.entries(ESTATE_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="field">Notes</label>
                <input type="text" value={estate.notes} onChange={(e) => setEstate((s) => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={addEstate}>
              Add item
            </button>
          </Card>
        )}

        <Card title="Insurance register">
          {data.insurance_policies.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              Nothing recorded. For a balance sheet this size, protection is tier-1: life, TPD,
              income protection and property cover are the usual checklist. Recording what exists
              (or confirming a deliberate gap) is the point — this register never recommends
              products.
            </p>
          ) : (
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Policy</th>
                    <th>Insurer</th>
                    <th>Cover</th>
                    <th>Premium / yr</th>
                    <th>Renewal</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.insurance_policies.map((p) => {
                    const editing = policyEdit[p.id];
                    return (
                      <tr key={p.id}>
                        <td>{INSURANCE_CATEGORY_LABEL[p.category]}</td>
                        <td style={{ textAlign: 'left' }}>{p.policy_label}</td>
                        <td>{p.insurer}</td>
                        <td>
                          {editing ? (
                            <input type="text" style={{ width: 100 }} value={editing.cover} onChange={(e) => setPolicyEdit((s) => ({ ...s, [p.id]: { ...editing, cover: e.target.value } }))} />
                          ) : (
                            formatMoney(p.cover_amount, true)
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input type="text" style={{ width: 80 }} value={editing.premium} onChange={(e) => setPolicyEdit((s) => ({ ...s, [p.id]: { ...editing, premium: e.target.value } }))} />
                          ) : (
                            formatMoney(p.premium_annual)
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input type="text" style={{ width: 110 }} value={editing.renewal} onChange={(e) => setPolicyEdit((s) => ({ ...s, [p.id]: { ...editing, renewal: e.target.value } }))} />
                          ) : (
                            fmtDMY(p.renewal_date)
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <select value={editing.status} onChange={(e) => setPolicyEdit((s) => ({ ...s, [p.id]: { ...editing, status: e.target.value as InsuranceStatus } }))}>
                              {Object.entries(INSURANCE_STATUS_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`grade-tag ${INSURANCE_STATUS_CLASS[p.status]}`}>
                              {INSURANCE_STATUS_LABEL[p.status]}
                            </span>
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <button className="btn btn-primary btn-sm" onClick={() => savePolicy(p.id)}>
                              Save
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setPolicyEdit((s) => ({
                                  ...s,
                                  [p.id]: {
                                    cover: String(p.cover_amount),
                                    premium: String(p.premium_annual),
                                    renewal: p.renewal_date ?? '',
                                    status: p.status,
                                  },
                                }))
                              }
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="cf-total">
                    <td>Total (active)</td>
                    <td />
                    <td />
                    <td />
                    <td>{formatMoney(totalPremiums)}</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Card title="Estate readiness">
          {data.estate_items.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              No estate items tracked yet — add the standard checklist (will, powers of attorney,
              super binding nomination) and mark what's actually executed.
            </p>
          ) : (
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Last reviewed</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.estate_items.map((e) => {
                    const editing = estateEdit[e.id];
                    return (
                      <tr key={e.id}>
                        <td style={{ textAlign: 'left' }}>{e.label}</td>
                        <td>
                          {editing ? (
                            <select value={editing.status} onChange={(ev) => setEstateEdit((s) => ({ ...s, [e.id]: { ...editing, status: ev.target.value as EstateItemStatus } }))}>
                              {Object.entries(ESTATE_STATUS_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`grade-tag ${ESTATE_STATUS_CLASS[e.status]}`}>
                              {ESTATE_STATUS_LABEL[e.status]}
                            </span>
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input type="text" style={{ width: 110 }} placeholder="YYYY-MM-DD" value={editing.last_reviewed} onChange={(ev) => setEstateEdit((s) => ({ ...s, [e.id]: { ...editing, last_reviewed: ev.target.value } }))} />
                          ) : (
                            fmtDMY(e.last_reviewed)
                          )}
                        </td>
                        <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{e.notes}</td>
                        <td>
                          {editing ? (
                            <button className="btn btn-primary btn-sm" onClick={() => saveEstate(e.id)}>
                              Save
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setEstateEdit((s) => ({
                                  ...s,
                                  [e.id]: { status: e.status, last_reviewed: e.last_reviewed ?? '' },
                                }))
                              }
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
            Status tracking only — the documents themselves live with your lawyer. Binding super
            nominations typically lapse after three years; use "review due" to catch that.
          </p>
        </Card>
      </div>
    </>
  );
}
