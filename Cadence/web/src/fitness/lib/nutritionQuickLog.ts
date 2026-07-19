import { MEAL_LABEL } from './util';
import type { MealType, NutritionLog, SavedMeal } from './types';

type MacroRow = Pick<SavedMeal, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>;
type NutritionLogDraft = Pick<
  NutritionLog,
  'date' | 'meal' | 'name' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'notes'
>;

const roundMacro = (value: number) => Math.round(value * 10) / 10;

export function normalisePortion(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(10, Math.round(n * 10) / 10);
}

export function scaleMacros(
  row: MacroRow,
  portion: string | number
): Pick<NutritionLogDraft, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'> {
  const qty = normalisePortion(portion);
  return {
    calories: Math.round(Number(row.calories || 0) * qty),
    protein_g: roundMacro(Number(row.protein_g || 0) * qty),
    carbs_g: roundMacro(Number(row.carbs_g || 0) * qty),
    fat_g: roundMacro(Number(row.fat_g || 0) * qty),
  };
}

export function quickLogFromSavedFood(
  meal: SavedMeal,
  date: string,
  portion: string | number,
  mealOverride?: MealType
): NutritionLogDraft {
  const qty = normalisePortion(portion);
  const scaled = scaleMacros(meal, qty);
  return {
    date,
    // A saved food's stored meal is just where it was FIRST logged — eggs saved
    // at breakfast get eaten at dinner too, so the caller's meal-for-now wins.
    meal: mealOverride ?? meal.meal,
    name: qty === 1 ? meal.name : `${meal.name} × ${qty}`,
    ...scaled,
    notes: ['Quick logged from saved food', meal.notes].filter(Boolean).join(' — '),
  };
}

/** Default meal slot for the current time of day, so logging "now" needs zero taps. */
export function mealForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'snack';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export function filterSavedFoods(meals: SavedMeal[], query: string): SavedMeal[] {
  const q = query.trim().toLowerCase();
  const sorted = [...meals].sort((a, b) => {
    const mealOrder = a.meal.localeCompare(b.meal);
    return mealOrder || a.name.localeCompare(b.name);
  });
  if (!q) return sorted;
  return sorted.filter((meal) =>
    [meal.name, meal.notes, MEAL_LABEL[meal.meal], String(meal.calories), String(meal.protein_g)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
}

export function normaliseFoodName(name: string): string {
  return name
    .replace(/ × \d+(\.\d+)?$/, '')
    .trim()
    .toLowerCase();
}

function usageByName(logs: NutritionLog[]): Map<string, { count: number; lastDate: string }> {
  const usage = new Map<string, { count: number; lastDate: string }>();
  for (const log of logs) {
    const key = normaliseFoodName(log.name);
    const current = usage.get(key) ?? { count: 0, lastDate: '' };
    usage.set(key, {
      count: current.count + 1,
      lastDate: log.date > current.lastDate ? log.date : current.lastDate,
    });
  }
  return usage;
}

export function buildSavedFoodPicker({
  meals,
  logs,
  query,
  limit = 8,
}: {
  meals: SavedMeal[];
  logs: NutritionLog[];
  query: string;
  limit?: number;
}): { visible: SavedMeal[]; total: number; hasMore: boolean; query: string } {
  const q = query.trim();
  const usage = usageByName(logs);
  const matches = filterSavedFoods(meals, q).sort((a, b) => {
    if (q) return 0;
    const au = usage.get(normaliseFoodName(a.name));
    const bu = usage.get(normaliseFoodName(b.name));
    if (au || bu) {
      const last = (bu?.lastDate ?? '').localeCompare(au?.lastDate ?? '');
      if (last) return last;
      const count = (bu?.count ?? 0) - (au?.count ?? 0);
      if (count) return count;
    }
    const mealOrder = a.meal.localeCompare(b.meal);
    return mealOrder || a.name.localeCompare(b.name);
  });
  const safeLimit = Math.max(1, Math.min(25, Math.round(limit)));
  return {
    visible: matches.slice(0, safeLimit),
    total: matches.length,
    hasMore: matches.length > safeLimit,
    query: q,
  };
}
