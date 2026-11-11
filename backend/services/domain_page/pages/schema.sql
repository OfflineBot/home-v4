CREATE TABLE IF NOT EXISTS pages (
	id         INTEGER PRIMARY KEY,
	owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
	title      TEXT    NOT NULL DEFAULT '',
	source     TEXT    NOT NULL CHECK (source IN ('git', 'files')),
	repo_id    INTEGER REFERENCES git_repos(id) ON DELETE SET NULL,
	ref        TEXT    NOT NULL DEFAULT '',
	folder     TEXT    NOT NULL DEFAULT '',
	spa        INTEGER NOT NULL DEFAULT 0,
	enabled    INTEGER NOT NULL DEFAULT 1,
	created_at TEXT    NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_id);
