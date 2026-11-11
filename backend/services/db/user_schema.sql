
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY,
	name          TEXT    NOT NULL COLLATE NOCASE UNIQUE,
	password_hash TEXT    NOT NULL,
	is_admin      INTEGER NOT NULL DEFAULT 0,
	approved_at   TEXT,
	created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

