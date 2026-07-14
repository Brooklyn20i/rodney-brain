import { LedgerDirectionToggle, type LedgerDirection } from './LedgerDirectionToggle';

// "Who has the ball" — a task can involve several people, but at any moment it
// sits between me and exactly ONE counterparty, in one direction. Handoffs are
// one tap: pick the person (from the task's linked people), pick the
// direction. The parent persists the change and logs it into the task's
// updates thread, so the baton's history is always on the record.
export interface BallState { counterpartyId: string; direction: LedgerDirection }

export function BallControl({ people, counterpartyId, direction, onChange }: {
  people: { id: string; name: string }[];   // the task's linked people
  counterpartyId: string | null;            // current holder (person_id)
  direction: LedgerDirection;
  onChange: (next: BallState) => void;
}) {
  if (people.length === 0) return null;
  const current = people.find((p) => p.id === counterpartyId) || people[0];

  return (
    <div className="ball-control">
      {people.length > 1 && (
        <div className="ball-people" role="group" aria-label="Ball is with">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ball-person${p.id === current.id ? ' active' : ''}`}
              aria-pressed={p.id === current.id}
              title={`Pass the ball: this now sits between me and ${p.name}`}
              onClick={() => { if (p.id !== current.id) onChange({ counterpartyId: p.id, direction }); }}
            >{p.name.split(' ')[0]}</button>
          ))}
        </div>
      )}
      <LedgerDirectionToggle
        personName={current.name}
        direction={direction}
        onChange={(d) => { if (d !== direction || current.id !== counterpartyId) onChange({ counterpartyId: current.id, direction: d }); }}
      />
    </div>
  );
}
