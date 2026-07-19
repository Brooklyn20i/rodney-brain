// The weekly review: per-day adherence bars plus averages, target hits and
// the projected weight trend. Owns its own week-anchor navigation.

import { useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card } from '../bits';
import { weekReport } from '../../lib/fitnessCalc';
import { addDays, fmtDayShort, fmtNum, todayISO } from '../../lib/util';

export function WeekCard() {
  const { data } = useCadenceFitness();
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const week = weekReport(data.nutrition_logs, data.nutrition_targets, data.body_metrics, weekAnchor);

  return (
    <Card
      title="This week"
      actions={
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekAnchor(addDays(week.start, -1))}>
            ←
          </button>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
            {fmtDayShort(week.start)} – {fmtDayShort(week.end)}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={week.end >= todayISO()}
            onClick={() => setWeekAnchor(addDays(week.end, 1))}
          >
            →
          </button>
        </span>
      }
    >
      <div className="nu-week-bars">
        {week.days.map((d) => {
          const max = Math.max(d.target ?? 0, d.calories, 1);
          const pct = Math.round((d.calories / max) * 100);
          const over = d.delta !== null && d.delta > 0;
          return (
            <div
              key={d.date}
              className="nu-week-day"
              title={`${fmtDayShort(d.date)}: ${fmtNum(d.calories)} kcal${d.target ? ` / ${fmtNum(d.target)}` : ''}`}
            >
              <div className="nu-week-track">
                <div
                  className={`nu-week-fill ${!d.logged ? 'empty' : over ? 'over' : 'under'}`}
                  style={{ height: `${d.logged ? Math.max(6, pct) : 0}%` }}
                />
                {d.target !== null && (
                  <div className="nu-week-goal" style={{ bottom: `${Math.min(100, (d.target / max) * 100)}%` }} />
                )}
              </div>
              <span className="nu-week-label">{fmtDayShort(d.date).slice(0, 2)}</span>
            </div>
          );
        })}
      </div>
      <div className="cf-table-wrap">
        <table className="cf-table">
          <tbody>
            <tr>
              <td>Days logged</td>
              <td>{week.loggedDays}/7</td>
            </tr>
            <tr>
              <td>Average intake</td>
              <td>
                {week.avgIntake !== null
                  ? `${fmtNum(week.avgIntake)} kcal · P${fmtNum(week.avgProtein ?? 0)}g`
                  : '—'}
              </td>
            </tr>
            <tr>
              <td>Days at/under target</td>
              <td>{week.loggedDays ? `${week.onTargetDays}/${week.loggedDays}` : '—'}</td>
            </tr>
            <tr>
              <td>Weight trend this week</td>
              <td>
                {week.weightDeltaKg !== null
                  ? `${week.weightDeltaKg >= 0 ? '+' : ''}${fmtNum(week.weightDeltaKg, 2)}kg`
                  : '—'}
              </td>
            </tr>
            <tr className="cf-total">
              <td>Average daily balance</td>
              <td>
                {week.avgDailyBalance !== null
                  ? `${week.avgDailyBalance >= 0 ? '+' : ''}${fmtNum(week.avgDailyBalance)} kcal (${
                      week.projectedKgPerWeek! >= 0 ? '+' : ''
                    }${fmtNum(week.projectedKgPerWeek!, 2)}kg/wk)`
                  : 'needs maintenance estimate'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
