import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { supabase } from '../../lib/supabase';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { fmtDayShort, fmtNum, todayISO } from '../lib/util';
import { parseWeightCSV, parseWhoopCSV, type BodyImportRow, type RecoveryImportRow } from '../lib/csvImport';
import type { WhoopConnection } from '../lib/types';
import { getWhoopConnection, whoopConnect, whoopDisconnect, whoopSyncNow } from '../lib/whoopApi';

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

  // ── Native WHOOP API connection ────────────────────────────────────────
  const [whoop, setWhoop] = useState<WhoopConnection | null>(null);
  const [whoopLoaded, setWhoopLoaded] = useState(false);
  const [whoopBusy, setWhoopBusy] = useState(false);
  const [whoopMsg, setWhoopMsg] = useState('');

  const refreshWhoop = async () => {
    try {
      setWhoop(await getWhoopConnection());
    } catch {
      // status is best-effort; leave prior value
    } finally {
      setWhoopLoaded(true);
    }
  };

  // Load status on mount, react to the OAuth redirect banner, and keep the
  // card live while a sync runs server-side (realtime on whoop_connection).
  useEffect(() => {
    refreshWhoop();
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('whoop');
    if (outcome === 'connected') setWhoopMsg('✓ WHOOP connected — pulling your recent recovery…');
    else if (outcome === 'error') setWhoopMsg(`WHOOP connect failed: ${params.get('reason') || 'unknown error'}`);
    if (outcome) {
      params.delete('whoop');
      params.delete('reason');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    const channel = supabase
      .channel('whoop_connection_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'fitness', table: 'whoop_connection' },
        () => refreshWhoop(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onConnectWhoop = async () => {
    setWhoopBusy(true);
    setWhoopMsg('');
    try {
      await whoopConnect(window.location.origin + window.location.pathname);
      // whoopConnect navigates away on success; if we're still here it threw.
    } catch (e) {
      setWhoopMsg(e instanceof Error ? e.message : 'Could not start WHOOP connect.');
      setWhoopBusy(false);
    }
  };

  const onSyncWhoop = async () => {
    setWhoopBusy(true);
    setWhoopMsg('');
    try {
      const res = await whoopSyncNow(14);
      setWhoopMsg(res.ok ? `✓ Synced ${res.days_written ?? 0} day(s) from WHOOP.` : `Sync failed: ${res.error}`);
      await refreshWhoop();
    } catch (e) {
      setWhoopMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setWhoopBusy(false);
    }
  };

  const onDisconnectWhoop = async () => {
    if (!window.confirm('Disconnect WHOOP? Synced history stays; new data stops until you reconnect.')) return;
    setWhoopBusy(true);
    setWhoopMsg('');
    try {
      await whoopDisconnect();
      setWhoop(null);
      setWhoopMsg('WHOOP disconnected.');
    } catch (e) {
      setWhoopMsg(e instanceof Error ? e.message : 'Disconnect failed.');
    } finally {
      setWhoopBusy(false);
    }
  };

  const whoopSyncFresh = freshness(
    whoop?.last_sync_at ? { date: whoop.last_sync_at.slice(0, 10) } : null,
  );

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
      <ScreenHeader title="Sync" subtitle="WHOOP via API · Renpho via Apple Health." onMenu={onMenu} />
      <div className="screen-content">
        <Card title="WHOOP (direct API)">
          {!whoopLoaded ? (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>Checking connection…</p>
          ) : whoop ? (
            <>
              <div className="pick-row">
                <div className="pick-main">
                  <div className="pick-title">Recovery, strain & sleep</div>
                  <div className="pick-sub">
                    Connected{whoop.whoop_user_id ? ` · WHOOP user ${whoop.whoop_user_id}` : ''}
                    {whoop.last_sync_at ? ` · last sync ${fmtDayShort(whoop.last_sync_at.slice(0, 10))}` : ' · not synced yet'}
                  </div>
                </div>
                <Tag
                  label={whoop.last_sync_status === 'error' ? 'error' : whoopSyncFresh.label}
                  tone={whoop.last_sync_status === 'error' ? 'bad' : whoopSyncFresh.tone === 'warn' ? 'warn' : whoopSyncFresh.tone}
                />
              </div>
              {whoop.last_sync_status === 'error' && whoop.last_sync_error && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                  Last sync error: {whoop.last_sync_error}
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                Recovery, strain, HRV, resting HR and sleep pull straight from WHOOP into the Recovery screen
                (source <code>whoop</code>). An hourly job keeps it fresh; use Sync now for an immediate pull.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn btn-primary" onClick={onSyncWhoop} disabled={whoopBusy}>
                  {whoopBusy ? 'Working…' : 'Sync now'}
                </button>
                <button className="btn btn-ghost" onClick={onDisconnectWhoop} disabled={whoopBusy}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
                Connect WHOOP once and Cadence pulls your recovery, strain, HRV, resting HR and sleep directly
                from the WHOOP API — no phone, no Shortcut. You'll approve read-only access on WHOOP's site and
                come straight back here.
              </p>
              <button className="btn btn-primary" onClick={onConnectWhoop} disabled={whoopBusy}>
                {whoopBusy ? 'Starting…' : 'Connect WHOOP'}
              </button>
            </>
          )}
          {whoopMsg && (
            <p style={{ fontSize: 13, marginTop: 10, color: whoopMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
              {whoopMsg}
            </p>
          )}
        </Card>

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
              <div className="pick-title">Recovery, sleep, strain</div>
              <div className="pick-sub">
                {whoop ? 'WHOOP → direct API' : 'WHOOP → API (not connected)'}
                {lastRecovery ? ` · last row ${fmtDayShort(lastRecovery.date)}` : ''}
              </div>
            </div>
            <Tag label={recoveryFresh.label} tone={recoveryFresh.tone === 'warn' ? 'warn' : recoveryFresh.tone} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
            Recovery, strain, HRV and sleep now come straight from the WHOOP API (above). Weight and body fat
            come from your Renpho scale via Apple Health — Cadence is a web app and can't read Apple Health
            directly, so an Apple Shortcut posts those numbers to the endpoint below. The Shortcut can still
            carry recovery too if you'd rather not connect WHOOP directly.
          </p>
        </Card>

        <Card title="Renpho weight via Apple Shortcut (once, ~5 min)">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
            Renpho has no public API, so its weight and body-fat readings come through Apple Health. Renpho
            writes to Health automatically; this Shortcut forwards the day's numbers to Cadence. Include the
            recovery metrics too if you'd like a Health-based fallback for WHOOP.
          </p>
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
