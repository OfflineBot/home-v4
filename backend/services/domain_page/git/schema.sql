CREATE TABLE IF NOT EXISTS git_projects (
	id         INTEGER PRIMARY KEY,
	owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
	created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_git_projects_owner ON git_projects(owner_id);

CREATE TABLE IF NOT EXISTS git_repos (
	id          INTEGER PRIMARY KEY,
	project_id  INTEGER NOT NULL REFERENCES git_projects(id) ON DELETE CASCADE,
	name        TEXT    NOT NULL COLLATE NOCASE,
	description TEXT    NOT NULL DEFAULT '',
	private     INTEGER NOT NULL DEFAULT 1,
	created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
	UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS git_tokens (
	id           INTEGER PRIMARY KEY,
	owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name         TEXT    NOT NULL,
	token_hash   TEXT    NOT NULL UNIQUE,
	prefix       TEXT    NOT NULL,
	created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
	last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_git_tokens_owner ON git_tokens(owner_id);

CREATE TABLE IF NOT EXISTS git_ssh_keys (
	id           INTEGER PRIMARY KEY,
	owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name         TEXT    NOT NULL,
	fingerprint  TEXT    NOT NULL UNIQUE,
	public_key   TEXT    NOT NULL,
	created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
	last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_git_ssh_keys_owner ON git_ssh_keys(owner_id);
