CREATE TABLE IF NOT EXISTS content_studio_instruction_versions (
 revision INTEGER PRIMARY KEY,
 instructions TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL
);
