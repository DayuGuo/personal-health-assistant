import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../../env';
import { cacheKey, getCached } from '../../lib/cache';
import { assertIsoDate, todayLondon } from '../../lib/date';
import { toolErrorResult } from '../../lib/errors';
import type { HealthProvider } from '../../providers/types';
import { FoodLogSchema } from '../../providers/types';

export function registerNutritionReadTools(
  server: McpServer,
  provider: HealthProvider,
  env: Env,
): void {
  server.registerTool(
    'get_food_log',
    {
      title: 'Food log for one day',
      description:
        'Meals and water intake for the day: foods array, nutrition summary (calories/carbs/fat/fiber/protein/sodium/sugar), water total, and—when Fitbit has set one—a calorie goal. The `goals` field is omitted on days with no food entries. Defaults to today (Europe/London). Cached up to 5 minutes; inspect freshness metadata.',
      inputSchema: {
        date: z.string().describe('YYYY-MM-DD. Omit for today (Europe/London).').optional(),
      },
      outputSchema: FoodLogSchema.shape,
    },
    async ({ date }) => {
      try {
        const d = date ?? todayLondon();
        assertIsoDate(d, 'date');
        const food = await getCached(env, cacheKey('get_food_log', { date: d }), () =>
          provider.getFoodLog(d),
        );
        return {
          structuredContent: food,
          content: [{ type: 'text', text: JSON.stringify(food, null, 2) }],
        };
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );
}
