CREATE TABLE IF NOT EXISTS automation_instance (
	id             INTEGER PRIMARY KEY CHECK (id = 1),
	owner_email    TEXT    NOT NULL,
	owner_password TEXT    NOT NULL,
	api_key        TEXT,
	updated_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_workflows (
	workflow_id TEXT    PRIMARY KEY,
	owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_workflows_owner ON automation_workflows(owner_id);

CREATE TABLE IF NOT EXISTS automation_credentials (
	credential_id TEXT    PRIMARY KEY,
	owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name          TEXT    NOT NULL,
	type          TEXT    NOT NULL,
	created_at    TEXT    NOT NULL,
	updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_credentials_owner ON automation_credentials(owner_id);

CREATE TABLE IF NOT EXISTS automation_home_access (
	user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	credential_id TEXT    NOT NULL UNIQUE,
	token_hash    TEXT    NOT NULL UNIQUE,
	created_at    TEXT    NOT NULL
);
