CREATE TABLE IF NOT EXISTS grades (
	id            INTEGER PRIMARY KEY,
	owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	semester      INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 255),
	semester_info TEXT    NOT NULL DEFAULT '',
	topic         TEXT    NOT NULL,
	points        REAL    NOT NULL CHECK (points >= 0),
	grade         REAL    NOT NULL,
	created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grades_owner ON grades(owner_id, semester);
