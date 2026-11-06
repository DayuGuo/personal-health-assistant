import type { FoodLog, FoodLogEntry, NutritionalValues } from '../types';
import { type CivilDate, civilDateToIso } from './civil';
import type { GoogleClient } from './client';
import { isRecord, num, reconcile } from './reconcile';

const PAGE = 50;

// v4 mealType -> Fitbit mealTypeId.
const MEAL_TYPE_ID: Record<string, number> = {
  BREAKFAST: 1,
  MORNING_SNACK: 2,
  LUNCH: 3,
  AFTERNOON_SNACK: 4,
  DINNER: 5,
  ANYTIME: 7,
};
// v4 nutrient enum -> Fitbit NutritionalValues field (grams unless noted).
const NUTRIENT_FIELD: Record<string, keyof NutritionalValues> = {
  PROTEIN: 'protein',
  SODIUM: 'sodium', // grams -> mg below
  SUGAR: 'sugar',
  FIBER: 'fiber',
};

function idFromName(name: unknown): number {
  if (typeof name !== 'string') return 0;
  const n = Number(name.split('/').pop());
  return Number.isFinite(n) ? n : 0;
}

function nutrients(n: Record<string, unknown>): NutritionalValues {
  const out: NutritionalValues = {
    calories: isRecord(n.energy) ? num(n.energy.kcal) : undefined,
    carbs: isRecord(n.totalCarbohydrate) ? num(n.totalCarbohydrate.grams) : undefined,
    fat: isRecord(n.totalFat) ? num(n.totalFat.grams) : undefined,
  };
  for (const item of Array.isArray(n.nutrients) ? n.nutrients : []) {
    if (!isRecord(item)) continue;
    const field = NUTRIENT_FIELD[String(item.nutrient)];
    const grams = isRecord(item.quantity) ? num(item.quantity.grams) : undefined;
    if (!field || grams === undefined) continue;
    out[field] = field === 'sodium' ? Math.round(grams * 1000) : grams; // sodium g -> mg
  }
  return out;
}

function mapFood(dp: Record<string, unknown>): { entry: FoodLogEntry; date?: string } | undefined {
  const n = dp.nutritionLog;
  if (!isRecord(n)) return undefined;
  const iv = isRecord(n.interval) ? n.interval : undefined;
  const civilDate = iv && isRecord(iv.civilStartTime) ? iv.civilStartTime.date : undefined;
  const date = isRecord(civilDate) ? civilDateToIso(civilDate as unknown as CivilDate) : undefined;
  const nv = nutrients(n);
  const serving = isRecord(n.serving) ? n.serving : undefined;
  const name =
    typeof n.foodDisplayName === 'string' ? n.foodDisplayName : (n.name as string | undefined);

  return {
    date,
    entry: {
      logId: idFromName(dp.dataPointName),
      loggedFood: {
        name,
        mealTypeId: MEAL_TYPE_ID[String(n.mealType)],
        amount: serving ? num(serving.amount) : undefined,
        calories: nv.calories,
        unit: serving
          ? { name: serving.foodMeasurementUnitDisplayName as string | undefined }
          : undefined,
      },
      nutritionalValues: nv,
      logDate: date,
    },
  };
}

function sumField(entries: FoodLogEntry[], f: keyof NutritionalValues): number | undefined {
  const vals = entries
    .map((e) => e.nutritionalValues?.[f])
    .filter((v): v is number => v !== undefined);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : undefined;
}

export async function getFoodLog(
  client: Pick<GoogleClient, 'requestJson'>,
  date: string,
): Promise<FoodLog> {
  const dps = await reconcile(client, 'nutrition-log', PAGE);
  const foods = dps
    .map(mapFood)
    .filter((x): x is { entry: FoodLogEntry; date?: string } => x !== undefined && x.date === date)
    .map((x) => x.entry);

  return {
    foods,
    summary: {
      calories: sumField(foods, 'calories'),
      carbs: sumField(foods, 'carbs'),
      fat: sumField(foods, 'fat'),
      protein: sumField(foods, 'protein'),
    },
  };
}
