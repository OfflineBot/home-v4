CREATE TABLE IF NOT EXISTS user_settings (
	user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	theme      TEXT NOT NULL DEFAULT 'mocha',
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS user_settings_for_new_user
AFTER INSERT ON users
BEGIN
	INSERT INTO user_settings (user_id) VALUES (NEW.id);
END;

INSERT OR IGNORE INTO user_settings (user_id) SELECT id FROM users;
