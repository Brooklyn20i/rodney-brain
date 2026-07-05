import { describe, expect, it } from 'vitest';
import { filterSavedFoods, quickLogFromSavedFood, scaleMacros } from '../nutritionQuickLog';
import type { SavedMeal } from '../types';

const base = { owner_id: 'o', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null };

function saved(extra: Partial<SavedMeal>): SavedMeal {
  return {
    id: extra.id ?? 'meal-1',
    name: extra.name ?? "N!CK'S Protein Bar Hazelnut Chocolate",
    meal: extra.meal ?? 'snack',
    calories: extra.calories ?? 209,
    protein_g: extra.protein_g ?? 15,
    carbs_g: extra.carbs_g ?? 13,
    fat_g: extra.fat_g ?? 12,
    notes: extra.notes ?? 'Serving: 1 bar / 50g. Source: product label.',
    ...base,
    ...extra,
  };
}

describe('nutrition quick-log helpers', () => {
  it('scales saved-food macros for fractional and multiple portions', () => {
    expect(scaleMacros(saved({}), 0.5)).toEqual({ calories: 105, protein_g: 7.5, carbs_g: 6.5, fat_g: 6 });
    expect(scaleMacros(saved({}), 2)).toEqual({ calories: 418, protein_g: 30, carbs_g: 26, fat_g: 24 });
  });

  it('builds a dated nutrition log row from a saved food and quantity', () => {
    const row = quickLogFromSavedFood(saved({}), '2026-07-05', 1.5);
    expect(row).toMatchObject({
      date: '2026-07-05',
      meal: 'snack',
      name: "N!CK'S Protein Bar Hazelnut Chocolate × 1.5",
      calories: 314,
      protein_g: 22.5,
      carbs_g: 19.5,
      fat_g: 18,
    });
    expect(row.notes).toContain('Quick logged from saved food');
  });

  it('filters saved foods by name, meal label and notes', () => {
    const foods = [
      saved({ id: 'protein', name: 'Protein bar', meal: 'snack', notes: 'NICKS hazelnut 50g' }),
      saved({ id: 'yoghurt', name: 'Greek yoghurt', meal: 'breakfast', notes: 'Chobani' }),
    ];
    expect(filterSavedFoods(foods, 'hazelnut').map((x) => x.id)).toEqual(['protein']);
    expect(filterSavedFoods(foods, 'breakfast').map((x) => x.id)).toEqual(['yoghurt']);
    expect(filterSavedFoods(foods, '').map((x) => x.id)).toEqual(['yoghurt', 'protein']);
  });
});
