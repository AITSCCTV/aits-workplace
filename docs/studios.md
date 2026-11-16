# Studio integration and shared login

Both Studio routes use the same Cloudflare Access workspace session. There are no
separate passwords, staff-login forms or persistent service credentials in the
workspace browser. Sign-out and session expiry lock the Studio interfaces.

The workspace API verifies the Access signature, issuer, audience, expiry and
email allowlist. For Studio requests it also reads the existing staff role from
aits-db: Content allows admin/marketing; Floorplan allows admin/sales/network_engineer.
Workspace owners are admins. Existing matching staff IDs remain the audit identity;
otherwise an owner has a workspace-prefixed ID. Ambiguous staff identities fail
closed. Employee emails are still not enabled; the roster remains deferred.

Each upstream independently checks the forwarded workspace session at a fixed,
HTTPS workspace /auth/studio/content or /auth/studio/floorplan endpoint. Responses
must explicitly authorize the matching tool and permitted role. Invalid sessions,
unavailable checks and redirects fail closed. The Content upstream accepts this
identity only on Content routes, never CRM or other admin routes. The proxy fixes
its destination and methods, strips caller cookies/passwords and enforces body
limits. No authentication secret is placed in a URL.

Content retains the original aits-api Worker, D1 drafts/research, private R2 images,
n8n jobs and explicit publishing checks. The existing standalone dashboard login
continues to work. Floorplan retains its Render Python engine, browser PDF/DXF
readers, photo interpretation, manual editor and downloaded project files. Its
standalone team-password login also remains supported. There is no new storage,
paid service or scheduled job. Existing provider usage costs are unchanged.

Source locations: studios/content and studios/floorplan in this repository;
workspaceStudioAuth.ts and scoped handler changes in AITS-Ai-Chatbox; workspace_auth.py
and server middleware in AITSCCTV/floorplanstudio. Original four Site trees remain
unchanged. The API deployment preserves the live Content Worker's other code and
bindings, applying exact guarded authentication patches; source changes are also
committed so future deployments retain them.

Validation: workspace migration/i18n tests, backend gateway/permission tests,
Content Studio tests, mocked upstream authorization tests and Python compilation.
No live AI generation or social publishing is required for login acceptance.
