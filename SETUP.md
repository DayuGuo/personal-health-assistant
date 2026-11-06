# Owner setup

Read README.md for bridge deployment and authentication. The local Health setup requests only three read scopes, stores secrets directly, and uses `http://127.0.0.1:8787/oauth/callback`.

The preserved `apps-script/` program remains a separate daily archive. Do not replace its Cloud project, callback, client, token properties, folder IDs or trigger while adding the bridge. After the shared OAuth app moves from Testing to Production, run that Apps Script's `authorizeHealth`, complete its own consent, and then run `diagnoseSetup` and a real sync to ensure the old seven-day grant was replaced. Keep only one syncDaily trigger and preserve unrelated tasks.

Google Production is a publishing status, not a verification result. New authorizations can still show Google's unverified-app warning. Owner consent and any required review are user steps; never claim them complete based only on saving code or deploying a website.
