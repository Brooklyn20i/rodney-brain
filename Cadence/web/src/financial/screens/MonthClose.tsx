import { useEffect, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { MonthCloseWizard } from '../components/MonthCloseWizard';
import { buildExecutiveSummary, latestMonth, netWorthBridge, nextPeriod, priorMonthOf } from '../lib/financeCalc';
import { formatMoney, monthLabel, EVIDENCE_GRADE_LABEL, STRONG_EVIDENCE_GRADES } from '../lib/util';
import { deliverPdfBlob, requiresInteractivePdfDelivery, sharePdfBlob } from '../lib/pdfDelivery';
import { EvidenceView } from './EvidenceRegister';

type PreparedPdf = { blob: Blob; filename: string };

export function MonthClose({ onMenu, initialView = 'close' }: { onMenu: () => void; initialView?: 'close' | 'evidence' }) {
  const [view, setView] = useState<'close' | 'evidence'>(initialView);
  const { data } = useCadenceFinancial();
  const [wizardMode, setWizardMode] = useState<null | 'next' | 'edit-latest'>(null);
  const [exporting, setExporting] = useState(false);
  const [preparedPdf, setPreparedPdf] = useState<PreparedPdf | null>(null);
  const [preparedPdfUrl, setPreparedPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const months = data.monthly_metrics;

  useEffect(() => {
    return () => {
      if (preparedPdfUrl) URL.revokeObjectURL(preparedPdfUrl);
    };
  }, [preparedPdfUrl]);

  // Invalidate a prepared PDF only when the CLOSE DATA it was built from
  // changes — keying on the whole `data` object meant any realtime echo on an
  // unrelated table (another device, an agent write) silently removed the
  // "Share or save" banner before the user could tap it.
  useEffect(() => {
    setPreparedPdf(null);
    setPreparedPdfUrl(null);
    setPdfError(null);
  }, [data.monthly_metrics, data.evidence_items, data.decisions]);

  const clearPreparedPdf = () => {
    setPreparedPdfUrl(null);
    setPreparedPdf(null);
  };

  // The PDF renderer (@react-pdf, ~220 KB gzip) is loaded ONLY when someone
  // actually exports — not baked into the Month Close chunk — so viewing this
  // screen stays light. iPhone/iPad get a prepared file and a fresh explicit
  // share/save tap; this avoids iOS leaving an asynchronously opened tab blank.
  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    setPdfError(null);
    try {
      const { prepareMonthlyAssessmentPdf } = await import('../lib/pdf');
      const prepared = await prepareMonthlyAssessmentPdf(data);
      if (!prepared) throw new Error('No monthly close is available to export.');

      if (requiresInteractivePdfDelivery()) {
        clearPreparedPdf();
        setPreparedPdf(prepared);
        setPreparedPdfUrl(URL.createObjectURL(prepared.blob));
      } else {
        deliverPdfBlob(prepared.blob, prepared.filename);
      }
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'The monthly PDF could not be prepared.');
    } finally {
      setExporting(false);
    }
  };

  const sharePreparedPdf = async () => {
    if (!preparedPdf) return;
    setPdfError(null);
    try {
      const shared = await sharePdfBlob(preparedPdf.blob, preparedPdf.filename);
      if (!shared) {
        setPdfError('Native sharing is unavailable here. Use “Open PDF directly” below.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setPdfError('Sharing did not open. Use “Open PDF directly” below.');
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

  const current = latestMonth(months);
  const prior = priorMonthOf(months, current.period) ?? current;
  const bridge = netWorthBridge(prior, current);
  const label = monthLabel(current.period);
  const canCorrect = priorMonthOf(months, current.period) !== null;

  const currentEvidence = data.evidence_items.filter((e) => e.period === current.period);
  const missing = currentEvidence.filter((e) => !STRONG_EVIDENCE_GRADES.has(e.grade));
  const openDecisions = data.decisions.filter((d) => d.approval_status === 'open' || d.approval_status === 'blocked');

  return (
    <>
      <ScreenHeader title="Month Close" subtitle={`${label} — financial control room`} onMenu={onMenu}>
        {view === 'close' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setWizardMode((m) => (m === 'next' ? null : 'next'))}>
              {wizardMode === 'next' ? 'Cancel' : `+ Close ${monthLabel(nextPeriod(current.period))}`}
            </button>
            {canCorrect && (
              <button className="btn btn-secondary btn-sm" onClick={() => setWizardMode((m) => (m === 'edit-latest' ? null : 'edit-latest'))}>
                {wizardMode === 'edit-latest' ? 'Cancel' : `✎ Correct ${label}`}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={downloadPdf} disabled={exporting}>
              {exporting ? 'Preparing…' : 'Download monthly PDF'}
            </button>
          </>
        )}
      </ScreenHeader>
      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <button className={`hub-seg ${view === 'close' ? 'active' : ''}`} onClick={() => setView('close')}>Close</button>
          <button className={`hub-seg ${view === 'evidence' ? 'active' : ''}`} onClick={() => setView('evidence')}>Evidence register</button>
        </div>
      </div>
      {view === 'evidence' ? <EvidenceView /> : (
      <div className="screen-content">
        {preparedPdf && preparedPdfUrl && (
          <div className="cf-callout" role="status">
            <strong>Your monthly PDF is ready.</strong>{' '}
            Tap the button below to open the iPhone/iPad share sheet, then choose Save to Files,
            AirDrop, Mail or another destination.
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={sharePreparedPdf}>
                Share or save PDF
              </button>
              <a
                className="btn btn-secondary btn-sm"
                href={preparedPdfUrl}
                download={preparedPdf.filename}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open PDF directly
              </a>
              <button className="btn btn-secondary btn-sm" onClick={clearPreparedPdf}>
                Dismiss
              </button>
            </div>
          </div>
        )}
        {pdfError && <div className="cf-callout" role="alert">{pdfError}</div>}
        {wizardMode && <MonthCloseWizard months={months} mode={wizardMode} onDone={() => setWizardMode(null)} />}
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
      )}
    </>
  );
}
