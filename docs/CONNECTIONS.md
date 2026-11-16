# Required connections and remaining migration work

## GitHub

- Repository: `AITSCCTV/aits-workplace` (the existing repository selected with the owner's permission).
- Collaborator `pshkai` can push code and workflows.
- GitHub Pages was enabled with source **GitHub Actions** using the owner’s existing browser session.
- GitHub Pages target: `https://aitscctv.github.io/aits-workplace/`.

## Current deployment

Backend deployed on 2026-11-16 at https://aits-workplace-api.aits-api.workers.dev with three isolated D1 databases and private R2 bucket. Owner-only Cloudflare Access login is configured for info@aitscctv.com; live sign-in, inventory save/reload, Design Studio save/reopen and migrated board/project loading have been verified. The owner authorized existing paid-plan deployment and an account-wide $5 Workers usage limit, which is saved and enabled. D1/R2 and subscription fees are excluded, and enforcement delay can cause overshoot. No plan upgrades or payment actions are authorized. The private calendar snapshot (15 events) has been imported into protected D1 storage. The private data migration completed on 2026-11-16: 26 tasks, 40 task audit entries, three projects, 11 project revisions, and the earlier 15-event calendar snapshot. All imported database rows were read back and matched. Original inventory, warranty, service and cloud-plan tables were empty. No browser-saved plan was present in the checked AitsCCTV Brave profile; plans stored on other devices or as external files require those devices/files.

See [backend configuration](../backend/README.md) for the implemented adapter and authentication flow. The checklist below describes migration requirements; private data reconciliation has passed.

## Cloudflare

The original server implementation targets Cloudflare Workers. The closest independent migration needs:

| App | Runtime | Database | Object storage |
| --- | --- | --- | --- |
| Workplace | None | None | None |
| Project Board | Shared API Worker | D1 binding `DB` | None |
| Inventory | Worker / Vinext | D1 binding `DB` | None |
| Design Studio | Worker | D1 binding `DB` | R2 binding `BUCKET` |

Use three separate databases to preserve the original app boundaries. Schema SQL and runtime initialization are in each source tree. This repository does not contain the original hosted data or ownership grants.

Required account access: read the selected account; deploy Workers; manage the three D1 databases; manage the Design Studio R2 bucket; configure authenticated access and allowed visitor identities. Authenticate through Wrangler OAuth or set a scoped Cloudflare API token in a secure local environment/GitHub Actions secret. Never put tokens in source, runtime.json, Pages, or a chat message.

**Cost constraint:** The owner has prohibited payments without separate authorization. Check current plan, resource availability and billing requirements before provisioning. Do not activate paid plans, enable billing, or create a resource requiring payment without approval. New backend resources were subsequently authorized and provisioned on 2026-11-16.

## Authentication must be replaced before deployment

The original Sites platform authenticates visitors and injects `oai-authenticated-user-id` and `oai-authenticated-user-email`. These headers are not authentication when supplied directly by an ordinary Internet client. The Project Board in particular relies on the private Sites boundary; copying it to an unprotected Worker would expose its data.

Before enabling external API URLs:

1. Configure an identity provider / Cloudflare Access application and the approved AITS users.
2. Verify the provider's signed token at the Worker, including signature, issuer, audience, expiry and authorized role. Reject missing/invalid identity. Strip any client-supplied `oai-*` identity headers; derive trusted internal identities only after verification.
3. Preserve the admin/team-form access rules and per-owner isolation. Map original owner IDs during private data import.
4. Define an explicit login flow usable from the GitHub Pages origin. Cross-site cookie behavior must be tested; the frontend now uses an Access login popup and a signed bearer token in sessionStorage.
5. Restrict CORS to `https://aitscctv.github.io`, support OPTIONS preflight, and retain CSRF protection. Original APIs enforce same-origin writes; adapt these checks to the verified Pages origin rather than simply removing them.
6. Test unauthorized access, cross-owner reads/writes, form-only roles, stale revisions and rollback on failures before connecting production data.

`config/runtime.json` contains deployed API prefixes, without secrets. Missing sessions receive 401; the login endpoint is protected by Access.

## Existing endpoints preserved

- Inventory: `/api/stock` (GET/POST).
- Design Studio: `/api/plans` and `/api/plans/:id` (list/read/create/revision update).
- Project Board: `/api/tasks`, `/api/projects`, `/api/warranties`, `/api/service`, `/api/forms`, `/api/calendar` and the original MCP route under `app/mcp/`.
- Keep original request/response contracts, revision checks, validation, transaction behavior and evidence requirements.

## Other APIs

**Google Calendar is not needed to reproduce the existing behavior.** The original calendar endpoint returns a saved snapshot, not a live Calendar API request. For live synchronization, supply a Google Cloud OAuth application with Calendar read access and the specific calendars to sync; this is a separate enhancement.

**LINE, Gmail, accounting and payment APIs are not currently connected to these four apps.** They are not required for a literal migration. The preserved connector scaffolding is Sites-specific and is not itself an active external integration. No OpenAI API key is needed for the copied screens or current calculation tools.

## Private data migration

- Export/import D1 records privately for board tasks/events, project history/workspaces, warranties, services, inventory and design metadata.
- Copy Design Studio R2 objects with their keys and metadata; reconcile ownership with the new authentication provider.
- Restore the private calendar snapshot into protected storage, not the public GitHub repository or Pages bundle.
- Export browser-local Design Studio plans to JSON from the original origin and import them on the new one.
- Verify record counts, revisions, object hashes, owner isolation and representative workflows before cutover. Keep the original Sites available until that check succeeds.

The source import alone does not perform these data transfers or grant access to the original platform's underlying Cloudflare account.

## Completed cutover

The original Project Board API/MCP routes now forward to the new workspace using a server-only scoped credential. Existing ChatGPT Project Board tools and both board interfaces share the independent D1 data. The original database remains a rollback snapshot. Inventory and Design Studio use their independent APIs from the new workspace; their original hosted databases contained no records or plans. Employee access is explicitly deferred. Native Google, LINE, Gmail and other ChatGPT connectors are separate services, not embedded integrations of these four Sites. The existing calendar remains a snapshot; a live sync would require a separately configured integration.
