CREATE TABLE IF NOT EXISTS sync_status (
 id TEXT PRIMARY KEY, slot INTEGER NOT NULL DEFAULT -1,
 status TEXT NOT NULL DEFAULT 'not_started', attempted_at TEXT,
 success_at TEXT, error_code TEXT
);
INSERT OR IGNORE INTO sync_status(id) VALUES('calendar');
