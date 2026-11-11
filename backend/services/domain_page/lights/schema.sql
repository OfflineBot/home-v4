CREATE TABLE IF NOT EXISTS lights (
	id         INTEGER PRIMARY KEY,
	owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT    NOT NULL,
	ip         TEXT    NOT NULL,
	created_at TEXT    NOT NULL DEFAULT (datetime('now')),
	UNIQUE (owner_id, name),
	UNIQUE (owner_id, ip)
);

CREATE INDEX IF NOT EXISTS idx_lights_owner ON lights(owner_id);
