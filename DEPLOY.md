# Current deployment

This project now uses **Cloudflare Workers**, not a Pages-only site. Public policies and the private MCP endpoint share https://health.anotherdayu.com.

- Public site: `/`, `/privacy/`, `/terms/`, `/visualize/`
- Private Streamable HTTP: `/mcp`
- Public status: `/health` (runtime only)
- MCP authorization: `/authorize`, `/oauth/token`
- Google identity callback: `/login/callback`
- Protected resource discovery: read the metadata URL in the `/mcp` 401 WWW-Authenticate header.

The static viewer processes selected local snapshot JSON only in browser memory; it does not automatically access Drive or upload files. MCP tool calls are separate authenticated requests.

Google client secrets belong in Worker Secrets. Never put them in public assets, GitHub Actions logs, a CNAME file or a connector URL. Keep namespace IDs in ignored local wrangler.toml; the committed template contains placeholders.

For custom domain binding, after confirming no conflicting health DNS record exists, add a top-level `routes = [{ pattern = "health.anotherdayu.com", custom_domain = true }]` to local wrangler.toml, then deploy. Do not change the main blog or other subdomains. If the hostname is already used, inspect its actual service before replacing anything.

Production OAuth URLs:
- Home: https://health.anotherdayu.com/
- Privacy: https://health.anotherdayu.com/privacy/
- Terms: https://health.anotherdayu.com/terms/
- Authorized domain: anotherdayu.com

The Apps Script `/usercallback` URI and its client remain separate and must not be replaced by the Worker login callback.

MCP transport/authentication documentation:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://github.com/cloudflare/workers-oauth-provider
