// Energy balance: maintenance inferred from intake vs trend weight
// (MacroFactor's loop) — no formulas, just logged days + weigh-ins.

import { useCadenceFitness } from '../../lib/store';
import { Card, Tag } from '../bits';
import { dayNutrition, estimateTDEE } from '../../lib/fitnessCalc';
import { fmtDayShort, fmtNum, todayISO } from '../../lib/util';

export function EnergyCard({ date }: { date: string }) {
  const { data } = useCadenceFitness();
  const totals = dayNutrition(data.nutrition_logs, date);
  const energy = estimateTDEE(data.nutrition_logs, data.body_metrics, date);

  return (
    <Card
      title="Energy balance"
      actions={energy?.reliable ? <Tag label={`Maintenance ≈ ${fmtNum(energy.tdee)} kcal`} tone="info" /> : undefined}
    >
      {energy?.reliable ? (
        (() => {
          const balance = totals.calories - energy.tdee;
          const cutting = balance < 0;
          return (
            <>
              <p style={{ fontSize: 14, margin: '0 0 6px' }}>
                {date === todayISO() ? 'Today so far' : fmtDayShort(date)}:{' '}
                <strong style={{ color: cutting ? 'var(--green)' : 'var(--red)' }}>
                  {cutting ? `${fmtNum(-balance)} kcal deficit` : `${fmtNum(balance)} kcal surplus`}
                </strong>{' '}
                vs your estimated maintenance.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
                Estimated from {energy.loggedDays} logged days and your weight trend over the
                last {energy.spanDays} days (avg intake {fmtNum(energy.avgIntake)} kcal,{' '}
                {energy.weightDeltaKg <= 0 ? '' : '+'}
                {fmtNum(energy.weightDeltaKg, 2)}kg trend). A steady 500 kcal daily deficit ≈
                −0.45kg/week.
              </p>
            </>
          );
        })()
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          Log food most days and weigh in regularly and Cadence will infer your true maintenance
          calories from intake vs weight trend — no formulas.{' '}
          {energy
            ? `So far: ${energy.loggedDays} logged days across ${energy.spanDays} days of weigh-ins.`
            : 'No weigh-in trend yet — add weight on the Body screen (or via Sync).'}
        </p>
      )}
    </Card>
  );
}
