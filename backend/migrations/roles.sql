CREATE TABLE IF NOT EXISTS workspace_roles (
 id TEXT PRIMARY KEY, tools TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_role_audit (
 id TEXT PRIMARY KEY, role TEXT NOT NULL, actor TEXT NOT NULL,
 before_data TEXT NOT NULL, after_data TEXT NOT NULL, at TEXT NOT NULL
);
