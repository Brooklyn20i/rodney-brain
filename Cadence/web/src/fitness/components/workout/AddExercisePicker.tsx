// Search-and-add an exercise to the active session. Owns its own search /
// selection state; the actual seeding (or cardio redirect) is the screen's
// `onAdd`, which resolves before the picker clears itself.

import { useState } from 'react';
import { Card } from '../bits';
import { isCardioTracking, looksLikeCardio, slotTracking } from '../../lib/tracking';
import type { Exercise } from '../../lib/types';

export function AddExercisePicker({
  wrap,
  exercises,
  inSessionIds,
  isBusy,
  onAdd,
}: {
  wrap: 'card' | 'plain';
  exercises: Exercise[];
  inSessionIds: Set<string>;
  isBusy: (exerciseId: string) => boolean;
  onAdd: (exerciseId: string) => Promise<void>;
}) {
  const [exSearch, setExSearch] = useState('');
  const [addExId, setAddExId] = useState('');
  const q = exSearch.trim().toLowerCase();
  const matches = q
    ? [...exercises]
        .filter((e) => (e.name.toLowerCase().includes(q) || e.muscle_group.includes(q)) && !isCardioTracking(slotTracking(null, e)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8)
    : [];
  const submit = async () => {
    if (!addExId) return;
    await onAdd(addExId);
    setAddExId('');
    setExSearch('');
  };
  const control = (
    <div className="wo-add-ex">
      <input
        type="search"
        value={exSearch}
        placeholder="Search exercises… e.g. incline press"
        onChange={(e) => {
          setExSearch(e.target.value);
          setAddExId('');
        }}
      />
      {q && looksLikeCardio(q) && (
        <p className="wo-cardio-hint" style={{ margin: '6px 0 0' }}>
          🏃 Running, rowing & riding go in the <strong>Cardio</strong> block below — they track
          time &amp; distance, not weight.
        </p>
      )}
      {q && matches.length === 0 && !looksLikeCardio(q) && (
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 0' }}>
          No match — add it on the Exercises screen first.
        </p>
      )}
      {matches.map((e) => (
        <button
          key={e.id}
          className="wo-add-ex-row"
          onClick={() => {
            setAddExId(e.id);
            setExSearch(e.name);
          }}
          aria-pressed={addExId === e.id}
        >
          <span>{e.name}</span>
          <span className="wo-add-ex-meta">
            {e.muscle_group.replace('_', ' ')}
            {inSessionIds.has(e.id) ? ' · in session' : ''}
          </span>
        </button>
      ))}
      {addExId && (
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={submit} disabled={isBusy(addExId)}>
          Add to session
        </button>
      )}
    </div>
  );
  if (wrap === 'plain') {
    return (
      <details className="gym-add">
        <summary>+ Add an exercise to this session</summary>
        <div className="gym-add-body">{control}</div>
      </details>
    );
  }
  return (
    <Card title="Add exercise">
      {control}
      {exercises.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
          Library is empty — add exercises on the Exercises screen first.
        </p>
      )}
    </Card>
  );
}
