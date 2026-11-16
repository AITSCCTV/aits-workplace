# Independent backend

One API Worker routes to the three preserved applications using three isolated D1 bindings. It imports the existing business logic directly; an AsyncLocalStorage adapter supplies the request-specific database and authenticated identity. No original source file is edited.

## Build and local tests

Use Node 22 or later. From the repository root:

```
npm ci
npm run test:backend
npm test
npm run build
```

`backend/dist/worker.js` is the deployable bundle. `backend/wrangler.jsonc` contains the deployed bindings and public authentication identifiers. It fails closed when authentication is missing or invalid. Do not deploy a build directly from `sites/`: those original entrypoints still assume Sites authentication.

## Deployed resources

- Worker: `aits-workplace-api`
- D1 `aits-workplace-project-board` â†’ `DB_PROJECT_BOARD`
- D1 `aits-workplace-inventory` â†’ `DB_INVENTORY`
- D1 `aits-workplace-design-studio` â†’ `DB_DESIGN_STUDIO`
- Private R2 bucket `aits-workplace-plans` â†’ `BUCKET`

Backend deployed on 2026-11-16 at https://aits-workplace-api.aits-api.workers.dev with three isolated D1 databases and private R2 bucket. Owner-only Cloudflare Access login is configured for info@aitscctv.com; authenticated calendar loading, inventory save/reload, and Design Studio cloud save/reopen have passed live browser verification; temporary test records were removed. The owner authorized existing paid-plan deployment and an account-wide $5 Workers usage limit, which is saved and enabled. D1/R2 and subscription fees are excluded, and enforcement delay can cause overshoot. No plan upgrades or payment actions are authorized. The private calendar snapshot (15 events) has been imported into protected D1 storage. The private data migration completed on 2026-11-16: 26 tasks, 40 task audit entries, three projects, 11 project revisions, and the earlier 15-event calendar snapshot. All imported database rows were read back and matched. Original inventory, warranty, service and cloud-plan tables were empty. No browser-saved plan was present in the checked AitsCCTV Brave profile; plans stored on other devices or as external files require those devices/files.

Apply the original board migrations in `sites/project-board/drizzle/`, plus `backend/migrations/calendar.sql`; the original inventory and design migrations are in their respective `drizzle/` directories. Service and warranty tables are also initialized by the original handlers.

## Authentication configuration

Create a hostname-based Access application protecting ONLY the new Worker's `/auth/login` path. Use an Allow policy restricted to the approved owner email (`info@aitscctv.com` initially). The API paths authenticate the resulting signed Access JWT themselves. This avoids putting an HTML login redirect in the path of browser API requests or preflights. Do not configure an Access bypass that grants access to private API data; every API request is checked in code regardless of edge policy.

Set `TEAM_DOMAIN` to the verified team URL and `POLICY_AUD` to this application's AUD. The backend verifies signature, issuer, audience, expiry and a separate local email allowlist. `ADMIN_EMAILS` grants full board access; `TEAM_EMAILS` grants only POST `/project-board/api/forms`. Initially no team emails are allowed. Caller-supplied `oai-*` identities are stripped.

The login popup posts the verified token only to `https://aitscctv.github.io`, with a random state checked by the opener and a source-window/origin check. The frontend stores the session in sessionStorage (not localStorage), adds a bearer token to requests, and clears it on a 401 or sign-out. Tokens never appear in query strings or public configuration. Browser end-to-end login has passed against the configured Access application.

API prefixes: `/project-board/api/*`, `/inventory/api/*`, `/design-studio/api/*`; MCP: `/project-board/mcp`. Only the owner can access MCP. Original MCP logic is retained; external MCP OAuth discovery/registration is not provided by this adapter.

`config/runtime.json` routes each interface to its API prefix. The original Pages URL and interface layouts remain the same.

## Private migration

`scripts/export-sites.mjs` reads the original Sites APIs into ignored `private-data/sites-source/`. It takes short-lived source credentials through hidden terminal stdin. Never commit the export files or credentials. API exports can omit database audit details; record missing information explicitly rather than inventing it. Do not mark migration complete until records, revisions, object files and ownership have been reconciled and tested.

## Original Project Board compatibility bridge

The original owner-private Project Board forwards `/api/tasks`, `/api/projects`, `/api/service`, `/api/warranties`, `/api/forms`, `/api/calendar`, and `/mcp` to this Worker. Its existing ChatGPT plugin therefore uses the same data as the GitHub Pages workspace. Original Site permissions remain owner-only. Employee onboarding was deferred by the owner.

`SITES_BRIDGE_TOKEN` is a random server-only secret stored in both runtimes, never in GitHub, Pages or browser storage. The independent Worker accepts it only without a browser Origin header and only on the exact Project Board routes. It cannot sign in, access Inventory or access Design Studio. Caller identity headers are stripped. Normal Pages users still require a verified Cloudflare Access JWT and the explicit allowlist.

The Site has `AITS_WORKSPACE_BRIDGE_ENABLED=true`; disabling it and republishing rolls back routing to the OLD snapshot, not current workspace records. Do not roll back routing after new writes without reconciling data. Rotate the secret in both runtimes together. The temporary export route was removed after transfer.

Private source backup and comparison receipts are in ignored `private-data/`. `python scripts/import-board.py <complete-export.json>` dry-runs a reconciliation; `--apply` inserts missing rows without overwriting conflicts and verifies full content. Initialize service/warranty tables with `backend/migrations/service-warranty.sql` when provisioning a fresh database. Never import the bounded/truncated database-viewer output.

The deployed original Site bridge is preserved for review in `backend/sites-project-board-bridge.patch` (source commit `cd925f5d0213d46dc9ef4f4867993fe0471cb48e`). A live create through the existing MCP connector was found in the independent D1 database, then its exact temporary task and event were removed. A final reconciliation found 26 tasks, 40 events, 3 projects and 11 project revisions unchanged. The removed export URL returns 404.
