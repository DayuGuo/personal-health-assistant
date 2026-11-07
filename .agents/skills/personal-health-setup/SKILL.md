---
name: personal-health-setup
description: "Install, resume, connect or troubleshoot the Personal Health Google Health bridge on Cloudflare with beginner-friendly guidance. Use for 配置健康助手、安装 Personal Health、续接安装 or MCP connection setup; daily health questions alone should use the installed health connector."
---

# Personal Health Setup

Guide the owner through setup in their language, Chinese or English. Do the terminal and routine configuration work yourself when tools and authorization allow it. Ask only for missing information or the next personal login/consent step; explain unfamiliar settings when they become relevant. Reuse facts already supplied. Do not overwhelm a beginner with an OAuth/KV checklist.

This skill prepares and operates the installer; the deployed MCP service supplies health tools. Installing the skill does not install the connector, grant Google access, or prove an agent can read data. Browser-only agents may lack the local terminal/browser callback required for setup: disclose the missing capability and guide the owner to Codex or a supported local agent instead of pretending commands ran.

## Locate the project and choose the mode

Use the user's existing project directory if known. Otherwise inspect only the working folder and relevant named paths; ask where an existing deployment lives before creating a replacement. For a new install, clone `https://github.com/DayuGuo/personal-health-assistant.git` into a new empty directory (honor an explicitly selected fork). Do not overwrite a directory or create a second live deployment merely because this skill was newly installed.

Check that Node.js 24+ is available, then run the bundled read-only preflight with absolute paths:

```sh
node /path/to/personal-health-setup/scripts/preflight.mjs --project /path/to/personal-health-assistant
```

The helper reports only local readiness. It makes no network calls and never opens `.env`, downloaded Google client files, token dumps or health snapshots. It does not prove credentials, Cloudflare ownership or API access.

- `new`: read [references/first-install.md](references/first-install.md), then use the repository's `SETUP.md` and installer.
- `resume` or `recoverable_checkpoint`: continue in the same directory. Let the installer validate/recover its checkpoint; do not rename or edit state yourself.
- `existing_unmanaged` or `configuration_mismatch`: read [references/existing-and-agents.md](references/existing-and-agents.md). Preserve files and use the existing-deployment route; do not run the new-install wizard there.
- `not_project` or `inspection_error`: resolve the directory/read error first. Missing tooling is not a reason to change cloud resources.

If the owner asks only for a status check or another agent, follow the relevant section of [references/existing-and-agents.md](references/existing-and-agents.md); do not begin a new installation.

## Guide and execute

Before running repository scripts, read the matching checkout's `package.json` and relevant guide. Use **`pnpm run setup`**, not `pnpm setup`; use `pnpm run deploy`, not `pnpm deploy`. Prefer the existing deterministic wizard over recreating credential storage or OAuth logic. Start with `pnpm install --frozen-lockfile` only when dependencies are missing, then use a persistent interactive terminal so progress survives browser handoffs. Do not put passwords, client secrets or refresh tokens into terminal input, chat or screenshots; pass only the local client JSON paths expected by the wizard.

Collect new-install details progressively: owner Google email, public maintainer name, chosen Worker/origin and archive preference. Suggest no daily archive for a new user and keep existing archive for an existing user. Explain that email/name appear on generated public policy pages. A `workers.dev` address avoids buying a domain, but obtain its real account suffix; never invent an available hostname or promise Google will accept any publishing configuration.

Show the actual deployment target and planned archive choice before the installer reaches its deployment confirmation. Use authorization already present in the request; do not add a separate blanket approval loop. Honor the wizard's concrete confirmations and leave personal account selection, Google warnings and consent decisions to the owner. Use an available browser tool for routine console navigation; hand over only for the step that actually needs the person. If browser tools are unavailable, give the exact current link and one next action, then resume the same terminal.

Keep the same Worker, canonical origin, owner, KV bindings and stored grants when resuming or maintaining. Never run `secret bulk`, recreate KV, replace a Health token bundle or reinstall Apps Script as a shortcut to repair an unrelated error. Reauthorization is a targeted recovery step for an evidenced grant problem, not the default fix.

## Finish with evidence

Report each layer separately:

1. Local prerequisite/config readiness.
2. Public HTTPS/policies, protected `/mcp` challenge and correct OAuth metadata.
3. Actual Google token refresh and Health read probes, as statuses without measurements.
4. Connector installation/owner consent and an actual `get_data_status` call from the selected agent.
5. Daily archive only if requested: separate Drive outputs and exactly one expected trigger.

`/health` returning 200, `setup --check`, a saved grant, or a tool list alone does not establish all layers. State exactly what is unverified. Leave the owner with the local project path, `.setup/CONNECT.md`, verified/remaining steps and one usable health prompt. Do not store secrets or health values in skill files or handoff notes. Read the repository's `docs/DOT-PROMPTS.md` for daily use; overview excludes today, and last night's sleep uses its wake date.

Keep Grok Bot and Meta Muse labeled pre-compatible until their real client settings and account-level calls are verified. If the owner has no accounts and asks only to prepare compatibility, provide templates and protocol validation without requesting logins or enabling guessed callbacks.
