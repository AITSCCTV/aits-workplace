# Employee access

The owner opens `/admin/` using the existing workspace login, adds an email and
selects tools. Employees sign in with their own email; no OpenAI account, staff
dashboard account or Floorplan password is needed. Saving does not send mail.
Disable an employee to block their next request, including requests using an
already-issued JWT. Re-enable retains their selected tools. Email changes are
handled by disabling the old account and adding the new email.

Apply `backend/migrations/members.sql` to DB_PROJECT_BOARD before deploying.
Membership and audit records stay in D1, never in the GitHub Pages bundle.
ADMIN_EMAILS bootstraps protected owners. Employees cannot grant themselves tools,
manage accounts, invoke MCP or run manual calendar sync. The private Sites bridge
cannot manage employees. Writes use revision checks and transactional audit rows.

Tool grants allow the operations a tool normally supports. Calendar and LINE
archive are read-only. Review queue requires tasks, projects and LINE because it
displays source messages and applies reviewed changes to those records. Design
Studio plans and Inventory records retain their existing per-account isolation.
Task/project/service records and Content drafts remain shared workspace records.
Content grants map to the upstream marketing role, Floorplan to network_engineer;
the server preserves an existing staff ID when present. Legacy staff roles do not
override workspace grants. Standalone upstream authentication remains separate.

Every API request verifies JWT signature, issuer, audience and expiry, then looks
up current membership by normalized email. Unknown and disabled users fail closed.
`/auth/me` supplies UI permissions; hiding navigation is not an authorization gate.
Both Studios introspect the same live membership. Requests already in flight may
complete after a permission change; previously downloaded data cannot be recalled.

## Login policy activation

Cloudflare currently protects only `/auth/login` with `AITS owner only`.
Employee access records can be saved but new employees cannot authenticate until
the login policy is updated. The admin page displays this pending state unless
EMPLOYEE_LOGIN_READY is `true`. Set that variable only after verifying the policy.

Proposed final configuration: retain the owner rule and add an Allow rule for the
One-time PIN login method on this same sign-in application. Do not use Bypass,
change the audience, or broaden the protected hostname/path. This lets people
verify email ownership; the Worker still refuses `/auth/login`, `/auth/me` and
every private API unless that verified email is an enabled member or owner.
The Cloudflare dashboard change is awaiting action-time confirmation. Other
applications and their policies must not be changed.

No extra service, subscription, AI call or scheduled job is introduced. Membership
reads use the existing D1 database and remain normal metered requests. Existing
Workers limits are unchanged; this feature does not impose a total Cloudflare bill
cap or change upstream provider billing.

Validation includes normalization, input validation, owner protection, revision
conflicts, audit records, disabled-session rejection, denied unassigned tools,
Studio grants without separate accounts, and preservation of original Site files.
