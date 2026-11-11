CREATE TABLE IF NOT EXISTS mail_folders (
	owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id        TEXT    NOT NULL,
	ews_id    TEXT    NOT NULL,
	parent_id TEXT,
	name      TEXT    NOT NULL,
	role      TEXT    NOT NULL,
	position  INTEGER NOT NULL,
	synced_at TEXT    NOT NULL,
	PRIMARY KEY (owner_id, id)
);

CREATE TABLE IF NOT EXISTS mail_messages (
	owner_id        INTEGER NOT NULL,
	id              TEXT    NOT NULL,
	ews_id          TEXT    NOT NULL,
	folder          TEXT    NOT NULL,
	conversation_id TEXT    NOT NULL,
	subject         TEXT    NOT NULL,
	sender_name     TEXT    NOT NULL,
	sender_email    TEXT    NOT NULL,
	to_recipients   TEXT    NOT NULL,
	cc_recipients   TEXT    NOT NULL DEFAULT '[]',
	received        TEXT    NOT NULL,
	is_read         INTEGER NOT NULL,
	has_attachments INTEGER NOT NULL,
	body            TEXT    NOT NULL DEFAULT '',
	body_html       TEXT    NOT NULL DEFAULT '',
	unsubscribe_url TEXT    NOT NULL DEFAULT '',
	body_synced     INTEGER NOT NULL DEFAULT 0,
	synced_at       TEXT    NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, folder) REFERENCES mail_folders(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(owner_id, folder, received);

CREATE TABLE IF NOT EXISTS mail_attachments (
	owner_id     INTEGER NOT NULL,
	message_id   TEXT    NOT NULL,
	id           TEXT    NOT NULL,
	ews_id       TEXT    NOT NULL,
	filename     TEXT    NOT NULL,
	content_type TEXT    NOT NULL,
	size         INTEGER NOT NULL,
	content_id   TEXT    NOT NULL,
	is_inline    INTEGER NOT NULL,
	path         TEXT,
	position     INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, message_id) REFERENCES mail_messages(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(owner_id, message_id, position);

CREATE TABLE IF NOT EXISTS mail_contacts (
	owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	email    TEXT    NOT NULL,
	name     TEXT    NOT NULL,
	search   TEXT    NOT NULL,
	sent     INTEGER NOT NULL,
	received INTEGER NOT NULL,
	last_at  TEXT    NOT NULL,
	PRIMARY KEY (owner_id, email)
);

CREATE TABLE IF NOT EXISTS mail_recipients (
	owner_id   INTEGER NOT NULL,
	message_id TEXT    NOT NULL,
	position   INTEGER NOT NULL,
	kind       TEXT    NOT NULL,
	name       TEXT    NOT NULL,
	email      TEXT    NOT NULL,
	PRIMARY KEY (owner_id, message_id, position),
	FOREIGN KEY (owner_id, message_id) REFERENCES mail_messages(owner_id, id) ON DELETE CASCADE
);
