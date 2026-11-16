CREATE TABLE IF NOT EXISTS assistant_chats(actor TEXT NOT NULL,permissions TEXT NOT NULL,conversation_id TEXT NOT NULL,title TEXT,deleted_at TEXT,PRIMARY KEY(actor,permissions,conversation_id));
