import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (args: string[], input?: string) => Promise<CommandResult>;
/** No shell, credentials in stdin only, and captured output is never echoed. */
export function commandRunner(cwd = process.cwd()): Runner {
  return (args, input) =>
    new Promise((ok, fail) => {
      if (process.platform === 'win32') {
        fail(Error('Use WSL for this installer.'));
        return;
      }
      const child = spawn('pnpm', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      });
      let stdout = '',
        stderr = '',
        size = 0;
      const timer = setTimeout(
        () => {
          child.kill('SIGTERM');
          fail(Error('Command timed out; retry the installer to resume.'));
        },
        10 * 60 * 1000,
      );
      const capture = (kind: 'out' | 'err', data: Buffer) => {
        size += data.length;
        if (size > 2_000_000) {
          child.kill('SIGTERM');
          return;
        }
        if (kind === 'out') stdout += data.toString();
        else stderr += data.toString();
      };
      child.stdout.on('data', (d: Buffer) => capture('out', d));
      child.stderr.on('data', (d: Buffer) => capture('err', d));
      child.on('error', () => {
        clearTimeout(timer);
        fail(Error('Unable to start pnpm.'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        ok({ code: code ?? 1, stdout, stderr });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input ?? '');
    });
}
export function wranglerRunner(config = resolve('wrangler.toml'), run = commandRunner()): Runner {
  return (args, input) => run(['exec', 'wrangler', ...args, '--config', config], input);
}
export async function requireCommand(
  run: Runner,
  args: string[],
  input?: string,
): Promise<CommandResult> {
  const result = await run(args, input);
  if (result.code !== 0)
    throw Error(
      `Operation failed (${args.slice(0, 3).join(' ')}). Credentials and command output were withheld. Retry to resume; check account access and configuration.`,
    );
  return result;
}
export async function openBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw Error('Invalid browser URL');
  const program = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await new Promise<void>((ok) => {
    const child = spawn(program, [url], { stdio: 'ignore' });
    child.on('error', () => ok());
    child.on('close', () => ok());
  });
}
