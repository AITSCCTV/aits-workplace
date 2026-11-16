# Project progress module

Route /projects, API /api/projects. D1 tables progress_projects and progress_history. Existing tasks, events, service, warranties and forms are unchanged.

Projects hold sites and sites hold weighted stages. Quantity actual is cumulative and null means unknown, distinct from explicit zero. All actual values require a report date (not future Bangkok date) and evidence text. Overall actual is null until all weighted stages have actual values. Recorded contribution and coverage are separate. Plan is linear inclusive calendar days per stage; overall plan is null until all stages have dates. Variance only when both complete. Manual team forecast dates are not model predictions.

28-point template is a draft, not database seed. IDs A1-A10, B1-B10, C1-C8 come from user. Stage labels and equal weights are editable defaults, not confirmed scope weighting. No reported old aggregate totals are assigned to sites. User must create and save the draft. Site permissions remain owner-only; existing route-access restricts non-owner visitors to forms. No external invites added.

Optimistic revision guard and D1 atomic batch append a snapshot on successful writes only. No delete route. History UI shows versions and dates, not a restore operation. Test via node --test lib/project-progress.test.mjs; build via Sites helper. Production cross-device save and team access are not validated by unit tests.

v11: location-only sites may have zero stages; this remains unknown, not zero progress. Optional location, coordinates (verbatim source string), and source fields are preserved. Existing authenticated MCP endpoint also exposes list_projects and upsert_project (projectJson string), using the same validation and revision control. No authentication/sharing changes. Empty-stage records support verified location registration without invented scope or progress.
