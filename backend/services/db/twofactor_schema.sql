CREATE TABLE IF NOT EXISTS user_twofactor (
	user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	secret       TEXT    NOT NULL,
	last_counter INTEGER NOT NULL DEFAULT 0,
	confirmed_at TEXT,
	created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
