CREATE TABLE IF NOT EXISTS workspace_members (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 tools TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_member_audit (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, actor TEXT NOT NULL,
 before_data TEXT, after_data TEXT NOT NULL, at TEXT NOT NULL
);
