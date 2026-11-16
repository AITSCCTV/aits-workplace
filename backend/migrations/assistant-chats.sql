ALTER TABLE assistant_turns ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS assistant_conversation ON assistant_turns(actor,permissions,conversation_id,created_at);
