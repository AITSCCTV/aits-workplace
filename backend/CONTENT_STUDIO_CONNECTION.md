# Facebook connection repair — 25 November 2026

The Monday education draft `edu_20261123` failed because Meta rejected the saved Page credential with code 190 / subcode 463 (expired session). Meta reported expiry on 19 November 2026 at 12:00 Bangkok time. The draft and image remain intact. No publication was attempted during diagnosis.

The shared `aits-api` status route now performs a read-only Page identity check. It returns a safe reason and reports Facebook ready only when the token resolves to the configured Page. No credential or provider error message is returned. Workspace displays an actionable Thai/English renewal message for expired or invalid tokens.

Live shared Worker deployment: `7ea13538fce24c05a34b5fed08585d0e`. All 53 bindings were preserved. Scoped patch source is `backend/content-studio-facebook-health.mjs`; `scripts/patch-content-studio-health.mjs` applies it to a freshly downloaded compatible bundle. Future shared backend rebuilds must integrate this check into their authenticated Content Studio status route.

Credential renewal remains required: replace `CONTENT_STUDIO_FACEBOOK_PAGE_TOKEN` in the `aits-api` production Worker with a valid AITS Page token, then refresh Content Studio and verify the read-only connection check. Prefer a properly provisioned long-lived Page token; do not use a short-lived Explorer user token as the production Page credential. Never copy secrets into source or chat.

Tests cover valid Page identity, expired credentials, wrong Page, network failures, missing configuration, no publishing side effects, and no secret leakage. Existing publication records and duplicate/uncertain-outcome protection are unchanged.
