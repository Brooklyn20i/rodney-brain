import { MEAL_LABEL } from './util';
import type { NutritionLog, SavedMeal } from './types';

type MacroRow = Pick<SavedMeal, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>;
type NutritionLogDraft = Pick<NutritionLog, 'date' | 'meal' | 'name' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'notes'>;

const roundMacro = (value: number) => Math.round(value * 10) / 10;

export function normalisePortion(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(10, Math.round(n * 10) / 10);
}

export function scaleMacros(row: MacroRow, portion: string | number): Pick<NutritionLogDraft, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'> {
  const qty = normalisePortion(portion);
  return {
    calories: Math.round(Number(row.calories || 0) * qty),
    protein_g: roundMacro(Number(row.protein_g || 0) * qty),
    carbs_g: roundMacro(Number(row.carbs_g || 0) * qty),
    fat_g: roundMacro(Number(row.fat_g || 0) * qty),
  };
}

export function quickLogFromSavedFood(meal: SavedMeal, date: string, portion: string | number): NutritionLogDraft {
  const qty = normalisePortion(portion);
  const scaled = scaleMacros(meal, qty);
  return {
    date,
    meal: meal.meal,
    name: qty === 1 ? meal.name : `${meal.name} × ${qty}`,
    ...scaled,
    notes: ['Quick logged from saved food', meal.notes].filter(Boolean).join(' — '),
  };
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
