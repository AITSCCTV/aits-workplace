# Human-reviewed LINE updates

The approved review queue is a bounded, rule-based inbox, not a paid LLM service. It does not interpret messages as instructions to execute. Thai/English action keywords create suggestions, not assertions that a job was completed or a date agreed. Ambiguous content and duplicate conversational requests require human judgment.

The shared 15-minute scheduled handler calls `scanLine`. It reads at most 100 archive rows per run, queues at most 30 suggestions, and advances a durable rowid cursor in the same D1 batch as new suggestions. The first run starts with the latest 100 archive rows, not the complete historical archive. Backdated messages inserted after activation are still discovered. Bot output and non-text attachments are excluded. Source text is bounded to 6,000 characters. No additional AI calls, media downloads, LINE sends or Google writes occur.

One scan is permitted per 15-minute slot. A unique source-message ID prevents re-queuing the same message. The queue pauses at 2,000 pending or 10,000 total records; nothing is silently deleted to make space. The UI shows scanner status. These limits bound work/storage, not the account-wide invoice. Existing Cloudflare Workers spending controls still exclude D1/R2 and subscription fees.

The owner can edit each proposal and explicitly select:

- Create a task: title, customer, next step and status, with no inferred assignee or due date.
- Update a task: explicitly select the target and review its previous values. Other fields, including owner, due date and quote state, remain unchanged. Source evidence is appended.
- Append a project note: explicitly select a project. Its existing notes, progress, stages, quantities, materials and costs are preserved. Notes that exceed the existing project limit are rejected.

Only POST `action=approve` can change work records. Source evidence, actor and timestamp are retained. Conditional target revision checks, audit writes and review-state changes use one D1 transaction. A stale revision or already reviewed suggestion returns 409. Dismissal changes only the queue state. The Sites bridge is not authorized for review routes. Existing owner-only JWT authorization and CORS protections apply.

Apply `backend/migrations/review.sql` before deploying. The UI lives at `/project-board/review/`. Production verification must never approve real customer suggestions on the owner's behalf; use isolated tests for approval and mutation behavior.

## Design system

The deployed workspace uses its own AITS design system inspired by the requested references: Apple-style restrained transitions, Linear-style navigation and density, editorial type hierarchy inspired by Pentagram, MUJI-like warm restraint, Airbnb-like visible search/filter state, Notion-like modular overview blocks, and Framer-like hover/press feedback. It uses Inter with IBM Plex Sans Thai, accessible focus states, native dialogs, keyboard tool search, and reduced-motion support. No brand marks or proprietary assets from those references are used.

All original imported Sites source files remain preserved. Shared shell and visual adapters live under `web/`, and `scripts/build.mjs` adds the new surfaces to GitHub Pages. Dashboard metrics come from existing authenticated APIs; unavailable data is not shown as zero. Thai remains the default, with English available.
