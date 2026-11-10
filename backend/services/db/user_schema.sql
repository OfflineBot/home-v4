
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY,
	name          TEXT    NOT NULL UNIQUE,
	password_hash TEXT    NOT NULL,
	is_admin      INTEGER NOT NULL DEFAULT 0,
	created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

