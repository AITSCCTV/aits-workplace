# Project workspace v1
Owner-private only. Integrated into /projects and the same progress_projects JSON snapshot + revision audit. No new tables or backfill. Existing projects without workspace get an empty workspace. Existing tool callers omitting workspace preserve stored workspace, preventing accidental removal.

Functional: material register; project receipts/actual-use/returns/waste with explicit evidence/date, up to 3 decimals; internal procurement request draft/status; manually sourced unit costs for consumed/waste quantities plus other project cost lines; missing prices counted. Receipts do not count as consumption expense. Project receipt is not a central warehouse movement. No cost valuation/FIFO, cross-Site sync, purchasing notification, purchase/approval, accounting posting or team access. Owner enters status; queue does not notify any person. Status received does not itself add materials.

Opening stock must be explicitly recorded with evidence; no current quantities seeded from historical workbook. No transaction edit UI yet; snapshots retained. Monetary amounts THB excluding VAT, user-entered, not independently verified. No claim costs complete even if missing-price count is zero. Full accounting report, permissions, cancellation/reversal controls remain future work.

Tests: project-workspace.test.mjs + project-progress.test.mjs. No production test records created. Authenticated save/reload and team use still need UI verification.
