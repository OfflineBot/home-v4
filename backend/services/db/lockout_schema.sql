CREATE TABLE IF NOT EXISTS user_lockouts (
	user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	failures     INTEGER NOT NULL DEFAULT 0,
	level        INTEGER NOT NULL DEFAULT 0,
	locked_until TEXT,
	permanent    INTEGER NOT NULL DEFAULT 0,
	updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
