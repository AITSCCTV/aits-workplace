CREATE TABLE IF NOT EXISTS pm_task_details (
 task_id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT '',
 parent_id TEXT NOT NULL DEFAULT '', assignees TEXT NOT NULL DEFAULT '[]',
 start_date TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pm_parent ON pm_task_details(parent_id);
CREATE INDEX IF NOT EXISTS pm_project ON pm_task_details(project_id);
CREATE TABLE IF NOT EXISTS pm_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT OR IGNORE INTO pm_state VALUES(1,1);
