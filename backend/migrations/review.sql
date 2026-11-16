CREATE TABLE IF NOT EXISTS line_review (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, proposal TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','dismissed')),
 created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT,
 target_kind TEXT, target_id TEXT, applied_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_line_review_state_created ON line_review(state,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS line_review_scan (
 id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL DEFAULT 0,
 slot INTEGER NOT NULL DEFAULT -1, status TEXT NOT NULL DEFAULT 'not_started',
 last_at TEXT, created_count INTEGER NOT NULL DEFAULT 0
);
