CREATE TABLE IF NOT EXISTS moodle_courses (
	owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id              INTEGER NOT NULL,
	shortname       TEXT    NOT NULL,
	fullname        TEXT    NOT NULL,
	summary         TEXT    NOT NULL,
	category        TEXT    NOT NULL,
	semester        TEXT    NOT NULL,
	semester_number INTEGER NOT NULL,
	is_current      INTEGER NOT NULL,
	is_favourite    INTEGER NOT NULL,
	start_date      INTEGER NOT NULL,
	end_date        INTEGER NOT NULL,
	image_source    TEXT    NOT NULL,
	image_path      TEXT,
	image_type      TEXT    NOT NULL,
	position        INTEGER NOT NULL,
	synced_at       TEXT    NOT NULL,
	PRIMARY KEY (owner_id, id)
);

CREATE TABLE IF NOT EXISTS moodle_sections (
	owner_id  INTEGER NOT NULL,
	course_id INTEGER NOT NULL,
	id        INTEGER NOT NULL,
	number    INTEGER NOT NULL,
	name      TEXT    NOT NULL,
	summary   TEXT    NOT NULL,
	position  INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, course_id) REFERENCES moodle_courses(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moodle_sections_course ON moodle_sections(owner_id, course_id, position);

CREATE TABLE IF NOT EXISTS moodle_modules (
	owner_id     INTEGER NOT NULL,
	section_id   INTEGER NOT NULL,
	id           INTEGER NOT NULL,
	name         TEXT    NOT NULL,
	modname      TEXT    NOT NULL,
	url          TEXT    NOT NULL,
	indent       INTEGER NOT NULL,
	description  TEXT    NOT NULL,
	availability TEXT    NOT NULL,
	content      TEXT    NOT NULL,
	position     INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, section_id) REFERENCES moodle_sections(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moodle_modules_section ON moodle_modules(owner_id, section_id, position);

CREATE TABLE IF NOT EXISTS moodle_files (
	owner_id      INTEGER NOT NULL,
	module_id     INTEGER NOT NULL,
	id            TEXT    NOT NULL,
	filename      TEXT    NOT NULL,
	filepath      TEXT    NOT NULL,
	type          TEXT    NOT NULL,
	file_url      TEXT    NOT NULL,
	mimetype      TEXT    NOT NULL,
	filesize      INTEGER NOT NULL,
	time_modified INTEGER NOT NULL,
	path          TEXT,
	embedded      INTEGER NOT NULL,
	position      INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, module_id) REFERENCES moodle_modules(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moodle_files_module ON moodle_files(owner_id, module_id, position);

CREATE TABLE IF NOT EXISTS moodle_assets (
	owner_id  INTEGER NOT NULL,
	course_id INTEGER NOT NULL,
	id        TEXT    NOT NULL,
	url       TEXT    NOT NULL,
	mimetype  TEXT    NOT NULL,
	path      TEXT,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, course_id) REFERENCES moodle_courses(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moodle_grades (
	owner_id    INTEGER NOT NULL,
	course_id   INTEGER NOT NULL,
	id          INTEGER NOT NULL,
	name        TEXT    NOT NULL,
	item_type   TEXT    NOT NULL,
	item_module TEXT    NOT NULL,
	grade       REAL,
	grade_min   REAL    NOT NULL,
	grade_max   REAL    NOT NULL,
	passed      INTEGER,
	formatted   TEXT    NOT NULL,
	feedback    TEXT    NOT NULL,
	position    INTEGER NOT NULL,
	PRIMARY KEY (owner_id, id),
	FOREIGN KEY (owner_id, course_id) REFERENCES moodle_courses(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moodle_grades_course ON moodle_grades(owner_id, course_id, position);

CREATE TABLE IF NOT EXISTS moodle_placements (
	owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	course_id INTEGER NOT NULL,
	semester  INTEGER NOT NULL CHECK (semester BETWEEN 0 AND 20),
	position  INTEGER NOT NULL CHECK (position >= 0),
	PRIMARY KEY (owner_id, course_id)
);
