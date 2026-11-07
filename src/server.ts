import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from './env';
import { GoogleHealthProvider } from './providers/google';
import { registerAllTools } from './tools';
import { registerExperienceTools } from './tools/read/experience';
import type { HealthProvider } from './providers/types';
import type { DataStatus } from './lib/data-status';
export function buildServer(
  env: Env,
  options: { provider?: HealthProvider; probe?: () => Promise<DataStatus> } = {},
): McpServer {
  const server = new McpServer(
    { name: 'personal-health-assistant', version: '0.4.1' },
    {
      instructions:
        'Start with get_health_overview for trends, get_data_status for troubleshooting, or get_onboarding_guide for first use. Ask only the returned next_question; carry previous answers in arguments, never claim they were saved. Read-only: no goals, reminders or schedules are created. Cite metric evidence IDs, record dates, source families, coverage and cache/API timestamps. Missing is not zero; use complete days and the same source/method for comparisons. Device sync time is unknown. For last night’s sleep, use get_sleep for its wake date (possibly today); the overview excludes today. Explain one finding with evidence, uncertainty and an optional next step; no diagnosis or invented recovery score. Daily archive and proactive scheduling are separate opt-in capabilities.',
    },
  );
  const original = server.registerTool.bind(server);
  // Shared metadata, with real authentication enforced before every MCP request.
  server.registerTool = ((name: string, config: any, handler: any) =>
    original(
      name,
      {
        ...config,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        _meta: { ...config._meta, securitySchemes: [{ type: 'oauth2', scopes: ['health:read'] }] },
        outputSchema: config.outputSchema
          ? {
              ...config.outputSchema,
              freshness: z.array(
                z.object({
                  cache_hit: z.boolean(),
                  fetched_at_utc: z.string(),
                  expires_at_utc: z.string(),
                }),
              ),
            }
          : undefined,
      },
      async (...args: any[]) => {
        const mark = env.REQUEST_CACHE_META?.length ?? 0;
        const result = await handler(...args);
        if (result.isError) return result;
        const freshness = env.REQUEST_CACHE_META?.slice(mark) ?? [];
        return {
          ...result,
          structuredContent: result.structuredContent
            ? { ...result.structuredContent, freshness }
            : undefined,
          content: [
            ...(result.content ?? []),
            { type: 'text', text: JSON.stringify({ freshness, timezone: 'Europe/London' }) },
          ],
        };
      },
    )) as typeof server.registerTool;
  const provider = options.provider ?? new GoogleHealthProvider(env);
  registerAllTools(server, provider, env);
  const experienceEnv = {
    ...env,
    REQUEST_FAIL_FAST: true,
    REQUEST_ABORT_SIGNAL: AbortSignal.timeout(45000),
  };
  registerExperienceTools(
    server,
    options.provider ?? new GoogleHealthProvider(experienceEnv),
    experienceEnv,
    options.probe,
  );
  server.registerTool(
    'get_connection_status',
    {
      title: 'Check private bridge configuration',
      description:
        'Check whether Health credentials have been configured. This does not claim API access has been verified.',
      inputSchema: {},
      outputSchema: {
        configured: z.boolean(),
        timezone: z.string(),
        freshness: z.array(
          z.object({
            cache_hit: z.boolean(),
            fetched_at_utc: z.string(),
            expires_at_utc: z.string(),
          }),
        ),
      },
    },
    async () => ({
      structuredContent: {
        configured: !!(await env.TOKENS.get('health:token-bundle')),
        timezone: 'Europe/London',
      },
      content: [
        {
          type: 'text',
          text: 'Daily archiving is optional and managed separately. This tool does not inspect or change its status.',
        },
      ],
    }),
  );
  return server;
}
