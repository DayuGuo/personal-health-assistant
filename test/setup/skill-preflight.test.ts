import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = resolve('.agents/skills/personal-health-setup/scripts/preflight.mjs');
const dirs: string[] = [];
async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'health skill test '));
  dirs.push(dir);
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'personal-health-assistant' }));
  return dir;
}
function inspect(dir: string) {
  const result = spawnSync(process.execPath, [script, '--project', dir], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  return { report: JSON.parse(result.stdout), output: result.stdout + result.stderr };
}
const config = 'name = "existing-health"\nPUBLIC_ORIGIN = "https://health.example.org"\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('standalone setup skill preflight', () => {
  it('recognizes a clean checkout without asserting cloud, Health, agent or archive access', async () => {
    const dir = await project();
    const { report } = inspect(dir);
    expect(report.mode).toBe('new');
    expect(report.network_requests).toBe(0);
    expect(report.files_modified).toBe(0);
    expect(Object.values(report.verified)).toEqual([false, false, false, false]);
  });
  it('preserves an existing unmanaged deployment without exposing credentials', async () => {
    const dir = await project();
    const content = config + 'GOOGLE_CLIENT_SECRET = "synthetic-sensitive-do-not-print"\n';
    await writeFile(join(dir, 'wrangler.toml'), content);
    await writeFile(join(dir, '.env'), 'refresh_token=synthetic-refresh-do-not-print');
    const { report, output } = inspect(dir);
    expect(report.mode).toBe('existing_unmanaged');
    expect(output).not.toContain('synthetic-sensitive');
    expect(output).not.toContain('synthetic-refresh');
    expect(await readFile(join(dir, 'wrangler.toml'), 'utf8')).toBe(content);
    expect(await readFile(join(dir, '.env'), 'utf8')).toContain('synthetic-refresh');
  });
  it('distinguishes a matching saved installer from an edited configuration', async () => {
    const dir = await project();
    await mkdir(join(dir, '.setup'));
    await writeFile(join(dir, 'wrangler.toml'), config);
    await writeFile(
      join(dir, '.setup/state.json'),
      JSON.stringify({ version: 1, installId: 'a'.repeat(12), configHash: hash(config) }),
    );
    expect(inspect(dir).report.mode).toBe('resume');
    await writeFile(join(dir, 'wrangler.toml'), config + '\n# owner edit');
    expect(inspect(dir).report.mode).toBe('configuration_mismatch');
  });
  it('recognizes a matching write-ahead checkpoint without renaming or adopting another install', async () => {
    const dir = await project();
    await mkdir(join(dir, '.setup'));
    await writeFile(join(dir, 'wrangler.toml'), config);
    const original = JSON.stringify({
      version: 1,
      installId: 'a'.repeat(12),
      configHash: hash('old config'),
    });
    const pending = JSON.stringify({
      version: 1,
      installId: 'a'.repeat(12),
      configHash: hash(config),
    });
    await writeFile(join(dir, '.setup/state.json'), original);
    await writeFile(join(dir, '.setup/state.next.json'), pending);
    expect(inspect(dir).report.mode).toBe('recoverable_checkpoint');
    expect(await readFile(join(dir, '.setup/state.json'), 'utf8')).toBe(original);
    expect(await readFile(join(dir, '.setup/state.next.json'), 'utf8')).toBe(pending);
    await writeFile(
      join(dir, '.setup/state.next.json'),
      pending.replace('a'.repeat(12), 'b'.repeat(12)),
    );
    expect(inspect(dir).report.mode).toBe('configuration_mismatch');
  });
  it('reports missing configuration conservatively and avoids echoing malformed state', async () => {
    const dir = await project();
    await mkdir(join(dir, '.setup'));
    await writeFile(join(dir, '.setup/state.json'), '{"private":"synthetic-hidden');
    expect(inspect(dir).report.mode).toBe('configuration_mismatch');
    await writeFile(join(dir, 'wrangler.toml'), config);
    const result = spawnSync(process.execPath, [script, '--project', dir], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).mode).toBe('inspection_error');
    expect(result.stdout + result.stderr).not.toContain('synthetic-hidden');
  });
});
