CREATE TABLE IF NOT EXISTS grades (
	id           INTEGER PRIMARY KEY,
	owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	semester_id  TEXT    NOT NULL,
	semester     TEXT    NOT NULL,
	module_id    TEXT    NOT NULL,
	name         TEXT    NOT NULL,
	grade        REAL    CHECK (grade IS NULL OR grade BETWEEN 1.0 AND 5.0),
	ects         REAL    NOT NULL CHECK (ects >= 0),
	status       TEXT    NOT NULL CHECK (status IN ('passed', 'failed', 'pending')),
	detail_args  TEXT    NOT NULL,
	attempts     TEXT    NOT NULL DEFAULT '[]',
	not_original INTEGER NOT NULL DEFAULT 0,
	position     INTEGER NOT NULL,
	synced_at    TEXT    NOT NULL,
	UNIQUE (owner_id, semester_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_grades_owner ON grades(owner_id, position);
