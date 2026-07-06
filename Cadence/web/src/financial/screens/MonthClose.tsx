import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { MonthCloseWizard } from '../components/MonthCloseWizard';
import { buildExecutiveSummary, latestMonth, netWorthBridge, nextPeriod } from '../lib/financeCalc';
import { formatMoney, monthLabel, EVIDENCE_GRADE_LABEL, STRONG_EVIDENCE_GRADES } from '../lib/util';

export function MonthClose({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const [showWizard, setShowWizard] = useState(false);
  const [exporting, setExporting] = useState(false);
  const months = data.monthly_metrics;

  // The PDF renderer (@react-pdf, ~220 KB gzip) is loaded ONLY when someone
  // actually exports — not baked into the Month Close chunk — so viewing this
  // screen stays light. Dynamic import; the chunk is cached after first use.
  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportMonthlyAssessmentPdf } = await import('../lib/pdf');
      await exportMonthlyAssessmentPdf(data);
    } finally {
      setExporting(false);
    }
  };

  if (months.length === 0) {
    return (
      <>
        <ScreenHeader title="Month Close" onMenu={onMenu} />
        <div className="screen-content">
          <Card>No monthly metrics loaded yet. Add this month's snapshot to get started.</Card>
        </div>
      </>
    );
  }

  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const current = latestMonth(months);
  const prior = sorted.length > 1 ? sorted[sorted.length - 2] : current;
  const bridge = netWorthBridge(prior, current);
  const label = monthLabel(current.period);

  const currentEvidence = data.evidence_items.filter((e) => e.period === current.period);
  const missing = currentEvidence.filter((e) => !STRONG_EVIDENCE_GRADES.has(e.grade));
  const openDecisions = data.decisions.filter((d) => d.approval_status === 'open' || d.approval_status === 'blocked');

  return (
    <>
      <ScreenHeader title="Month Close" subtitle={`${label} — financial control room`} onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowWizard((s) => !s)}>
          {showWizard ? 'Cancel' : `+ Close ${monthLabel(nextPeriod(current.period))}`}
        </button>
        <button className="btn btn-primary btn-sm" onClick={downloadPdf} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download monthly PDF'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {showWizard && <MonthCloseWizard prior={current} onDone={() => setShowWizard(false)} />}
        <div className="cf-callout">{buildExecutiveSummary(bridge, label)}</div>

        <div className="cf-metric-grid">
          <Metric label="Net worth" value={formatMoney(current.net_worth, true)} delta={formatMoney(bridge.netWorthMovement)} tone={bridge.netWorthMovement >= 0 ? 'good' : 'bad'} />
          <Metric label="Cash / offsets" value={formatMoney(current.cash_offsets, true)} delta={`${formatMoney(current.cash_saved)} this month`} tone={current.cash_saved >= 0 ? 'good' : 'bad'} />
          <Metric label="Total debt" value={formatMoney(current.total_debt, true)} delta={`${formatMoney(current.debt_reduction)} reduced`} tone="good" />
          <Metric label="Net debt" value={formatMoney(current.net_debt, true)} tone="neutral" />
        </div>

        <Card title="Month status">
          <table className="cf-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Read</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cash / offsets</td>
                <td>{formatMoney(current.cash_offsets)}</td>
                <td>Protected liquidity {current.cash_saved >= 0 ? 'improved' : 'declined'} this month</td>
              </tr>
              <tr>
                <td>BTC / crypto</td>
                <td>{formatMoney(current.btc_crypto)}</td>
                <td>{formatMoney(current.btc_crypto - prior.btc_crypto)} vs prior month</td>
              </tr>
              <tr>
                <td>Listed shares</td>
                <td>{formatMoney(current.shares)}</td>
                <td>{formatMoney(current.shares - prior.shares)} vs prior month</td>
              </tr>
              <tr>
                <td>Net worth</td>
                <td>{formatMoney(current.net_worth)}</td>
                <td>{bridge.marketAndOtherMovement < 0 ? 'Down due to market marks' : 'Market marks were supportive'}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title={`Evidence received / missing — ${label}`}>
          {currentEvidence.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>No evidence logged for this period yet.</p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentEvidence.map((e) => (
                  <tr key={e.id}>
                    <td>{e.item}</td>
                    <td>
                      <span className={`grade-tag ${STRONG_EVIDENCE_GRADES.has(e.grade) ? 'grade-strong' : 'grade-weak'}`}>
                        {EVIDENCE_GRADE_LABEL[e.grade] ?? e.grade}
                      </span>
                    </td>
                    <td>{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
            {missing.length === 0
              ? 'All figures this month are on strong evidence.'
              : `${missing.length} item${missing.length === 1 ? '' : 's'} this month ${missing.length === 1 ? 'is' : 'are'} market-repriced, assumed or carried forward -- see Evidence Register.`}
          </p>
        </Card>

        <Card title="Needs you">
          {openDecisions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing open right now.</p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openDecisions.map((d) => (
                <li key={d.id} style={{ fontSize: 13 }}>
                  <span className={`grade-tag status-${d.approval_status}`}>{d.approval_status}</span>{' '}
                  <strong>{d.decision_area}</strong> — {d.question}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
