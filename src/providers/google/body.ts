import type { BodyLog, WeightLog } from '../types';
import { type CivilDate, civilDateToIso } from './civil';
import type { GoogleClient } from './client';
import { inRange, isRecord, num, reconcile } from './reconcile';

const PAGE = 90;

function mapWeight(dp: Record<string, unknown>): WeightLog | undefined {
  const w = dp.weight;
  if (!isRecord(w) || !isRecord(w.sampleTime)) return undefined;
  const civil = isRecord(w.sampleTime.civilTime) ? w.sampleTime.civilTime.date : undefined;
  const grams = num(w.weightGrams);
  if (!isRecord(civil) || grams === undefined) return undefined;
  return {
    date: civilDateToIso(civil as unknown as CivilDate),
    weight: Math.round((grams / 1000) * 100) / 100, // grams -> kg
  };
}

/** Body log: weight from v4 `weight`. body-fat has no data on the account yet. */
export async function getBodyLog(
  client: Pick<GoogleClient, 'requestJson'>,
  start: string,
  end: string,
): Promise<BodyLog> {
  const dps = await reconcile(client, 'weight', PAGE);
  const weight = dps
    .map(mapWeight)
    .filter((w): w is WeightLog => w !== undefined)
    .filter((w) => inRange(w.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { weight, fat: [] };
}
