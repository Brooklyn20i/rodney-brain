import type { CardioKind, CardioSession } from './types';
import { fmtNum } from './util';

export type HeartRateZoneSummary = {
  zone: string;
  duration: string;
  percent: number;
};

export type ParsedCardioNoteMetrics = {
  pace?: string;
  maxHr?: number;
  elevationGainM?: number;
  strain?: number;
  steps?: number;
  zones: HeartRateZoneSummary[];
};

export type CardioDetailMetric = {
  label: string;
  value: string;
};

export const CARDIO_KIND_LABEL: Record<CardioKind, string> = {
  run: 'Run',
  bike: 'Ride',
  row: 'Row',
  swim: 'Swim',
  walk: 'Walk',
  hike: 'Hike',
  stairs: 'Stairs',
  elliptical: 'Elliptical',
  hiit: 'HIIT',
  other: 'Cardio',
};

const positive = (value: unknown) => Number(value || 0) > 0;

export function formatDistance(km: number, decimals = 2) {
  if (!positive(km)) return '';
  return `${fmtNum(Number(km), decimals)} km`;
}

export function formatPace(durationMin: number, distanceKm: number) {
  if (!positive(durationMin) || !positive(distanceKm)) return '';
  const totalSecondsPerKm = Math.round((Number(durationMin) * 60) / Number(distanceKm));
  const mins = Math.floor(totalSecondsPerKm / 60);
  const secs = String(totalSecondsPerKm % 60).padStart(2, '0');
  return `${mins}:${secs}/km`;
}

export function parseCardioNoteMetrics(notes = ''): ParsedCardioNoteMetrics {
  const pace = notes.match(/\bpace\s+([0-9]+:[0-9]{2}\/?km)\b/i)?.[1] || notes.match(/\(([0-9]+:[0-9]{2}\/?km)\)/i)?.[1];
  const maxHr = notes.match(/\bmax\s*HR\s+(\d+)\s*bpm\b/i)?.[1];
  const elevationGainM = notes.match(/\belevation\s+gain\s+([\d,]+)\s*m\b/i)?.[1];
  const strain = notes.match(/\b(?:activity\s+)?strain\s+([\d.]+)\b/i)?.[1];
  const steps = notes.match(/\bsteps\s+([\d,]+)\b/i)?.[1] || notes.match(/\b([\d,]+)\s+steps\b/i)?.[1];
  const zonesByName = new Map<string, HeartRateZoneSummary>();

  for (const match of notes.matchAll(/\b(Z[0-5])\b(?:\s+[<\d][^;,.()]*)?\s+(\d+:\d{2})\s*(?:\/\s*|\()(\d+)%/gi)) {
    const zone = match[1].toUpperCase();
    if (!zonesByName.has(zone)) {
      zonesByName.set(zone, { zone, duration: match[2], percent: Number(match[3]) });
    }
  }

  return {
    pace: pace ? pace.replace('/km', '/km') : undefined,
    maxHr: maxHr ? Number(maxHr) : undefined,
    elevationGainM: elevationGainM ? Number(elevationGainM.replace(/,/g, '')) : undefined,
    strain: strain ? Number(strain) : undefined,
    steps: steps ? Number(steps.replace(/,/g, '')) : undefined,
    zones: [...zonesByName.values()].sort((a, b) => Number(b.zone.slice(1)) - Number(a.zone.slice(1))),
  };
}

export function cardioPrimaryParts(cardio: CardioSession) {
  const parsed = parseCardioNoteMetrics(cardio.notes || '');
  const pace = parsed.pace || formatPace(Number(cardio.duration_min || 0), Number(cardio.distance_km || 0));
  return [
    CARDIO_KIND_LABEL[cardio.kind] || 'Cardio',
    positive(cardio.duration_min) ? `${fmtNum(Number(cardio.duration_min))} min` : '',
    formatDistance(Number(cardio.distance_km || 0)),
    pace,
    positive(cardio.avg_hr) ? `${fmtNum(Number(cardio.avg_hr))} avg HR` : '',
    positive(cardio.calories) ? `${fmtNum(Number(cardio.calories))} kcal` : '',
  ].filter(Boolean);
}

export function cardioDetailMetrics(cardio: CardioSession): CardioDetailMetric[] {
  const parsed = parseCardioNoteMetrics(cardio.notes || '');
  const pace = parsed.pace || formatPace(Number(cardio.duration_min || 0), Number(cardio.distance_km || 0));

  return [
    positive(cardio.duration_min) ? { label: 'Duration', value: `${fmtNum(Number(cardio.duration_min))} min` } : null,
    positive(cardio.distance_km) ? { label: 'Distance', value: formatDistance(Number(cardio.distance_km || 0)) } : null,
    pace ? { label: 'Pace', value: pace } : null,
    positive(cardio.avg_hr) ? { label: 'Avg HR', value: `${fmtNum(Number(cardio.avg_hr))} bpm` } : null,
    parsed.maxHr ? { label: 'Max HR', value: `${fmtNum(parsed.maxHr)} bpm` } : null,
    positive(cardio.calories) ? { label: 'Calories', value: fmtNum(Number(cardio.calories)) } : null,
    parsed.strain ? { label: 'Strain', value: fmtNum(parsed.strain, 1) } : null,
    parsed.elevationGainM ? { label: 'Elevation', value: `${fmtNum(parsed.elevationGainM)} m` } : null,
    parsed.steps ? { label: 'Steps', value: fmtNum(parsed.steps) } : null,
  ].filter((metric): metric is CardioDetailMetric => Boolean(metric));
}

export function compactCardioNote(notes = '') {
  return notes
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/^(pace|elevation gain|max HR|activity strain|steps|HR zones|run details logged)/i.test(sentence))
    .join(' ')
    .replace(/\s*HR zones:.*$/i, '')
    .trim();
}

export function formatSessionSubtitle({
  dateLabel,
  doneSetCount,
  tonnageKg,
  cardio,
  workoutDurationMin,
}: {
  dateLabel: string;
  doneSetCount: number;
  tonnageKg: number;
  cardio: CardioSession[];
  workoutDurationMin: number | null;
}) {
  const hasCardio = cardio.length > 0;
  const hasStrength = doneSetCount > 0;
  const cardioDuration = cardio.reduce((sum, c) => sum + Number(c.duration_min || 0), 0);
  const cardioDistance = cardio.reduce((sum, c) => sum + Number(c.distance_km || 0), 0);
  const firstCardio = cardio[0];
  const parts = [dateLabel];

  if (hasStrength) {
    parts.push(`${doneSetCount} sets`, `${fmtNum(tonnageKg)}kg total`);
    if (workoutDurationMin && workoutDurationMin > 0) parts.push(`${fmtNum(workoutDurationMin)} min`);
    if (hasCardio) {
      parts.push(
        [
          'Cardio:',
          cardioDuration > 0 ? `${fmtNum(cardioDuration)} min` : '',
          cardioDistance > 0 ? formatDistance(cardioDistance, 1) : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
    return parts.join(' · ');
  }

  if (hasCardio && firstCardio) {
    if (cardio.length > 1) {
      const cardioCalories = cardio.reduce((sum, c) => sum + Number(c.calories || 0), 0);
      parts.push(`${cardio.length} cardio sessions`);
      if (cardioDuration > 0) parts.push(`${fmtNum(cardioDuration)} min`);
      if (cardioDistance > 0) parts.push(formatDistance(cardioDistance));
      if (cardioCalories > 0) parts.push(`${fmtNum(cardioCalories)} kcal`);
      return parts.join(' · ');
    }

    const parsed = parseCardioNoteMetrics(firstCardio.notes || '');
    const pace = parsed.pace || formatPace(cardioDuration, cardioDistance);
    parts.push(CARDIO_KIND_LABEL[firstCardio.kind] || 'Cardio');
    if (cardioDuration > 0) parts.push(`${fmtNum(cardioDuration)} min`);
    if (cardioDistance > 0) parts.push(formatDistance(cardioDistance));
    if (pace) parts.push(pace);
    if (firstCardio.avg_hr > 0) parts.push(`${fmtNum(Number(firstCardio.avg_hr))} avg HR`);
    if (firstCardio.calories > 0) parts.push(`${fmtNum(Number(firstCardio.calories))} kcal`);
    return parts.join(' · ');
  }

  parts.push(`${doneSetCount} sets`);
  if (workoutDurationMin && workoutDurationMin > 0) parts.push(`${fmtNum(workoutDurationMin)} min`);
  return parts.join(' · ');
}
