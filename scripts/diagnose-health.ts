/** Owner-only, read-only diagnostic. Never prints credentials or measurements. */
import { readFile } from 'node:fs/promises';
import { parseGoogleClient } from './setup/config';
import { wranglerRunner } from './setup/process';
import { verifyHealth } from './setup-health';
import { TokenBundleSchema } from '../src/providers/google/oauth';
try {
  const args = process.argv.slice(2),
    path = args.includes('--client') ? args[args.indexOf('--client') + 1] : undefined;
  let clients: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string };
  if (path) {
    const c = parseGoogleClient(
      await readFile(path, 'utf8'),
      'http://127.0.0.1:8787/oauth/callback',
    );
    clients = { GOOGLE_CLIENT_ID: c.id, GOOGLE_CLIENT_SECRET: c.secret };
  } else {
    const c = JSON.parse(await readFile('.bootstrap-secrets.json', 'utf8'));
    clients = {
      GOOGLE_CLIENT_ID: c.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.GOOGLE_CLIENT_SECRET,
    };
  }
  const result = await wranglerRunner()([
    'kv',
    'key',
    'get',
    'health:token-bundle',
    '--binding',
    'TOKENS',
    '--remote',
    '--text',
  ]);
  if (result.code !== 0) throw Error('Unable to read bundle');
  const bundle = TokenBundleSchema.parse(JSON.parse(result.stdout));
  const checks = await verifyHealth(clients, bundle);
  checks.forEach((x) => console.log(JSON.stringify(x)));
  process.exitCode = checks.every((x) => x.ok) ? 0 : 1;
} catch {
  console.error(
    'Diagnostic incomplete / 诊断未完成。Use --client /path/to/downloaded-health-client.json and the correct local wrangler.toml. No credentials were printed. An expired local diagnostic token cannot be persisted by this read-only command.',
  );
  process.exitCode = 1;
}
