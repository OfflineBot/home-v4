CREATE TABLE IF NOT EXISTS user_dhbw_account (
	user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT,
	dualis     TEXT,
	mail       TEXT,
	moodle     TEXT,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dualis_guard (
	user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	failures        INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
	last_failure_at TEXT,
	next_attempt_at TEXT,
	locked          INTEGER NOT NULL DEFAULT 0
);
