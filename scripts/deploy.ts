import { checkDeploy } from './check-deploy';
import { requireCommand, wranglerRunner } from './setup/process';
try {
  await checkDeploy();
  await requireCommand(wranglerRunner(), ['deploy']);
  console.log(
    '部署完成 / Deployment completed. Run pnpm run setup --check for public verification.',
  );
} catch {
  console.error(
    '部署未完成 / Deployment incomplete. Check rendered assets, local configuration and Cloudflare access. Existing daily archives are not changed.',
  );
  process.exitCode = 1;
}
