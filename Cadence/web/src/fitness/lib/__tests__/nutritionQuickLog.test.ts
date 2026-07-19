import { describe, expect, it } from 'vitest';
import {
  buildSavedFoodPicker,
  filterSavedFoods,
  mealForHour,
  quickLogFromSavedFood,
  scaleMacros,
} from '../nutritionQuickLog';
import type { NutritionLog, SavedMeal } from '../types';

const base = {
  owner_id: 'o',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

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

function log(extra: Partial<NutritionLog>): NutritionLog {
  return {
    id: extra.id ?? 'log-1',
    owner_id: 'o',
    date: extra.date ?? '2026-07-05',
    meal: extra.meal ?? 'snack',
    name: extra.name ?? 'Protein bar',
    calories: extra.calories ?? 100,
    protein_g: extra.protein_g ?? 10,
    carbs_g: extra.carbs_g ?? 10,
    fat_g: extra.fat_g ?? 2,
    notes: extra.notes ?? '',
    created_at: extra.created_at ?? '2026-07-05T08:00:00Z',
    updated_at: extra.updated_at ?? '2026-07-05T08:00:00Z',
    deleted_at: null,
    ...extra,
  };
}

describe('nutrition quick-log helpers', () => {
  it('scales saved-food macros for fractional and multiple portions', () => {
    expect(scaleMacros(saved({}), 0.5)).toEqual({
      calories: 105,
      protein_g: 7.5,
      carbs_g: 6.5,
      fat_g: 6,
    });
    expect(scaleMacros(saved({}), 2)).toEqual({
      calories: 418,
      protein_g: 30,
      carbs_g: 26,
      fat_g: 24,
    });
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

  it('logs to the meal the caller says is happening NOW, not where the food was first saved', () => {
    const row = quickLogFromSavedFood(saved({ meal: 'breakfast' }), '2026-07-05', 1, 'dinner');
    expect(row.meal).toBe('dinner');
    // Without an override the stored meal still applies.
    expect(quickLogFromSavedFood(saved({ meal: 'breakfast' }), '2026-07-05', 1).meal).toBe('breakfast');
  });

  it('maps the hour of day to a sensible default meal slot', () => {
    expect(mealForHour(7)).toBe('breakfast');
    expect(mealForHour(10)).toBe('breakfast');
    expect(mealForHour(12)).toBe('lunch');
    expect(mealForHour(14)).toBe('lunch');
    expect(mealForHour(16)).toBe('snack');
    expect(mealForHour(19)).toBe('dinner');
    expect(mealForHour(22)).toBe('snack');
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

  it('caps the default picker and prioritises recently logged foods', () => {
    const foods = Array.from({ length: 30 }, (_, i) =>
      saved({
        id: `food-${i}`,
        name: `Saved food ${String(i).padStart(2, '0')}`,
        meal: i % 2 ? 'snack' : 'lunch',
      })
    );
    const model = buildSavedFoodPicker({
      meals: foods,
      logs: [
        log({ name: 'Saved food 20', date: '2026-07-05' }),
        log({ name: 'Saved food 03', date: '2026-07-04' }),
      ],
      query: '',
      limit: 8,
    });

    expect(model.visible).toHaveLength(8);
    expect(model.total).toBe(30);
    expect(model.hasMore).toBe(true);
    expect(model.visible.map((x) => x.id).slice(0, 2)).toEqual(['food-20', 'food-3']);
  });

  it('caps searched picker results and reports the full match count', () => {
    const foods = Array.from({ length: 25 }, (_, i) =>
      saved({ id: `bar-${i}`, name: `Protein bar ${i}` })
    );
    const model = buildSavedFoodPicker({ meals: foods, logs: [], query: 'protein', limit: 10 });

    expect(model.visible).toHaveLength(10);
    expect(model.total).toBe(25);
    expect(model.hasMore).toBe(true);
  });
});
