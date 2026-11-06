import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import type { Env } from '../../env';
import type { HealthProvider } from '../../providers/types';
import {
  getOverview,
  OverviewSchema,
  DataStatusViewSchema,
  dataStatusView,
} from '../../health/overview';
import { OnboardingInput, OnboardingSchema, onboardingGuide } from '../../health/onboarding';
import type { DataStatus } from '../../lib/data-status';
import { toolErrorResult } from '../../lib/errors';
export function registerExperienceTools(
  server: McpServer,
  provider: HealthProvider,
  env: Env,
  probe?: () => Promise<DataStatus>,
) {
  const dateInput = {
    end_date: z
      .string()
      .describe(
        'YYYY-MM-DD, yesterday or earlier in Europe/London; defaults to yesterday. Uses 7 complete recent calendar days and the preceding 28 days.',
      )
      .optional(),
  };
  const result = (value: Record<string, unknown>) => ({
    structuredContent: value,
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  });
  server.registerTool(
    'get_health_overview',
    {
      title: 'Health overview / 健康概览',
      description:
        'Use first for a weekly overview, recent sleep/activity trends or comparison to personal history. Deterministic summaries of steps, staged sleep, resting HR, HRV and SpO2, with valid days, source families, evidence IDs, exclusions and per-metric failures. Today is excluded. No recovery score, diagnosis or gap filling.',
      inputSchema: dateInput,
      outputSchema: OverviewSchema.shape,
    },
    async ({ end_date }) => {
      try {
        return result(await getOverview(provider, env, end_date, probe));
      } catch (e) {
        return toolErrorResult(e);
      }
    },
  );
  server.registerTool(
    'get_data_status',
    {
      title: 'Data and authorization status / 数据状态',
      description:
        'Use to troubleshoot missing, delayed, cached or inaccessible records without displaying measurements. Performs a live Google authorization probe and reports latest record dates, coverage, API fetch/cache timestamps and actionable states. Device sync time is unknown. Existing daily sync is untouched.',
      inputSchema: dateInput,
      outputSchema: DataStatusViewSchema.shape,
    },
    async ({ end_date }) => {
      try {
        return result(dataStatusView(await getOverview(provider, env, end_date, probe)));
      } catch (e) {
        return toolErrorResult(e);
      }
    },
  );
  server.registerTool(
    'get_onboarding_guide',
    {
      title: 'Start using Personal Health / 首次使用引导',
      description:
        'Use when the owner asks to get started. Check data availability, then ask exactly the returned next_question: focus, review time budget, review preference. Carry previous answers in arguments on each call. Only one question per turn. This read-only tool does not persist answers, save goals or create schedules.',
      inputSchema: OnboardingInput,
      outputSchema: OnboardingSchema.shape,
    },
    async (answers) => {
      try {
        return result(onboardingGuide(await getOverview(provider, env, undefined, probe), answers));
      } catch (e) {
        return toolErrorResult(e);
      }
    },
  );
}
