export type LedgerDirection = 'iOwe' | 'theyOwe';

// The one-tap ledger swap: flip a person-linked task between "I owe them" and
// "they owe me" without recreating it. Maps directly onto the ledger's rule
// (theyOwe ≡ type 'waitingFor'); the parent applies the type change.
export function LedgerDirectionToggle({ personName, direction, onChange }: {
  personName: string;
  direction: LedgerDirection;
  onChange: (d: LedgerDirection) => void;
}) {
  const first = personName.split(' ')[0] || personName;
  return (
    <div className="ledger-dir" role="group" aria-label="Who owes whom">
      <button
        type="button"
        className={`ledger-dir-btn${direction === 'iOwe' ? ' active' : ''}`}
        aria-pressed={direction === 'iOwe'}
        onClick={() => onChange('iOwe')}
      >📥 I owe {first}</button>
      <button
        type="button"
        className={`ledger-dir-btn${direction === 'theyOwe' ? ' active' : ''}`}
        aria-pressed={direction === 'theyOwe'}
        onClick={() => onChange('theyOwe')}
      >📤 {first} owes me</button>
    </div>
  );
}
