# AITS Workplace

Source migration of all four AITS Sites into one repository, with a GitHub Pages build of their original interfaces.

Target URL: https://aitscctv.github.io/aits-workplace/

## What is included

| Original Site | Preserved source | GitHub Pages route |
| --- | --- | --- |
| AITS Workplace | `sites/workplace` — department hub, search, filters, artwork and company logo | `/` |
| AITS Design Studio | `sites/design-studio` — floor plans, camera placement, Wi-Fi estimates, storage calculator, import/export, cloud versioning API | `/design-studio/` |
| AITS Inventory | `sites/inventory` — equipment register, fractional quantities, receive/issue/return, minimum stock, history and export, database API | `/inventory/` |
| AITS Project Board | `sites/project-board` — task board, quotations/order follow-up, warranties, calendar, project stages/progress/history, material movements/costs/requests, service/training, sales/survey forms, MCP server | `/project-board/` |

Additional routes: `/project-board/calendar/`, `/project-board/projects/`, `/project-board/service/`, `/project-board/forms/sales/`, `/project-board/forms/survey/`.

## Deployment status

Backend deployed on 2026-11-16 at https://aits-workplace-api.aits-api.workers.dev with three isolated D1 databases and private R2 bucket. Owner-only Cloudflare Access login is configured for info@aitscctv.com; live browser verification is pending. The owner authorized existing paid-plan deployment and an account-wide $5 Workers usage limit, which is saved and enabled. D1/R2 and subscription fees are excluded, and enforcement delay can cause overshoot. No plan upgrades or payment actions are authorized. The private calendar snapshot (15 events) has been imported into protected D1 storage. Other source records and uploaded plans have not yet been migrated.

## Preservation and current limitations

The source was retrieved from the four actual Sites Git repositories. `migration-manifest.json` records the source commits and SHA-256 checksums for 293 tracked files. 292 files are byte-for-byte copies. The single exception is `sites/project-board/lib/calendar-snapshot.ts`: it contained private operational calendar records, so the public repository contains an empty template. Its original is retained in the local migration backup. No credentials, private database dumps, or uploaded plans are committed.

All original APIs, Worker entrypoints, schemas, migrations, tests, styles, assets, build scripts, and dependency lockfiles are retained. Git history itself remains in the local source checkouts; the manifest identifies the imported commits. Existing Sites are unchanged.

**GitHub Pages serves static files only. It cannot execute the copied Workers, D1 queries, R2 operations, or MCP server.** The Pages build preserves the screens and client-side behavior. Workplace and the local Design Studio tools work without a backend. Cloud saves, inventory records, project data, form submissions and server exports require a separately deployed authenticated backend. The independent backend is connected through `config/runtime.json`; users must sign in.

The private calendar snapshot is migrated; other private cloud data has not yet been migrated. Existing browser-saved plans remain on the old origin; export JSON from the original Design Studio and import on the new one.

## Build and verification

Use Node.js 22 or later:

```sh
npm ci
npm test
npm run build
node --test sites/design-studio/tests/cloud.test.mjs
```

The build uses the preserved source directly. Deployment-only path/link adjustments happen in the bundler, leaving the original files unchanged. Only `dist/` is uploaded to Pages, never server source or private snapshots. The root dependencies build the static interfaces; original server packages retain their own dependencies.

For preview at the production base path, serve the parent of a directory called `aits-workplace` containing the build, or set `PAGES_BASE_PATH=/` when building a root-hosted preview.

## Publish

The included GitHub Actions workflow builds and deploys on every push to `main`. Pages has been enabled through the owner’s existing browser session with **Source: GitHub Actions**. The CLI collaborator has Write access, not administrator access.

See [Cloud migration and required connections](docs/CONNECTIONS.md). No payment or subscription upgrade is authorized by this repository.
