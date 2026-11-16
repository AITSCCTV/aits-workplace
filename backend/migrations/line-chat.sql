CREATE TABLE IF NOT EXISTS workspace_line_outbox (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, customer_id TEXT NOT NULL,
 message TEXT NOT NULL, month TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL, provider_id TEXT, sent_at TEXT
);
CREATE INDEX IF NOT EXISTS workspace_line_outbox_month ON workspace_line_outbox(month,status);
