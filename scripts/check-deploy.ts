/** Stop an accidental legacy redeploy from publishing unrendered templates. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function checkDeploy(root = process.cwd()): Promise<void> {
  const config = await readFile(resolve(root, 'wrangler.toml'), 'utf8');
  const assets = config.match(/\[assets\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const directory = assets?.match(/directory\s*=\s*["']([^"'\n]+)["']/)?.[1];
  if (!directory)
    throw Error(
      'No explicit asset directory; preserve the existing deployment and review local configuration.',
    );
  for (const path of [
    'index.html',
    'privacy/index.html',
    'terms/index.html',
    'visualize/index.html',
  ]) {
    const html = await readFile(resolve(root, directory, path), 'utf8');
    if (/\{\{[A-Z_]+\}\}/.test(html))
      throw Error(
        'Unrendered site templates were blocked. Run the wizard in a clean clone, or preserve your legacy personalized assets; do not overwrite the live site.',
      );
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await checkDeploy();
  } catch {
    console.error(
      '部署已停止 / Deployment stopped: missing or unrendered assets. Existing deployments are unchanged. See DEPLOY.md before retrying.',
    );
    process.exitCode = 1;
  }
}
