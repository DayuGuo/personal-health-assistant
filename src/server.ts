import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from './env';
import { GoogleHealthProvider } from './providers/google';
import { registerAllTools } from './tools';
export function buildServer(env: Env): McpServer {
  const server = new McpServer(
    { name: 'personal-health-assistant', version: '0.3.0' },
    {
      instructions:
        'Read-only Google Health tools for the configured owner. First check record dates, source and freshness. Missing is not zero; today may be incomplete. For trends compare complete days and identical source families with the owner’s own baseline. Give a short finding, supporting evidence, uncertainty and one optional next step. Do not invent recovery/readiness scores or diagnose. Ask for relevant goals and context before tailoring suggestions. Daily archiving and proactive schedules are optional, separate, and require explicit setup. User context is not stored by this bridge. Never claim that a schedule, memory or data change was saved by a read-only tool.',
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
  registerAllTools(server, new GoogleHealthProvider(env), env);
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
