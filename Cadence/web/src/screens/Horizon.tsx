import { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { useMeetingDates, getNextMeeting } from '../lib/meetings';
import { todayStr, addDaysStr, fmtWeekDM, fmtWeekDMY } from '../lib/util';
import {
  getHorizonMarkers, horizonBucket,
} from '../lib/selectors';
import type { HorizonMarker, HorizonBucket } from '../lib/selectors';
import { ScreenHeader } from '../components/bits';

const KIND_ICON: Record<string, string> = {
  milestone: '◇', target: '▤', meeting: '👤',
};

const SEVERITY_COLOR: Record<string, string> = {
  red: 'var(--red)', amber: 'var(--orange)', green: 'var(--green)', neutral: 'var(--text3)',
};

const BUCKETS: { key: HorizonBucket; label: string }[] = [
  { key: 'overdue', label: 'Slipped' },
  { key: 'week', label: 'This week' },
  { key: 'fortnight', label: 'Next 3 weeks' },
  { key: 'month', label: 'This month+' },
  { key: 'later', label: 'On the horizon' },
];

const fmtMarkerDate = (iso: string) => {
  if (iso === todayStr()) return 'Today';
  if (iso === addDaysStr(1)) return 'Tomorrow';
  // Show the year only for far-off markers to keep near dates compact.
  return iso > addDaysStr(45) ? fmtWeekDMY(iso) : fmtWeekDM(iso);
};

function HorizonRow({ marker, onClick }: { marker: HorizonMarker; onClick: () => void }) {
  return (
    <button className="horizon-row" onClick={onClick}>
      <span className="horizon-dot" style={{ background: SEVERITY_COLOR[marker.severity] }} />
      <span className="horizon-kind" title={marker.kind}>{KIND_ICON[marker.kind]}</span>
      <div className="horizon-row-main">
        <div className="horizon-row-title">{marker.title}</div>
        <div className="horizon-row-sub">{marker.subtitle}</div>
      </div>
      <span className={`horizon-date${marker.severity === 'red' ? ' red' : ''}`}>
        {fmtMarkerDate(marker.date)}
      </span>
    </button>
  );
}

export function Horizon({ onMenu, onNavigate }: {
  onMenu?: () => void;
  onNavigate: (screen: string, entityId?: string) => void;
}) {
  const { data } = useCadence();
  const { dates } = useMeetingDates();

  const people = useMemo(
    () => data.people.filter((p) => !p.type || p.type === 'person'),
    [data.people],
  );

  const grouped = useMemo(() => {
    const today = todayStr();
    const meetings = people
      .map((p) => ({ p, date: getNextMeeting(p.id, data.notes, dates) }))
      .filter((x) => x.date && x.date >= today)
      .map((x) => ({ personId: x.p.id, name: x.p.name, date: x.date as string }));

    const markers = getHorizonMarkers(data.projects, data.milestones, meetings);

    const byBucket: Record<HorizonBucket, HorizonMarker[]> = {
      overdue: [], week: [], fortnight: [], month: [], later: [],
    };
    for (const m of markers) byBucket[horizonBucket(m.date)].push(m);
    return byBucket;
  }, [people, data.projects, data.milestones, data.notes, dates]);

  const total = useMemo(
    () => BUCKETS.reduce((n, b) => n + grouped[b.key].length, 0),
    [grouped],
  );

  return (
    <>
      <ScreenHeader title="Horizon" subtitle="Milestones, targets and 1:1s ahead" onMenu={onMenu} />
      <div className="screen-content">
        {total === 0 ? (
          <p style={{ color: 'var(--text3)', padding: 16 }}>
            No upcoming milestones, project targets or 1:1s. Set target dates and milestones on your
            projects to see them here.
          </p>
        ) : (
          BUCKETS.map(({ key, label }) =>
            grouped[key].length === 0 ? null : (
              <div key={key} className={`horizon-bucket${key === 'overdue' ? ' overdue' : ''}`}>
                <div className="horizon-bucket-hdr">
                  <span className="horizon-bucket-label">{label}</span>
                  <span className="horizon-bucket-count">{grouped[key].length}</span>
                </div>
                <div className="horizon-bucket-body">
                  {grouped[key].map((m) => (
                    <HorizonRow key={m.id} marker={m} onClick={() => onNavigate(m.nav, m.refId)} />
                  ))}
                </div>
              </div>
            )
          )
        )}
      </div>
    </>
  );
}
