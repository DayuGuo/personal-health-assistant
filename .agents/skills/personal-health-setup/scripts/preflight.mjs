#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { delimiter, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const exists = async (path) => {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
async function smallText(path) {
  if ((await stat(path)).size > 262144) throw Error('Inspection file is too large');
  return readFile(path, 'utf8');
}
async function executable(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean))
    for (const suffix of suffixes) {
      try { await access(join(dir, name + suffix), constants.X_OK); return true; }
      catch { /* Inspect presence only; never execute or bootstrap tools. */ }
    }
  return false;
}
function checkpoint(value) {
  return value && value.version === 1 && typeof value.installId === 'string' &&
    /^[a-f0-9]{12}$/.test(value.installId) &&
    typeof value.configHash === 'string' && /^[a-f0-9]{64}$/.test(value.configHash);
}

export async function inspectProject(project) {
  const root = resolve(project);
  const result = {
    project: root,
    mode: 'not_project',
    prerequisites: {
      node_version: process.versions.node,
      node_24_or_newer: Number(process.versions.node.split('.')[0]) >= 24,
      git_available: await executable('git'),
      pnpm_available: await executable('pnpm'),
      platform_supported: process.platform !== 'win32',
    },
    dependencies_installed: false,
    local_config_present: false,
    installer_state_present: false,
    verified: { cloud_access: false, health_authorization: false, agent_connection: false, daily_archive: false },
    network_requests: 0,
    files_modified: 0,
  };
  try {
    if (!await exists(join(root, 'package.json'))) return result;
    const manifest = JSON.parse(await smallText(join(root, 'package.json')));
    if (manifest.name !== 'personal-health-assistant') return result;
    result.dependencies_installed = await exists(join(root, 'node_modules'));
    const config = join(root, 'wrangler.toml');
    const state = join(root, '.setup/state.json');
    const pending = join(root, '.setup/state.next.json');
    result.local_config_present = await exists(config);
    result.installer_state_present = await exists(state);
    const pendingPresent = await exists(pending);
    if (!result.local_config_present) {
      result.mode = result.installer_state_present || pendingPresent ? 'configuration_mismatch' : 'new';
      return result;
    }
    const hash = createHash('sha256').update(await smallText(config)).digest('hex');
    let previous = null;
    if (result.installer_state_present) previous = JSON.parse(await smallText(state));
    if (pendingPresent) {
      const next = JSON.parse(await smallText(pending));
      if (checkpoint(next) && next.configHash === hash &&
          (!previous || checkpoint(previous) && previous.installId === next.installId)) {
        result.mode = 'recoverable_checkpoint';
        return result;
      }
    }
    if (!result.installer_state_present) result.mode = 'existing_unmanaged';
    else result.mode = checkpoint(previous) && previous.configHash === hash ? 'resume' : 'configuration_mismatch';
    return result;
  } catch {
    result.mode = 'inspection_error';
    return result;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--project' || !args[1]) {
    console.error('Usage: node preflight.mjs --project /absolute/project/path');
    process.exitCode = 1;
  } else {
    const report = await inspectProject(args[1]);
    console.log(JSON.stringify(report, null, 2));
    if (report.mode === 'inspection_error') process.exitCode = 1;
  }
}
