import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import {
  buildExecutiveSummary,
  latestMonth,
  netWorthBridge,
} from '../lib/financeCalc';
import { computeRiskMetrics } from '../lib/riskCalc';
import { allocationRows } from '../lib/allocation';
import { availablePeriods as propertyPeriods, portfolioMonth } from '../lib/propertyCalc';
import { computeRunway, periodAfterMonths } from '../lib/goalCalc';
import { formatMoney, formatPercent, monthLabel, STRONG_EVIDENCE_GRADES } from '../lib/util';

// The monthly flash report: one screen that answers "am I on track, what
// changed, what's out of policy, and what needs me?" -- so nobody has to
// tour ten screens to know where things stand. Every flag deep-links to the
// screen that owns it.

interface Flag {
  tone: 'red' | 'amber' | 'info';
  text: string;
  screen: string;
  screenLabel: string;
}

const TONE_CLASS = { red: 'status-blocked', amber: 'grade-weak', info: 'status-clarified' };

export function Overview({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data } = useCadenceFinancial();
  const months = [...data.monthly_metrics].sort((a, b) => a.period.localeCompare(b.period));
  const current = months.length ? latestMonth(months) : null;
  const prior = months.length >= 2 ? months[months.length - 2] : null;
  const bridge = current && prior ? netWorthBridge(prior, current) : null;

  const goal = data.goals[0] ?? null;
  const runway = goal ? computeRunway(goal, months) : null;

  // ── Assemble the "needs attention" flags ──
  const flags: Flag[] = [];

  if (current) {
    for (const r of allocationRows(current, data.allocation_policies)) {
      if (r.status === 'in_band') continue;
      flags.push({
        tone: 'amber',
        text: `${r.label} is ${r.status === 'above_band' ? 'above' : 'below'} its policy band — ${formatPercent(r.pct)} of net worth vs ${formatPercent(r.band.min, 0)}–${formatPercent(r.band.max, 0)} target.`,
        screen: 'allocation',
        screenLabel: 'Allocation',
      });
    }

    for (const m of computeRiskMetrics(current, data.liquidity_buckets, data.risk_policies)) {
      if (m.status !== 'red' && m.status !== 'amber') continue;
      flags.push({
        tone: m.status,
        text: `${m.label} is ${m.status} — currently ${m.value === null ? 'n/a' : formatPercent(m.value)}.`,
        screen: 'risk',
        screenLabel: 'Risk',
      });
    }

    const weakEvidence = data.evidence_items.filter(
      (e) =>
        e.period === current.period &&
        (e.status === 'missing' || e.status === 'partial' || !STRONG_EVIDENCE_GRADES.has(e.grade))
    );
    if (weakEvidence.length > 0) {
      flags.push({
        tone: 'amber',
        text: `${weakEvidence.length} evidence item${weakEvidence.length === 1 ? '' : 's'} for ${monthLabel(current.period)} ${weakEvidence.length === 1 ? 'is' : 'are'} below decision grade (stale, missing or assumed).`,
        screen: 'evidence',
        screenLabel: 'Evidence',
      });
    }
  }

  const openDecisions = data.decisions.filter(
    (d) => d.approval_status === 'open' || d.approval_status === 'blocked'
  );
  if (openDecisions.length > 0) {
    flags.push({
      tone: 'info',
      text: `${openDecisions.length} decision${openDecisions.length === 1 ? '' : 's'} waiting on you.`,
      screen: 'decisions',
      screenLabel: 'Decisions',
    });
  }

  // Property portfolio: flag any property running at a monthly cash loss in
  // the latest period with statements on file.
  const propPeriods = propertyPeriods(data.property_ledger);
  if (propPeriods.length > 0) {
    const latestPropPeriod = propPeriods[propPeriods.length - 1];
    const pm = portfolioMonth(data.property_ledger, data.properties, latestPropPeriod);
    const losers = pm.rows.filter((r) => (r.totalIncome > 0 || r.totalExpenses > 0) && r.netCashflow < 0);
    for (const r of losers) {
      flags.push({
        tone: 'amber',
        text: `${r.address} ran at a cash loss in ${monthLabel(latestPropPeriod)} — ${formatMoney(r.netCashflow)} net.`,
        screen: 'property',
        screenLabel: 'Property',
      });
    }
  }

  if (data.insurance_policies.length === 0) {
    flags.push({
      tone: 'red',
      text: 'No insurance recorded — the protection register is empty.',
      screen: 'protection',
      screenLabel: 'Protection',
    });
  }
  const estateGaps = data.estate_items.filter(
    (e) => e.status === 'missing' || e.status === 'review_due'
  );
  if (estateGaps.length > 0) {
    flags.push({
      tone: 'amber',
      text: `${estateGaps.length} estate item${estateGaps.length === 1 ? '' : 's'} missing or due for review.`,
      screen: 'protection',
      screenLabel: 'Protection',
    });
  }

  if (!goal) {
    flags.push({
      tone: 'info',
      text: 'No objective defined yet — set a target so every month has a direction.',
      screen: 'goals',
      screenLabel: 'Goals',
    });
  }

  const unreadAgent = data.agent_messages.filter(
    (m) => m.sender_type === 'agent' && m.status === 'unread'
  );
  if (unreadAgent.length > 0) {
    flags.push({
      tone: 'info',
      text: `${unreadAgent.length} unread message${unreadAgent.length === 1 ? '' : 's'} from your agents.`,
      screen: 'kobe',
      screenLabel: 'Kobe',
    });
  }

  const order = { red: 0, amber: 1, info: 2 };
  flags.sort((a, b) => order[a.tone] - order[b.tone]);

  return (
    <>
      <ScreenHeader
        title="Overview"
        subtitle={current ? `${monthLabel(current.period)} — where things stand` : 'Where things stand'}
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet — run your first Month Close to begin.</Card>
        ) : (
          <>
            {bridge && (
              <Card>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {buildExecutiveSummary(bridge, monthLabel(current.period))}
                </p>
              </Card>
            )}

            <div className="cf-metric-grid">
              <Metric
                label="Net worth"
                value={formatMoney(current.net_worth, true)}
                delta={bridge ? formatMoney(bridge.netWorthMovement) : undefined}
                tone={bridge ? (bridge.netWorthMovement >= 0 ? 'good' : 'bad') : 'neutral'}
              />
              <Metric
                label="You did (operating)"
                value={bridge ? formatMoney(bridge.operatingCashAndDebt, true) : '—'}
                delta="cash + buys + debt paid"
                tone={bridge && bridge.operatingCashAndDebt >= 0 ? 'good' : 'bad'}
              />
              <Metric
                label="Markets did"
                value={bridge ? formatMoney(bridge.marketAndOtherMovement, true) : '—'}
                delta="marks, FX, everything else"
                tone={bridge && bridge.marketAndOtherMovement >= 0 ? 'good' : 'bad'}
              />
              <Metric label="Net debt" value={formatMoney(current.net_debt, true)} />
            </div>

            {goal && runway && (
              <Card title={`Goal — ${goal.label}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>
                    {formatMoney(current.net_worth, true)} of {formatMoney(goal.target_net_worth, true)}
                  </span>
                  <strong>{formatPercent(Math.min(runway.progressFraction, 1), 0)}</strong>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(runway.progressFraction, 1) * 100}%` }}
                  />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {runway.monthsOperatingOnly === 0 ? (
                    'Target reached.'
                  ) : (
                    <>
                      At your trailing {runway.trailingMonths}-month operating pace (
                      {formatMoney(runway.monthlyOperatingAverage, true)}/mo):{' '}
                      {runway.monthsOperatingOnly === null
                        ? 'not reachable on operating alone'
                        : `~${monthLabel(periodAfterMonths(current.period, runway.monthsOperatingOnly))} on operating alone`}
                      {goal.assumed_growth_rate > 0 && runway.monthsWithGrowth !== null && (
                        <>
                          {' '}
                          · ~{monthLabel(periodAfterMonths(current.period, runway.monthsWithGrowth))} with{' '}
                          {formatPercent(goal.assumed_growth_rate, 0)} assumed growth
                        </>
                      )}
                      . <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('goals')} style={{ padding: 0 }}>Details →</button>
                    </>
                  )}
                </p>
              </Card>
            )}

            <Card title={`Needs attention (${flags.length})`}>
              {flags.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                  Nothing flagged — allocation in band, risk green, evidence strong, no open
                  decisions.
                </p>
              ) : (
                <div className="flag-list">
                  {flags.map((f, i) => (
                    <div className="flag-row" key={i}>
                      <span className={`grade-tag ${TONE_CLASS[f.tone]}`}>
                        {f.tone === 'info' ? 'note' : f.tone}
                      </span>
                      <span className="flag-text">{f.text}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate(f.screen)}>
                        {f.screenLabel} →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
