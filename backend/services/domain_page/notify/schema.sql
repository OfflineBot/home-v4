CREATE TABLE IF NOT EXISTS notifications (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title      TEXT NOT NULL,
	body       TEXT NOT NULL DEFAULT '',
	link       TEXT NOT NULL DEFAULT '',
	source     TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	read_at    TEXT
);

CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications(user_id, id DESC);

CREATE TABLE IF NOT EXISTS notify_settings (
	user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	hook_key     TEXT NOT NULL DEFAULT '',
	hook_enabled INTEGER NOT NULL DEFAULT 0,
	updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notify_settings_key
	ON notify_settings(hook_key) WHERE hook_key <> '';

CREATE TRIGGER IF NOT EXISTS notify_settings_for_new_user
AFTER INSERT ON users
BEGIN
	INSERT INTO notify_settings (user_id) VALUES (NEW.id);
END;

INSERT OR IGNORE INTO notify_settings (user_id) SELECT id FROM users;
