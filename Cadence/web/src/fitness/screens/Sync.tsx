import { useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { supabase } from '../../lib/supabase';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { fmtDayShort, fmtNum, todayISO } from '../lib/util';
import { parseWeightCSV, parseWhoopCSV, type BodyImportRow, type RecoveryImportRow } from '../lib/csvImport';

type PendingImport =
  | { kind: 'recovery'; rows: RecoveryImportRow[]; from: string; to: string; skipped: number; file: string }
  | { kind: 'body'; rows: BodyImportRow[]; from: string; to: string; skipped: number; file: string };

// How data gets into Cadence Fitness without typing it in: Whoop and Renpho
// both write into Apple Health, and one Apple Shortcut posts the day's Health
// numbers to the health-ingest endpoint. This screen shows whether that
// pipeline is alive and walks through setting the Shortcut up.
export function Sync({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFitness();
  const today = todayISO();

  const ingestUrl = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://<project>.supabase.co'}/functions/v1/health-ingest`;

  // Latest automated row per stream (source 'health' covers Whoop + Renpho
  // via Apple Health; 'whoop'/'renpho' cover values typed off those apps).
  const lastAuto = (rows: { date: string; source: string }[]) =>
    rows
      .filter((r) => r.source === 'health' || r.source === 'whoop' || r.source === 'renpho' || r.source === 'agent')
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const lastBody = useMemo(() => lastAuto(data.body_metrics), [data.body_metrics]);
  const lastRecovery = useMemo(() => lastAuto(data.recovery_metrics), [data.recovery_metrics]);

  const freshness = (row: { date: string } | null): { label: string; tone: 'good' | 'warn' | 'bad' } => {
    if (!row) return { label: 'never synced', tone: 'bad' };
    if (row.date >= today) return { label: `today`, tone: 'good' };
    const days = Math.round((new Date(today).getTime() - new Date(row.date).getTime()) / 86_400_000);
    if (days <= 2) return { label: `${days}d ago`, tone: 'good' };
    if (days <= 7) return { label: `${days}d ago`, tone: 'warn' };
    return { label: `${days}d ago`, tone: 'bad' };
  };

  const bodyFresh = freshness(lastBody);
  const recoveryFresh = freshness(lastRecovery);

  const [copied, setCopied] = useState('');
  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  // ── Historical backfill (Whoop export CSV / weight history CSV) ─────────
  const whoopFileRef = useRef<HTMLInputElement>(null);
  const weightFileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);

  const onCSVPicked = async (kind: 'recovery' | 'body', file: File | undefined) => {
    if (!file) return;
    setImportMsg('');
    setPending(null);
    const text = await file.text();
    const parsed = kind === 'recovery' ? parseWhoopCSV(text) : parseWeightCSV(text);
    if (!parsed.rows.length) {
      setImportMsg(
        `Couldn't find any dated rows in ${file.name}. For Whoop use physiological_cycles.csv from the export ZIP; for weight, a CSV with date + weight columns.`
      );
      return;
    }
    setPending({
      kind,
      rows: parsed.rows as never,
      from: parsed.from!,
      to: parsed.to!,
      skipped: parsed.skipped,
      file: file.name,
    } as PendingImport);
  };

  const runImport = async () => {
    if (!pending || importing) return;
    setImporting(true);
    setImportMsg('');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const ownerId = sess.session?.user?.id;
      if (!ownerId) throw new Error('Sign in first — imports write to your account.');
      const table = pending.kind === 'recovery' ? 'recovery_metrics' : 'body_metrics';
      const source = pending.kind === 'recovery' ? 'whoop' : 'renpho';
      const payload = pending.rows.map((r) => ({ ...r, owner_id: ownerId, source }));
      // PostgREST bulk rows must share identical keys, and days can carry
      // different metrics (e.g. no HRV one night). Group by key signature so
      // each request is homogeneous and absent fields never null-out
      // existing values.
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const row of payload) {
        const sig = Object.keys(row).sort().join(',');
        (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(row);
      }
      for (const rows of groups.values()) {
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase
            .schema('fitness')
            .from(table)
            .upsert(rows.slice(i, i + 200), { onConflict: 'owner_id,date' });
          if (error) throw new Error(error.message);
        }
      }
      setImportMsg(`✓ Imported ${payload.length} days (${fmtDayShort(pending.from)} – ${fmtDayShort(pending.to)}) from ${pending.file}.`);
      setPending(null);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const sampleBody = `{
  "weight_kg": 85.1,
  "body_fat_pct": 17.9,
  "active_energy_kcal": 650,
  "steps": 9000,
  "resting_hr": 52,
  "hrv_ms": 80,
  "sleep_hours": 7.3
}`;

  return (
    <>
      <ScreenHeader title="Sync" subtitle="Whoop + Renpho → Apple Health → Cadence." onMenu={onMenu} />
      <div className="screen-content">
        <Card title="Pipeline status">
          <div className="pick-row">
            <div className="pick-main">
              <div className="pick-title">Weight & body fat</div>
              <div className="pick-sub">
                Renpho scale → Apple Health{lastBody ? ` · last row ${fmtDayShort(lastBody.date)}` : ''}
              </div>
            </div>
            <Tag label={bodyFresh.label} tone={bodyFresh.tone === 'warn' ? 'warn' : bodyFresh.tone} />
          </div>
          <div className="pick-row">
            <div className="pick-main">
              <div className="pick-title">Recovery, sleep, energy, steps</div>
              <div className="pick-sub">
                Whoop → Apple Health{lastRecovery ? ` · last row ${fmtDayShort(lastRecovery.date)}` : ''}
              </div>
            </div>
            <Tag label={recoveryFresh.label} tone={recoveryFresh.tone === 'warn' ? 'warn' : recoveryFresh.tone} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
            Cadence is a web app, so it can't read Apple Health directly — an Apple Shortcut automation posts
            the day's numbers here instead. Whoop and Renpho both write into Apple Health, so one Shortcut
            covers everything: recovery, sleep, HRV, weight and body fat.
          </p>
        </Card>

        <Card title="Set up the Apple Shortcut (once, ~5 min)">
          <ol className="sync-steps">
            <li>
              On your iPhone open <strong>Shortcuts</strong> → <strong>+</strong> to create a new shortcut.
              Name it <em>Cadence Health Sync</em>.
            </li>
            <li>
              Add a <strong>Find Health Samples</strong> action for each metric you want: Weight, Body Fat
              Percentage, Active Energy, Steps, Resting Heart Rate, Heart Rate Variability, Sleep. Set each to
              <em> Today</em>, sorted latest-first, limit 1 (Sum for Active Energy and Steps).
            </li>
            <li>
              Add a <strong>Get Contents of URL</strong> action:
              <div className="sync-code-row">
                <code className="sync-code">{ingestUrl}</code>
                <button className="btn btn-secondary btn-sm" onClick={() => copy('url', ingestUrl)}>
                  {copied === 'url' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              Method <strong>POST</strong> · Request Body <strong>JSON</strong>, with a field per metric using
              the Health values from step 2:
              <div className="sync-code-row">
                <pre className="sync-code sync-code-block">{sampleBody}</pre>
                <button className="btn btn-secondary btn-sm" onClick={() => copy('body', sampleBody)}>
                  {copied === 'body' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </li>
            <li>
              Under <strong>Headers</strong> add <code>Authorization</code> = <code>Bearer &lt;your ingest token&gt;</code>.
              The token is the <code>INGEST_TOKEN</code> secret on the health-ingest function (Supabase dashboard →
              Edge Functions). Keep it out of screenshots.
            </li>
            <li>
              In the Shortcuts <strong>Automation</strong> tab: New Automation → <strong>Time of Day</strong> →
              e.g. 09:00 daily → Run Immediately → pick <em>Cadence Health Sync</em>. Add a second run in the
              evening if you want same-day totals to refresh.
            </li>
            <li>
              Run the shortcut once manually — the two rows above should flip to <Tag label="today" tone="good" />.
            </li>
          </ol>
        </Card>

        <Card title="Backfill history (Whoop export / weight CSV)">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
            Going back in time: download a <strong>monthly export</strong> from Whoop (Settings → Data export —
            it arrives as a ZIP; unzip it and import <code>physiological_cycles.csv</code> here), or any weight
            history CSV with date + weight columns. Days are keyed by date, so re-importing overlapping months
            is safe. You can also just send the file to <strong>Kobe</strong> in chat — he has bulk-import
            tools and will map whatever format it's in.
          </p>
          <input
            ref={whoopFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              onCSVPicked('recovery', e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={weightFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              onCSVPicked('body', e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => whoopFileRef.current?.click()}>
              Import Whoop CSV…
            </button>
            <button className="btn btn-secondary" onClick={() => weightFileRef.current?.click()}>
              Import weight CSV…
            </button>
          </div>
          {pending && (
            <div className="cf-callout" style={{ marginTop: 12 }}>
              <strong>{pending.file}</strong>: {fmtNum(pending.rows.length)} days of{' '}
              {pending.kind === 'recovery' ? 'recovery/sleep/strain' : 'weight'} data,{' '}
              {fmtDayShort(pending.from)} – {fmtDayShort(pending.to)}
              {pending.skipped > 0 ? ` (${pending.skipped} unparseable lines skipped)` : ''}.
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" onClick={runImport} disabled={importing}>
                  {importing ? 'Importing…' : `Import ${fmtNum(pending.rows.length)} days`}
                </button>
                <button className="btn btn-ghost" onClick={() => setPending(null)} disabled={importing}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {importMsg && (
            <p style={{ fontSize: 13, marginTop: 10, color: importMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
              {importMsg}
            </p>
          )}
        </Card>

        <Card title="Manual fallback">
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            Anything can still be typed in on the <strong>Body</strong> and <strong>Recovery</strong> screens —
            synced and manual rows live side by side, and each row shows its source. Kobe can also log values
            for you via chat.
          </p>
        </Card>
      </div>
    </>
  );
}
