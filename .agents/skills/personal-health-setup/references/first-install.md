# First install / 首次安装

Use the actual checkout's `SETUP.md` as the maintained command/scope reference. This file describes how to guide a beginner through its handoffs, not a second installer.

## Prepare

Explain the outcome: one private read-only Worker, connected to the owner's Google Health and selected agent. Google Cloud configuration and personal consent remain necessary; no separate model API key is needed for the ChatGPT connector.

Check Git, Node 24+, pnpm and a terminal that can remain running through browser handoffs. Use macOS/Linux or WSL. If a prerequisite is missing, explain the specific missing item and use its official installation path within the user's authorization. Do not silently run privileged or remote bootstrap scripts. If the setup agent runs remotely, `127.0.0.1:8787` refers to that remote host, not the owner's laptop: run the consent helper on the owner's machine or use an explicitly supported secure forwarding route; do not expose the callback listener publicly.

For a clean recognized checkout, install locked dependencies if needed, inspect `pnpm run setup --dry-run`, then start `pnpm run setup --lang zh` or `--lang en` in an interactive terminal. Feed only known non-secret answers and local JSON paths. Use the wizard's existing resume state rather than restart a second process after browser consent. Read its output before each next input.

Default daily archive is off. Explain it only when asking that preference: dot queries Health on demand; optional Apps Script separately saves daily copies to Drive. Existing owners should retain their original archive. A `workers.dev` origin can simplify hosting, but discover the account's actual suffix after login or from its Cloudflare dashboard; Google branding/domain eligibility must still be checked.

## Cloudflare handoff

The wizard handles account lookup, two KV namespaces, templates, deployment and metadata checks. Have the owner finish the Cloudflare login/Authorize screen when requested, then continue the same process. If multiple accounts exist, identify the right one from the owner/context rather than choosing the first arbitrarily. Respect name/hostname collision checks; choose an unused target instead of deleting an existing deployment or DNS record.

## Google handoff

Guide one console task at a time at the URLs printed by the wizard. With browser access and task authorization, perform routine configuration yourself and let the owner make identity/consent decisions. Enable Health API, configure External consent and the three exact health read scopes from `SETUP.md`. Verify Production status and applicable requirements. Production is not verification approval and is not a promise of permanent authorization.

The two **Web application** clients must remain separate:

| Client | Callback | Purpose |
| --- | --- | --- |
| Login | `https://OWNER_HOST/login/callback` | `openid email`, verifies the owner |
| Health | `http://127.0.0.1:8787/oauth/callback` | Activity/fitness, measurements, sleep read-only scopes |

Use the exact real HTTPS origin selected for this installation. Ask for the downloaded JSON **file path**, never pasted JSON or secrets. The wizard validates and reads the file locally, stores Worker Secrets and the Health token bundle, and performs an actual refresh/read check. Do not print file contents while helping with a path error. For an unverified-app warning, explain whose application is requesting which access, and let the owner decide; do not click through personal consent automatically.

If consent or read probes fail, preserve the checkpoint and explain the specific layer that failed. Do not rotate clients or repeat the full consent flow for a transient error. Resolve the actual API/permission/grant issue before using `--reauthorize`.

## Agent handoff

Read `.setup/CONNECT.md` generated for this installation. The tested route is the ChatGPT custom MCP plugin: the owner's `/mcp` URL, OAuth, CIMD, token authentication `none`, scopes `health:read` and `offline_access`. Review the current official UI if labels differ. The owner completes connector consent; select Personal Health and actually call `get_data_status` before claiming success.

For Grok Bot, Muse or another requested agent, follow `docs/AGENT-COMPATIBILITY.md`. Do not assume a Grok web preset is the Bot's identity, use an unfilled Muse template, or claim directory publication. Missing terminal/MCP/account capabilities are limits to report, not settings to invent.

Finish with the project path, connector card, status of the independent verification layers and a short usable prompt. Offer optional archive setup only if the owner selected it; its exported guide still requires separate Apps Script/Drive consent and trigger verification.
