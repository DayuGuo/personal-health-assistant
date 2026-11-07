import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureAgents } from '../../scripts/setup-agents';
const dirs: string[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'health-agent-test-'));
  dirs.push(dir);
  const file = join(dir, 'policy.json'),
    config = join(dir, 'wrangler.toml');
  await writeFile(file, '[]');
  await writeFile(config, 'PUBLIC_ORIGIN = "https://health.example.org"\n');
  return { file, config };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it('previews without cloud calls and rejects a mismatched deployment before network access', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const { file, config } = await fixture(),
    run = vi.fn(),
    fetcher = vi.fn();
  await configureAgents(['--file', file], run, fetcher);
  expect(run).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    configureAgents(
      ['--file', file, '--config', config, '--apply', '--origin', 'https://other.example.org'],
      run,
      fetcher,
    ),
  ).rejects.toThrow(/does not match/);
  expect(fetcher).not.toHaveBeenCalled();
});
it('refuses older workers and updates only the agent policy on a matching deployment', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const { file, config } = await fixture(),
    run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
  const args = [
    '--file',
    file,
    '--config',
    config,
    '--apply',
    '--origin',
    'https://health.example.org',
  ];
  await expect(
    configureAgents(
      args,
      run,
      vi.fn(async () => Response.json({ version: '0.4.1', mode: 'read-only' })),
    ),
  ).rejects.toThrow(/matching/);
  expect(run).not.toHaveBeenCalled();
  await configureAgents(
    args,
    run,
    vi.fn(async () => Response.json({ version: '0.4.2', mode: 'read-only' })),
  );
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith(['secret', 'put', 'MCP_CLIENT_POLICY'], '[]');
});
