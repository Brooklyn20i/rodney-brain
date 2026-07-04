import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { fmtDayShort, todayISO } from '../lib/util';

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
