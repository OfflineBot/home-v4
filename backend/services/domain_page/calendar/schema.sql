CREATE TABLE IF NOT EXISTS calendar_sources (
	owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       TEXT    NOT NULL,
	value      TEXT    NOT NULL,
	updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (owner_id, kind)
);

CREATE TABLE IF NOT EXISTS calendar_events (
	owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id           TEXT    NOT NULL,
	source       TEXT    NOT NULL,
	start_at     TEXT    NOT NULL,
	end_at       TEXT    NOT NULL,
	title        TEXT    NOT NULL,
	topic        TEXT    NOT NULL,
	room         TEXT    NOT NULL,
	teacher      TEXT    NOT NULL,
	kind         TEXT    NOT NULL,
	is_online    INTEGER NOT NULL,
	is_cancelled INTEGER NOT NULL,
	info         TEXT    NOT NULL,
	PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events(owner_id, start_at);

CREATE TABLE IF NOT EXISTS calendar_categories (
	owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id       TEXT    NOT NULL,
	name     TEXT    NOT NULL,
	color    TEXT    NOT NULL,
	source   TEXT    NOT NULL DEFAULT '',
	hidden   INTEGER NOT NULL DEFAULT 0,
	position INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id)
);

CREATE TABLE IF NOT EXISTS calendar_entries (
	owner_id    INTEGER NOT NULL,
	id          TEXT    NOT NULL,
	category_id TEXT    NOT NULL,
	title       TEXT    NOT NULL,
	start_at    TEXT    NOT NULL,
	end_at      TEXT    NOT NULL,
	room        TEXT    NOT NULL,
	description TEXT    NOT NULL,
	mark        TEXT    NOT NULL CHECK (mark IN ('normal', 'important', 'hidden')),
	updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, category_id) REFERENCES calendar_categories(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_range ON calendar_entries(owner_id, start_at);

CREATE TABLE IF NOT EXISTS calendar_marks (
	owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	event_id TEXT    NOT NULL,
	mark     TEXT    NOT NULL CHECK (mark IN ('normal', 'important', 'hidden')),
	PRIMARY KEY (owner_id, event_id)
);
