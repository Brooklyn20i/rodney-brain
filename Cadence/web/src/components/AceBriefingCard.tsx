import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadence } from '../lib/store';
import { isConfigured } from '../lib/supabase';
import { useAceThread, sendAceTurn } from '../lib/aceClient';
import { dailyBriefingPrompt, briefingRequestId } from '../lib/acePrompts';
import { sanitizeHtml } from '../lib/sanitize';
import { todayStr } from '../lib/util';

// Ace's daily briefing. Auto-generates on the first open of the day: the
// request id is deterministic per date (briefingRequestId), and migration
// 0041's unique index makes a duplicate fire server-side a no-op — so the
// client can be relaxed about double-mounting. Subsequent opens just read
// today's reply from the thread.
export function AceBriefingCard({ compact }: { compact?: boolean }) {
  const { workspace, canEdit } = useCadence();
  const { messages, refresh, loaded } = useAceThread();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(!compact);
  const firedRef = useRef(false);

  const today = todayStr();
  const requestId = briefingRequestId(today);

  const { turnAt, reply } = useMemo(() => {
    const idx = messages.findIndex((m) =>
      (m.metadata as Record<string, unknown> | null)?.request_id === requestId);
    if (idx < 0) return { turnAt: -1, reply: null };
    const reply = messages.slice(idx + 1).find((m) => m.sender_type === 'agent' || m.sender_type === 'system') || null;
    return { turnAt: idx, reply };
  }, [messages, requestId]);

  // Fire once per mount, only after the thread has actually loaded and only
  // if today's briefing doesn't exist yet.
  useEffect(() => {
    if (!isConfigured || !canEdit || !loaded || turnAt >= 0 || firedRef.current || !navigator.onLine) return;
    firedRef.current = true;
    void sendAceTurn({ message: dailyBriefingPrompt(today), requestId, workspaceId: workspace?.id, kind: 'briefing' })
      .then(async (r) => {
        if (r.accepted) await refresh();
        else setFailed(true);
      });
  }, [loaded, turnAt, canEdit, requestId, today, workspace?.id, refresh]);

  // Nothing to show in unconfigured/E2E builds — the briefing needs a backend.
  if (!isConfigured) return null;

  const generating = !failed && loaded && (turnAt < 0 || !reply);

  return (
    <div className={`ace-briefing${compact ? ' compact' : ''}`}>
      <button className="ace-briefing-hdr" onClick={() => setOpen((o) => !o)}>
        <span className="ace-briefing-title">◆ Today's briefing</span>
        <span className="ace-briefing-toggle">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ace-briefing-body">
          {reply ? (
            <div className="kobe-bubble-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(reply.body || '') }} />
          ) : failed ? (
            <div className="ace-briefing-muted">
              Couldn't generate today's briefing.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => {
                firedRef.current = false; setFailed(false);
              }}>Try again</button>
            </div>
          ) : generating ? (
            <div className="ace-briefing-muted">
              <span className="ace-thinking-dots"><span /><span /><span /></span>
              &nbsp;Ace is preparing your briefing…
            </div>
          ) : (
            <div className="ace-briefing-muted">Loading…</div>
          )}
        </div>
      )}
    </div>
  );
}
