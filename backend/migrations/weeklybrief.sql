CREATE TABLE IF NOT EXISTS weekly_briefs (
 id TEXT PRIMARY KEY, week TEXT NOT NULL, language TEXT NOT NULL,
 status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, report TEXT, actor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS weeklybrief_people (
 email TEXT PRIMARY KEY, label TEXT NOT NULL, aliases TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_brief_date ON events(at);
