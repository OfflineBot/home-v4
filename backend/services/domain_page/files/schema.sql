CREATE TABLE IF NOT EXISTS files_archive (
	id            TEXT    PRIMARY KEY,
	owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name          TEXT    NOT NULL,
	original_path TEXT    NOT NULL,
	type          TEXT    NOT NULL,
	size          INTEGER NOT NULL,
	deleted_at    TEXT    NOT NULL,
	expires_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_archive_owner ON files_archive(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_archive_expires ON files_archive(expires_at);
