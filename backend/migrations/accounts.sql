ALTER TABLE workspace_members ADD COLUMN role TEXT NOT NULL DEFAULT 'custom';
CREATE TABLE workspace_passwords (
 email TEXT PRIMARY KEY COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL,
 must_change INTEGER NOT NULL DEFAULT 1, temporary_expires INTEGER,
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE workspace_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE,
 expires INTEGER NOT NULL, password_revision INTEGER NOT NULL
);
CREATE INDEX workspace_sessions_email ON workspace_sessions(email);
CREATE TABLE workspace_login_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
);
