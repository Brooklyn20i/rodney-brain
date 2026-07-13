import { describe, expect, it } from 'vitest';
import type { CardioSession } from '../types';
import {
  cardioDetailMetrics,
  compactCardioNote,
  formatSessionSubtitle,
  parseCardioNoteMetrics,
} from '../historySummary';

const baseCardio: CardioSession = {
  id: 'cardio-1',
  owner_id: 'owner',
  date: '2026-07-13',
  kind: 'run',
  duration_min: 30,
  distance_km: 4.95,
  avg_hr: 160,
  calories: 437,
  workout_id: 'workout-1',
  notes:
    'Morning run, 5:44am–6:14am. Pace 6:00/km. Elevation gain 133 m. Max HR 193 bpm. Activity strain 13.4. Steps 4,986. HR zones: Z5 179+ bpm 3:40 / 12%; Z4 166–178 bpm 13:21 / 47%; Z3 153–165 bpm 8:28 / 28%; Z2 139–152 bpm 1:48 / 6%; Z1 112–138 bpm 1:29 / 4%; Z0 <112 bpm 0:58 / 3%.',
  created_at: '',
  updated_at: '',
  deleted_at: null,
};

describe('fitness history cardio summaries', () => {
  it('formats cardio-only rows like activity history, not strength history', () => {
    expect(
      formatSessionSubtitle({
        dateLabel: 'Mon, 13 Jul',
        doneSetCount: 0,
        tonnageKg: 0,
        cardio: [baseCardio],
        workoutDurationMin: 0,
      })
    ).toBe('Mon, 13 Jul · Run · 30 min · 4.95 km · 6:00/km · 160 avg HR · 437 kcal');
  });

  it('keeps strength metrics for mixed sessions and does not append zero-minute durations', () => {
    expect(
      formatSessionSubtitle({
        dateLabel: 'Sun, 12 Jul',
        doneSetCount: 12,
        tonnageKg: 7302,
        cardio: [],
        workoutDurationMin: 0,
      })
    ).toBe('Sun, 12 Jul · 12 sets · 7,302kg total');

    expect(
      formatSessionSubtitle({
        dateLabel: 'Sun, 12 Jul',
        doneSetCount: 12,
        tonnageKg: 7302,
        cardio: [baseCardio],
        workoutDurationMin: 30,
      })
    ).toBe('Sun, 12 Jul · 12 sets · 7,302kg total · 30 min · Cardio: 30 min 5 km');
  });

  it('does not mix aggregate cardio totals with a single segment metrics', () => {
    const secondCardio = { ...baseCardio, id: 'cardio-2', duration_min: 12, distance_km: 1.5, avg_hr: 130, calories: 90, notes: '' };

    expect(
      formatSessionSubtitle({
        dateLabel: 'Mon, 13 Jul',
        doneSetCount: 0,
        tonnageKg: 0,
        cardio: [baseCardio, secondCardio],
        workoutDurationMin: 0,
      })
    ).toBe('Mon, 13 Jul · 2 cardio sessions · 42 min · 6.45 km · 527 kcal');
  });

  it('extracts source-note run metrics into structured fields', () => {
    expect(parseCardioNoteMetrics(baseCardio.notes)).toMatchObject({
      pace: '6:00/km',
      maxHr: 193,
      elevationGainM: 133,
      strain: 13.4,
      steps: 4986,
      zones: [
        { zone: 'Z5', duration: '3:40', percent: 12 },
        { zone: 'Z4', duration: '13:21', percent: 47 },
        { zone: 'Z3', duration: '8:28', percent: 28 },
        { zone: 'Z2', duration: '1:48', percent: 6 },
        { zone: 'Z1', duration: '1:29', percent: 4 },
        { zone: 'Z0', duration: '0:58', percent: 3 },
      ],
    });

    expect(cardioDetailMetrics(baseCardio)).toEqual([
      { label: 'Duration', value: '30 min' },
      { label: 'Distance', value: '4.95 km' },
      { label: 'Pace', value: '6:00/km' },
      { label: 'Avg HR', value: '160 bpm' },
      { label: 'Max HR', value: '193 bpm' },
      { label: 'Calories', value: '437' },
      { label: 'Strain', value: '13.4' },
      { label: 'Elevation', value: '133 m' },
      { label: 'Steps', value: '4,986' },
    ]);
  });

  it('keeps human notes but removes repeated metric dumps from the compact note', () => {
    expect(compactCardioNote(baseCardio.notes)).toBe('Morning run, 5:44am–6:14am.');
  });
});
