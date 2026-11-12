CREATE TABLE IF NOT EXISTS public_files (
	id           TEXT PRIMARY KEY,
	name         TEXT NOT NULL,
	size         INTEGER NOT NULL DEFAULT 0,
	content_type TEXT NOT NULL DEFAULT '',
	uploader     TEXT NOT NULL DEFAULT '',
	created_at   TEXT NOT NULL,
	downloads    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public_store (
	id          INTEGER PRIMARY KEY CHECK (id = 1),
	upload_key  TEXT NOT NULL DEFAULT '',
	uploads_open INTEGER NOT NULL DEFAULT 0,
	updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO public_store (id) VALUES (1);
