import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Env } from '../env';
import type { HealthProvider } from '../providers/types';
import { registerActivityReadTools } from './read/activity';
import { registerBodyReadTools } from './read/body';
import { registerHeartReadTools } from './read/heart';
import { registerMetricsReadTools } from './read/metrics';
import { registerSleepReadTools } from './read/sleep';

export function registerAllTools(server: McpServer, provider: HealthProvider, env: Env): void {
  // ---- Read ----
  registerActivityReadTools(server, provider, env);
  registerHeartReadTools(server, provider, env);
  registerSleepReadTools(server, provider, env);
  registerBodyReadTools(server, provider, env);
  registerMetricsReadTools(server, provider, env);

}
