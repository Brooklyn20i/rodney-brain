import { useState } from 'react';
import { ScreenHeader } from '../components/bits';
import { addDays, todayISO } from '../lib/util';
import { TotalsCard } from '../components/nutrition/TotalsCard';
import { SavedFoodsCard } from '../components/nutrition/SavedFoodsCard';
import { QuickAddCard } from '../components/nutrition/QuickAddCard';
import { LoggedCard } from '../components/nutrition/LoggedCard';
import { EnergyCard } from '../components/nutrition/EnergyCard';
import { WeekCard } from '../components/nutrition/WeekCard';

// Daily calories + macros: quick entry, one-tap saved meals, phased targets.
// Deliberately totals-first (not a food database) -- 90% of the MacroFactor
// value at a fraction of the friction; Kobe can log entries via MCP too.
//
// This screen is just the date scaffold; each card is a focused component
// under components/nutrition/ that owns its own state and store access.
export function Nutrition({ onMenu }: { onMenu: () => void }) {
  const [date, setDate] = useState(todayISO());

  return (
    <>
      <ScreenHeader title="Nutrition" subtitle="Calories and macros vs target." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <input type="date" value={date} style={{ width: 150 }} onChange={(e) => setDate(e.target.value)} />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayISO()}
        >
          →
        </button>
      </ScreenHeader>
      <div className="screen-content">
        <TotalsCard date={date} />
        {/* Saved foods are the primary logging path (repeat meals dominate a
            normal week), so they sit first, open, one tap from a logged row. */}
        <SavedFoodsCard date={date} />
        <QuickAddCard date={date} />
        <LoggedCard date={date} />
        <EnergyCard date={date} />
        <WeekCard />
      </div>
    </>
  );
}
