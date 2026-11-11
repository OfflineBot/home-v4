CREATE TABLE IF NOT EXISTS machines (
	id               INTEGER PRIMARY KEY,
	owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name             TEXT    NOT NULL,
	mac              TEXT    NOT NULL,
	username         TEXT    NOT NULL,
	broadcast        TEXT    NOT NULL,
	ip               TEXT    NOT NULL,
	ssh_port         INTEGER NOT NULL CHECK (ssh_port BETWEEN 1 AND 65535),
	wake_on_lan_port INTEGER NOT NULL CHECK (wake_on_lan_port BETWEEN 1 AND 65535),
	created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
	UNIQUE (owner_id, name),
	UNIQUE (owner_id, mac)
);

CREATE INDEX IF NOT EXISTS idx_machines_owner ON machines(owner_id);

CREATE TABLE IF NOT EXISTS machine_host_keys (
	machine_id  INTEGER PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
	owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	key_type    TEXT    NOT NULL,
	key         TEXT    NOT NULL,
	fingerprint TEXT    NOT NULL,
	added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
