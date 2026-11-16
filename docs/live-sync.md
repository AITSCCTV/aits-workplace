# Calendar and LINE connections

The workspace uses owner-authenticated API routes. Employee onboarding remains deferred.

## Google Calendar

`backend/calendar-sync.mjs` lists the exact eight approved calendar IDs. The service account is `aits-workspace-sync@gmail-api-507406.iam.gserviceaccount.com`, shared as Reader on each calendar. Authentication uses the `calendar.events.readonly` scope; no domain-wide delegation or event writes are used. The JSON credential lives only in the encrypted Cloudflare Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON`. Never commit credentials or put them in Pages configuration.

Cron runs every 15 minutes. Each run fetches the previous 30 days and next 180 days, expands recurring events, and atomically replaces the private D1 snapshot only after all eight calendars succeed. Removed/cancelled events disappear on the next successful refresh. All-day end dates retain Google's exclusive-end semantics. Calendar ownership does not imply staff assignment.

One attempt is allowed per 15-minute slot, including failures. Each calendar is limited to three pages of 500 events. An oversized or incomplete response fails without replacing the last successful snapshot. The interface shows last success, coverage, errors and stale data. The open calendar page refreshes every minute; this reads D1, not Google. Dates outside the window are not evidence of availability.

Apply `backend/migrations/sync.sql` before deploying. `sync_status` records attempts and successful completion without storing provider errors or credentials. Remove the cron trigger to stop future calendar refreshes; the last snapshot remains available.

## LINE

The existing `aits-db` is bound as `DB_LINE_ARCHIVE`. `/project-board/api/line` executes SELECT statements only, with parameterized filters and 50-message cursor pagination. It uses existing timestamp/customer indexes. No archive tables, original webhook, existing bot, or original app credentials are modified.

The LINE page reads the current archive when opened, refreshed, or every 60 seconds while visible. This includes only messages actually received by the existing archive; it cannot access other personal chats. Selecting a sender opens that archived conversation. Older pages are available; automatic refresh returns to the latest 50 messages. Message bodies and customer names are shown verbatim, as text, without interpreting HTML. Bodies are limited to 12,000 characters per response. Attachment downloads, raw metadata and customer contact columns are not exposed by this view. Original message text can still contain private contact or financial details and remains owner-only. There is no automatic task creation, completion or outbound messaging.

## Cost boundaries

No new subscriptions, paid AI calls, extra R2 objects, LINE outbound messages or paid Google services are introduced. At 31 days, calendar scheduling is 2,976 runs and normally 23,808 Google event-list calls; the page cap bounds this at 71,424 calls. Each run has a few D1 operations. LINE reads depend on active viewers and pagination. Existing account-wide usage from other applications still counts toward shared allowances.

The existing $5 Workers usage spending limit is NOT a $5 total-bill cap: it excludes subscriptions, D1, R2 and other products, and enforcement can lag. These changes are intended to remain within the account's existing included allowances at ordinary internal-team traffic. They cannot guarantee an absolute account-wide bill. No plan changes or payment actions are authorized.
