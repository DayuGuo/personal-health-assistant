# Personal Health Assistant — ChatGPT dot bridge

Private, read-only Google Health MCP bridge on Cloudflare Workers, adapted from [Ring8688/google-health-worker-mcp-V1](https://github.com/Ring8688/google-health-worker-mcp-V1), originally based on [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp). Upstream MIT copyright is preserved in LICENSE.

## What runs where

- **Cloudflare Worker:** authenticated Streamable HTTP `/mcp`, Google sign-in, public policy pages, local snapshot viewer.
- **Two KV namespaces:** one for encrypted MCP OAuth records and the owner's Health token bundle; one for short-lived read cache (maximum five minutes). OAUTH_KV and TOKENS bind to the same namespace, with health application keys prefixed `health:`. KV health tokens are accessible to Cloudflare account administrators; do not share these namespaces.
- **Existing Apps Script:** daily Europe/London approximately 20:00 sync and private Drive archive remain independent. This Worker has no cron and does not modify that trigger or Drive files.
- **ChatGPT dot:** uses the authenticated MCP plugin to query records on demand. The bridge never gives Google credentials to the model.

## Security changes from upstream

- No secret in a URL and no Anthropic-only IP gate. Standard OAuth 2.1 using Cloudflare's provider library, PKCE, protected resource metadata and ChatGPT CIMD support.
- Only the configured owner's verified Google email may connect; other accounts fail closed. Login client (`openid email`) and Health client (three `googlehealth.*.readonly` scopes) are separate.
- Client consent and browser-bound state are handled by the provider library. Only ChatGPT client metadata and callback hosts are accepted. This personal deployment is not an unrestricted multi-user service.
- Write/delete/preset tools and tools needing extra profile/settings/nutrition scopes are not registered. The provider mapping files are inherited; their presence does not grant permissions.
- London calendar defaults, real date validation, maximum 90-day ranges, fixed source families, pagination with truncation refusal, cache freshness in tool results, and redacted API errors.
- Bootstrap writes credentials directly with stdin/temporary mode-0600 files, then deletes temporary token files; it never prints tokens, authorization codes or secret-bearing commands. The ignored local `.bootstrap-secrets.json` holds the four client configuration values until provisioning finishes. Keep it owner-readable and delete it after verification.

## Minimal setup

1. Install Node.js 24+ and pnpm. Run `pnpm install --frozen-lockfile`.
2. Copy `wrangler.toml.example` to ignored `wrangler.toml`; set PUBLIC_ORIGIN, OWNER_EMAIL, Worker name and the canonical origin in `src/index.ts` for your own deployment.
3. Create two KV namespaces. Bind the authorization namespace as both OAUTH_KV and TOKENS, and the cache namespace as CACHE. Configure the IDs locally, never copy another person's storage IDs.
4. In Google Cloud enable Health API. Keep the three scopes: activity_and_fitness.readonly, health_metrics_and_measurements.readonly, sleep.readonly. Do not combine Drive/script scopes into Health tokens.
5. Create two **Web application** clients: login callback `https://YOUR_HOST/login/callback`; dedicated Health callback `http://127.0.0.1:8787/oauth/callback`. Set `.bootstrap-secrets.json` to a JSON object containing LOGIN_CLIENT_ID, LOGIN_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Do not commit this file.
6. Deploy with `pnpm exec wrangler deploy`, bind the custom domain, verify public policy pages, fill Google Branding, and check Production eligibility. Production is not verification and tokens are never guaranteed permanent.
7. Run `pnpm run setup:health`. Open `http://127.0.0.1:8787/auth` on that same computer; complete Google consent. The local script verifies health.identity HTTP 200, writes Worker Secrets and the Health bundle safely, then closes. It requests only the three read scopes above.
8. In ChatGPT Plugins → Add custom MCP server: name Personal Health Assistant, endpoint `https://YOUR_HOST/mcp`, choose OAuth/CIMD where offered, create as a plugin, approve client consent and sign in using the configured owner. Enable the plugin for your dot. Account/workspace eligibility still applies.
9. Test an actual tool call from dot, including empty/error cases, record dates and freshness. A public `/health` 200 proves only that the Worker is running, not that Google Health or dot linking works.

Google may show an unverified-app warning for personal use; review it yourself. Publishing Google OAuth does not mean Google approved the application. Existing Testing-mode grants should be replaced by a fresh Production authorization, including the separate Apps Script grant if that archive is retained.

## Repository layout

`src/`, `scripts/`, `test/`: bridge code and validation. `public/`: website assets. `apps-script/`: retained daily-sync source. `wrangler.toml.example`: portable deployment template. No automatic GitHub deployment is enabled in this repository.

## Validation

`pnpm typecheck`, `pnpm test`, `pnpm exec wrangler deploy --dry-run`.

`pnpm exec tsx scripts/diagnose-health.ts` is an owner-only local diagnostic. It reads the remote token into memory and prints endpoint status only. It does not modify tokens; rerun setup if a fresh token is needed. Do not run Wrangler commands that print the token bundle directly.

## Boundaries

Only existing records accessible to the approved scopes can be returned. Missing records are not zero; current-day activity can be incomplete. Source/method differences matter. Statistics are not diagnoses. Broad claims of "all body data" or "permanent authorization" are not made.

There is no public Google Health endpoint, no unauthenticated health dashboard, no new health writes, no change to the old Takeout history, and no promise that connecting this server automatically installs a dot monitoring schedule. Google API availability, host quotas, account permissions and upstream schemas must be checked for each deployment.
