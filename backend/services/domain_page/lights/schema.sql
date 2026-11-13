CREATE TABLE IF NOT EXISTS lights (
	id         INTEGER PRIMARY KEY,
	owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT    NOT NULL COLLATE NOCASE,
	url        TEXT    NOT NULL,
	created_at TEXT    NOT NULL DEFAULT (datetime('now')),
	UNIQUE (owner_id, name),
	UNIQUE (owner_id, url)
);

CREATE INDEX IF NOT EXISTS idx_lights_owner ON lights(owner_id);

-- a side table, not a column on lights: the schema runner only creates tables,
-- so a new column would never reach an existing database
CREATE TABLE IF NOT EXISTS light_profiles (
	light_id INTEGER PRIMARY KEY REFERENCES lights(id) ON DELETE CASCADE,
	kind     TEXT NOT NULL DEFAULT 'wled' CHECK (kind IN ('wled', 'shelly')),
	scenes   TEXT NOT NULL DEFAULT ''
);
