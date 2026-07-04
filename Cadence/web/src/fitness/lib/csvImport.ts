// ── CSV history importers (Whoop export, scale/weight history) ─────────────
// Rodney can download a monthly export from Whoop (a ZIP of CSVs — the one
// that matters is physiological_cycles.csv) and a weight history from
// Renpho/anywhere. These parsers are deliberately fuzzy about column names,
// because vendors rename columns between export versions: they look for
// keywords in lowercased headers instead of exact matches.
//
// Everything returns rows keyed by ISO date, one per day, ready to upsert on
// (owner_id, date) — so re-importing an overlapping export is always safe.

export interface RecoveryImportRow {
  date: string;
  recovery_pct?: number;
  strain?: number;
  resting_hr?: number;
  hrv_ms?: number;
  sleep_hours?: number;
  sleep_performance_pct?: number;
  active_energy_kcal?: number;
}

export interface BodyImportRow {
  date: string;
  weight_kg?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
}

// Minimal RFC-4180-ish parser: quoted fields, embedded commas/newlines.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// "2026-06-01 06:12:34", "2026/06/01", "01/06/2026" (day-first, en-AU) → ISO.
export function toISO(raw: string): string | null {
  const s = raw.trim().replace(/\//g, '-');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : undefined;
};

// Find the index of the first header containing every keyword in one of the
// alternatives. E.g. find(headers, ['recovery score'], ['recovery']).
function findCol(headers: string[], ...alternatives: string[][]): number {
  for (const keywords of alternatives) {
    const idx = headers.findIndex((h) => keywords.every((k) => h.includes(k)));
    if (idx !== -1) return idx;
  }
  return -1;
}

export interface ImportResult<T> {
  rows: T[];
  skipped: number; // lines with no parseable date
  from: string | null;
  to: string | null;
}

function finish<T extends { date: string }>(byDate: Map<string, T>, skipped: number): ImportResult<T> {
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows,
    skipped,
    from: rows.length ? rows[0].date : null,
    to: rows.length ? rows[rows.length - 1].date : null,
  };
}

// Whoop physiological_cycles.csv (or anything shaped like it).
export function parseWhoopCSV(text: string): ImportResult<RecoveryImportRow> {
  const grid = parseCSV(text);
  if (grid.length < 2) return { rows: [], skipped: 0, from: null, to: null };
  const headers = grid[0].map((h) => h.toLowerCase().trim());

  const dateCol = findCol(headers, ['cycle start'], ['sleep onset'], ['date']);
  const cols = {
    recovery: findCol(headers, ['recovery score'], ['recovery']),
    strain: findCol(headers, ['day strain'], ['strain']),
    rhr: findCol(headers, ['resting heart rate']),
    hrv: findCol(headers, ['heart rate variability']),
    sleepMin: findCol(headers, ['asleep duration']),
    sleepHr: findCol(headers, ['sleep duration', 'hour'], ['hours of sleep']),
    sleepPerf: findCol(headers, ['sleep performance']),
    energy: findCol(headers, ['energy burned'], ['calories burned'], ['kilojoule']),
  };
  const kj = cols.energy !== -1 && headers[cols.energy].includes('kilojoule');
  if (dateCol === -1) return { rows: [], skipped: grid.length - 1, from: null, to: null };

  const byDate = new Map<string, RecoveryImportRow>();
  let skipped = 0;
  for (const line of grid.slice(1)) {
    const date = toISO(line[dateCol] ?? '');
    if (!date) {
      skipped++;
      continue;
    }
    const row: RecoveryImportRow = byDate.get(date) ?? { date };
    const rec = num(line[cols.recovery]);
    const strain = num(line[cols.strain]);
    const rhr = num(line[cols.rhr]);
    const hrv = num(line[cols.hrv]);
    const sleepMin = num(line[cols.sleepMin]);
    const sleepHr = num(line[cols.sleepHr]);
    const perf = num(line[cols.sleepPerf]);
    const energy = num(line[cols.energy]);
    if (rec !== undefined) row.recovery_pct = Math.round(rec);
    if (strain !== undefined) row.strain = Math.round(strain * 10) / 10;
    if (rhr !== undefined) row.resting_hr = Math.round(rhr);
    if (hrv !== undefined) row.hrv_ms = Math.round(hrv);
    if (sleepHr !== undefined) row.sleep_hours = Math.round(sleepHr * 10) / 10;
    else if (sleepMin !== undefined) row.sleep_hours = Math.round((sleepMin / 60) * 10) / 10;
    if (perf !== undefined) row.sleep_performance_pct = Math.round(perf);
    if (energy !== undefined) row.active_energy_kcal = Math.round(kj ? energy / 4.184 : energy);
    byDate.set(date, row);
  }
  return finish(byDate, skipped);
}

// Weight history CSV (Renpho export, spreadsheet, etc.).
export function parseWeightCSV(text: string): ImportResult<BodyImportRow> {
  const grid = parseCSV(text);
  if (grid.length < 2) return { rows: [], skipped: 0, from: null, to: null };
  const headers = grid[0].map((h) => h.toLowerCase().trim());

  const dateCol = findCol(headers, ['date'], ['time']);
  const weightCol = findCol(headers, ['weight']);
  const fatCol = findCol(headers, ['body fat'], ['fat']);
  const muscleCol = findCol(headers, ['muscle']);
  if (dateCol === -1 || weightCol === -1) return { rows: [], skipped: grid.length - 1, from: null, to: null };
  const lbs = headers[weightCol].includes('lb');

  const byDate = new Map<string, BodyImportRow>();
  let skipped = 0;
  for (const line of grid.slice(1)) {
    const date = toISO(line[dateCol] ?? '');
    const weight = num(line[weightCol]);
    if (!date || weight === undefined || weight <= 0) {
      skipped++;
      continue;
    }
    const row: BodyImportRow = { date, weight_kg: Math.round((lbs ? weight * 0.45359237 : weight) * 100) / 100 };
    const fat = num(line[fatCol]);
    const muscle = num(line[muscleCol]);
    if (fat !== undefined && fat > 0) row.body_fat_pct = Math.round(fat * 10) / 10;
    if (muscle !== undefined && muscle > 0) row.muscle_mass_kg = Math.round(muscle * 100) / 100;
    byDate.set(date, row); // last reading of the day wins
  }
  return finish(byDate, skipped);
}
