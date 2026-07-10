// Shared stat tile — the bordered number-over-label unit used as clickable
// filters on the Task Hub and as compact summary tiles elsewhere. One
// component so tone colours and active states can't drift per screen.
export type StatTone = 'default' | 'red' | 'orange' | 'green';

export function StatTile({ num, label, tone = 'default', active, onClick }: {
  num: number | string;
  label: string;
  tone?: StatTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const toneCls = tone === 'default' ? '' : ` ${tone}`;
  const body = (
    <>
      <span className={`hub-stat-num${toneCls}`}>{num}</span>
      <span className="hub-stat-lbl">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button className={`hub-stat${active ? ' on' : ''}`} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className="hub-stat">{body}</div>;
}
