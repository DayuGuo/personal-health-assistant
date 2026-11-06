import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SetupState } from './config';
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
export async function renderSite(root: string, state: SetupState): Promise<void> {
  const target = resolve(root, '.setup/site');
  await mkdir(target, { recursive: true });
  await cp(resolve(root, 'public'), target, { recursive: true });
  const daily =
    state.daily === 'off'
      ? '未启用每日归档。Daily archiving is disabled.'
      : state.daily === 'existing'
        ? '每日归档由维护者原有的独立任务处理。Daily archiving is handled by the owner’s existing separate task.'
        : '每日归档为可选扩展，需另行安装和授权。Daily archiving is optional and requires separate installation and consent.';
  const vars: Record<string, string> = {
    PUBLIC_ORIGIN: state.origin,
    OWNER_EMAIL: state.ownerEmail,
    OWNER_NAME: state.ownerName,
    DAILY_NOTE: daily,
  };
  for (const name of [
    'index.html',
    'privacy/index.html',
    'terms/index.html',
    'visualize/index.html',
  ]) {
    const path = resolve(target, name);
    const source = await readFile(path, 'utf8');
    await writeFile(
      path,
      source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
        if (!(key in vars)) throw Error('Unknown site placeholder');
        return escape(vars[key]!);
      }),
    );
  }
}
