# Employee access

The owner or a delegated administrator opens `/admin/` using the existing workspace login, adds an email and
selects a role and tools. Employees use an existing Google account or an admin-created workspace password; no OpenAI account, staff
dashboard account or Floorplan password is needed. Saving does not send mail.
Disable an employee to block their next request, including requests using an
already-issued JWT. Re-enable retains their selected tools. Role presets are Admin, Engineer, Sales, Marketing, Employee and Custom. Only the owner can assign or modify administrators; delegated admins manage ordinary employees and cannot reset administrator passwords. Email changes are
handled by disabling the old account and adding the new email.

Apply `backend/migrations/members.sql`, then the one-time `backend/migrations/accounts.sql`, to DB_PROJECT_BOARD before deploying. Do not re-run the ALTER TABLE migration.
Membership and audit records stay in D1, never in the GitHub Pages bundle.
ADMIN_EMAILS bootstraps protected owners. Ordinary employees cannot grant themselves tools, manage accounts, invoke MCP or run manual calendar sync. The private Sites bridge
cannot manage employees. Writes use revision checks and transactional audit rows.

Tool grants allow the operations a tool normally supports. Calendar and LINE
archive are read-only. Review queue requires tasks, projects and LINE because it
displays source messages and applies reviewed changes to those records. Design
Studio plans and Inventory records retain their existing per-account isolation.
Task/project/service records and Content drafts remain shared workspace records.
Content grants map to the upstream marketing role, Floorplan to network_engineer;
the server preserves an existing staff ID when present. Legacy staff roles do not
override workspace grants. Standalone upstream authentication remains separate.

Google/email-code requests verify Cloudflare JWT signature, issuer, audience and expiry. Password requests verify a random opaque session against its stored SHA-256 hash, expiry and current password revision. Both then look
up current membership by normalized email. Unknown and disabled users fail closed.
`/auth/me` supplies UI permissions; hiding navigation is not an authorization gate.
Both Studios introspect the same live membership. Requests already in flight may
complete after a permission change; previously downloaded data cannot be recalled.

## Login policy activation

Cloudflare protects only `/auth/login` with `AITS owner only` plus the Allow policy
`AITS verified email - workspace membership required` (ID `b8398967-1850-480c-a64b-8db59db06a67`).
Its Include Login Methods rule accepts Google and One-time PIN. Workspace password
accounts authenticate independently. EMPLOYEE_LOGIN_READY and GOOGLE_LOGIN_READY
are enabled after the live Google identity-provider test succeeded.

Retain the owner rule and the sign-in-only scope. Do not use Bypass,
change the audience, or broaden the protected hostname/path. This lets people
verify email ownership; the Worker still refuses `/auth/login`, `/auth/me` and
every private API unless that verified email is an enabled member or owner.
The Cloudflare dashboard change was approved and applied. Other
applications and their policies must not be changed.

No extra service, subscription, AI call or scheduled job is introduced. Membership
reads use the existing D1 database and remain normal metered requests. Existing
account-wide $5 Workers usage spending limit is unchanged; the per-request CPU ceiling is now 1500 ms to allow strong password hashing; this feature does not impose a total Cloudflare bill
cap or change upstream provider billing.

Validation includes normalization, input validation, owner protection, revision
conflicts, audit records, disabled-session rejection, denied unassigned tools,
Studio grants without separate accounts, and preservation of original Site files.

## Workspace passwords

A workspace account may use a real email or an internal login such as
`engineer01@aits.local`. This creates a login identity, not an email mailbox.
The admin first saves the account, then explicitly creates/resets a temporary
password. The random password is shown once, expires after 24 hours and is never
stored in plaintext. The user must set a 15–128 character password before using
any tool. Administrators cannot retrieve existing passwords. The protected owner
continues using Cloudflare sign-in; create a separate administrator account if a
password-based administrator login is needed.

Password hashing uses Node crypto scrypt (N=32768, r=8, p=3, 32 MiB working memory) and a
random 24-byte salt. Session tokens contain 256 random bits, expire after eight
hours (15 minutes during forced change), and are stored hashed. Password changes,
admin resets and logout revoke password sessions. Both login methods map each
employee to the same stable workspace identity. Owner IDs remain unchanged.

Before hashing, D1 atomically limits login attempts to 5/account/15 minutes,
30/IP/15 minutes and 200 globally/hour across login, reset and change. Resets and password changes also have separate
limits. Existing scheduled maintenance clears expired sessions and counters.
The global limit may temporarily reject legitimate logins during abuse; it bounds
hashing cost. It does not cap D1 costs or all account billing.

Google connection uses a separate OAuth Web Application client in project
`aits-workspace-sign-in` (External, In production), with JavaScript origin
`https://solitary-night-1767.cloudflareaccess.com` and redirect
`https://solitary-night-1767.cloudflareaccess.com/cdn-cgi/access/callback`.
The Google identity provider ID is `823dc235-6c6c-4afc-9c43-13323b18de07`.
The client secret stays in Cloudflare's identity-provider configuration, never in this repository.
The live Google test confirmed the owner identity and requested only email, profile and openid scopes.
The bilingual public sign-in privacy notice is at `/privacy/`.
An earlier unused client named AITS Workspace Sign-in remains in `gmail-api-507406`;
it is not connected to Cloudflare. The existing Calendar client and project audience were not changed.
This does not use the Calendar service-account credential or request Gmail access.
