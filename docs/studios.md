# Studio integration

Floorplan Studio and Content Studio are native routes below Design Studio, with
the workspace navigation, typography, quiet olive palette and shared Thai/English
preference. The four original Site source trees remain unchanged.

Floorplan's static editor is copied from `floorplan-studio/static` in the AITS
project folder (the published standalone source is at commit `c383615`). It keeps
the existing Render service, team-password login gate, browser PDF/DXF readers,
local project downloads, photo workflow and manual editor. No Python backend,
provider credential or customer project was copied into this public repository.
Its provider calls and costs remain with the existing Render/OpenAI setup.

Content Studio is adapted from the live staff-dashboard source at commit
`5f083d8` in `tmp/aits-research-trigger-fix`, rather than the older browser-local
GitHub Pages demo. The retained component, image loader and translation catalog
are under `studios/content`. It uses the existing `aits-api` Worker, shared D1
drafts/research, private R2 images, n8n jobs and existing publishing checks.
Its existing staff login is additional to workspace Cloudflare Access, with a
tab-session token; no employee roles have been changed. This is not single sign-on.

GitHub Pages is not an allowed origin at the original staff API. A narrowly scoped
gateway on the workspace API forwards only staff login/refresh and exact Content
Studio paths/methods to a fixed upstream. Workspace owner access is checked first,
and the upstream still validates the separate staff JWT and roles. Upstream
redirects are rejected; cookies and workspace identity are never forwarded.
Nothing is ingested, generated or published by visiting the page. Existing n8n
schedule and Meta setup are unchanged. No additional hosting/storage is provisioned.

The existing $5 Workers usage limit still applies to Workers usage, not to the
separate OpenAI, Render, n8n or other account charges. This UI integration adds no
new paid subscription and no scheduled job. Manual research and generation retain
the original services' cost behavior.
