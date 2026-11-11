CREATE TABLE IF NOT EXISTS sync_state (
	user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job         TEXT    NOT NULL,
	started_at  TEXT,
	finished_at TEXT,
	success_at  TEXT,
	error       TEXT,
	PRIMARY KEY (user_id, job)
);

CREATE TABLE IF NOT EXISTS sync_settings (
	user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job              TEXT    NOT NULL,
	interval_minutes INTEGER NOT NULL CHECK (interval_minutes >= 5),
	PRIMARY KEY (user_id, job)
);
