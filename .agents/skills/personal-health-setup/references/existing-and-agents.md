# Existing deployments and other agents / 已有部署与其他代理

## Existing or interrupted setup

`resume` means the local generated config matches the installer's saved hash. Reuse this directory and `.setup/state.json`; the installer's own collision and recovery guards still apply. `recoverable_checkpoint` means a matching write-ahead checkpoint exists: let `pnpm run setup` recover it, never manually adopt a different installation ID.

`existing_unmanaged` means a config exists without a matching wizard checkpoint. This often describes a healthy older deployment, not broken authorization. `configuration_mismatch` means local config/state needs review. Installing a new skill does not authorize replacing these files. Preserve them and inspect the actual checkout's `DEPLOY.md` existing-Worker section. Ask only for genuinely missing target/context; do useful read-only checks first. Do not fabricate a checkpoint hash, change the Worker name to escape a guard, or run the new-install wizard in that folder.

For an expressly requested code upgrade, retain Worker name, origin, owner, KV namespaces, all Worker Secrets, current grant locations and archive settings. Record a rollback version, render policies for the same owner, validate and deploy only the intended code/assets. Existing grant failure may still need targeted recovery, but routine code updates do not require installing a second health bridge or resetting consent.

## Status and recovery

Use the already-connected Personal Health `get_data_status` when available. It performs a live authorization check and returns statuses without measurements. If no connector is available, public checks can still establish reachability/OAuth discovery; say that private access is unverified. `pnpm run setup --check` requires valid installer state and checks public endpoints only. Do not run it against an unmanaged deployment and interpret its state error as a cloud outage.

For a diagnosed Health issue, `pnpm run diagnose:health -- --client /local/path/to/health-client.json` is status-only but still reads private API responses and may refresh in memory; it does not persist refreshed credentials. Use it only within the authorized diagnostic scope, never print the client JSON, and report its limits. For an actual invalid/revoked grant on an installer-managed deployment, use its targeted reauthorization route after resolving scope/API configuration. For an unmanaged deployment, follow that deployment's existing authorization mechanism rather than importing it into a new installer.

Keep these separate: configured credentials, successful API access, record dates, API/cache time, device sync and Apps Script archive success. The adapter cannot infer device last-sync time. If archive checks were requested and Drive/Apps Script access is available, inspect `sync_status.json`, `live_manifest.json` and the expected single trigger; otherwise explicitly leave archive execution unverified. Never reinstall a trigger just to check its status.

## Add another agent or prepare compatibility

Read `docs/AGENT-COMPATIBILITY.md` and inspect the installed version's `setup:agents --help`. New clients are opt-in exact CIMD/redirect pairs or restricted DCR callbacks. Each agent authorizes separately; Google Health grant and daily archive remain independent.

Start by previewing the intended policy; apply only to the verified intended origin when enabling that agent is part of the user's request. The command replaces the entire extra-client policy, so preserve existing extra-client rules and combine intended additions. ChatGPT's built-in rule remains. Never replace a policy with only a new client if that would remove another intended connection.

For pre-compatibility without vendor accounts, deliver the supported protocol/config files and label account-level access untested. The Grok preset is backed by web-client metadata, not proof of Grok Bot compatibility. Muse's placeholder template must remain unusable until actual parameters are known. Do not ask the owner to create accounts merely to prepare a template; do not enable guessed domains, wildcard redirects, an unauthenticated endpoint or a secret in the URL.

If the owner later wants a real connection, obtain exact public client ID/redirect parameters from that product's official metadata or actual connection flow. Keep secrets, authorization codes and bearer/refresh tokens out of chat. After owner consent, verify an actual status-only tool call from that agent. A protocol test or vendor capability page alone is not an end-to-end installation.
