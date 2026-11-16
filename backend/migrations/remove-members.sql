ALTER TABLE workspace_members ADD COLUMN removed_at TEXT;
ALTER TABLE workspace_members ADD COLUMN revoked_before INTEGER NOT NULL DEFAULT 0;
