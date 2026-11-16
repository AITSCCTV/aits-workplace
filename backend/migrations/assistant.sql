CREATE TABLE IF NOT EXISTS assistant_usage(id TEXT PRIMARY KEY,actor TEXT NOT NULL,month TEXT NOT NULL,reserved_micros INTEGER NOT NULL,actual_micros INTEGER,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS assistant_usage_month ON assistant_usage(month);
CREATE TABLE IF NOT EXISTS assistant_turns(id TEXT PRIMARY KEY,actor TEXT NOT NULL,question TEXT NOT NULL,result TEXT,permissions TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS assistant_turns_actor ON assistant_turns(actor,created_at DESC);
CREATE TABLE IF NOT EXISTS assistant_actions(id TEXT PRIMARY KEY,turn_id TEXT NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assistant_quotations(id TEXT PRIMARY KEY,actor TEXT NOT NULL,customer_id TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL);
