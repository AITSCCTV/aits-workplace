# Content Studio AI Instructions

Marketing users with the Content Studio tool grant and signed-in administrators can open **AI Instructions** in the library. The four fields control research, Monday education, Thursday marketing, and caption/SEO style. Save applies to future runs; it never generates or publishes a post. Preview is text-only. Restore loads an older version into the editor and requires Save to activate.

The authenticated Workspace endpoint is `/project-board/api/staff/admin/content-studio/instructions` (GET/PUT). Versions are append-only in `content_studio_instruction_versions` in the existing AITS database. Writes require the current revision; concurrent edits return 409. The API only accepts the four text fields, with 6,000 characters per field. Versions record the editor and timestamp.

n8n uses its existing ingest credential to POST `{ "instructionsRead": true }` to the shared Content Studio ingest endpoint. This authenticated branch only reads the latest instructions. The workflow reads one snapshot per run and carries its revision in run state. Loading failure stops the run rather than silently ignoring saved instructions. Revision zero preserves the original prompt behavior; saved preferences supplement and supersede default editorial examples only.

Output schemas, verification code, schedules, models, official logo, brand colors/fonts, the four contact-banner details, and publishing approval remain outside the editable settings. Preferences cannot modify node configuration, access credentials, or enable publishing. Model instructions reinforce these restrictions; existing strict schema validation and the separate review/publishing API remain in force. Marketing still reviews generated text and images before posting.

Deployment: apply `backend/migrations/content-studio-instructions.sql` to `aits-db`, deploy the Workspace Worker, and apply `scripts/patch-content-studio-instructions.mjs` to a freshly downloaded shared Worker bundle while retaining all bindings. The patch fails if its single anchor changes. Publish the matching n8n version after verifying its authenticated read node. No social publishing test is required.
