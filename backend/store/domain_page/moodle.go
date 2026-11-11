package domainpage

import (
	"database/sql"
)

const moodleLinkType = "url"

type MoodleCourse struct {
	ID             int64           `json:"id"`
	OwnerID        int64           `json:"-"`
	Shortname      string          `json:"shortname"`
	Fullname       string          `json:"fullname"`
	Summary        string          `json:"summary"`
	Category       string          `json:"category"`
	Semester       string          `json:"semester"`
	SemesterNumber int             `json:"semester_number"`
	IsCurrent      bool            `json:"is_current"`
	IsFavourite    bool            `json:"is_favourite"`
	StartDate      int64           `json:"start_date"`
	EndDate        int64           `json:"end_date"`
	ImageSource    string          `json:"-"`
	ImagePath      *string         `json:"-"`
	ImageType      string          `json:"-"`
	HasImage       bool            `json:"has_image"`
	Placement      CoursePlacement `json:"placement"`
	Position       int             `json:"-"`
	SyncedAt       string          `json:"synced_at"`
}

type CoursePlacement struct {
	Semester int  `json:"semester"`
	Position int  `json:"position"`
	Custom   bool `json:"custom"`
}

type MoodlePlacement struct {
	CourseID int64 `json:"course_id"`
	Semester int   `json:"semester"`
	Position int   `json:"position"`
}

type MoodleSection struct {
	ID       int64          `json:"id"`
	CourseID int64          `json:"-"`
	Number   int            `json:"number"`
	Name     string         `json:"name"`
	Summary  string         `json:"summary"`
	Position int            `json:"-"`
	Modules  []MoodleModule `json:"modules"`
}

type MoodleModule struct {
	ID           int64        `json:"id"`
	SectionID    int64        `json:"-"`
	Name         string       `json:"name"`
	Modname      string       `json:"modname"`
	URL          string       `json:"url"`
	Indent       int          `json:"indent"`
	Description  string       `json:"description"`
	Availability string       `json:"availability"`
	HasContent   bool         `json:"has_content"`
	Content      string       `json:"content,omitempty"`
	Position     int          `json:"-"`
	Files        []MoodleFile `json:"files"`
}

type MoodleFile struct {
	ID           string  `json:"id"`
	ModuleID     int64   `json:"-"`
	Filename     string  `json:"filename"`
	Filepath     string  `json:"filepath"`
	Type         string  `json:"type"`
	FileURL      string  `json:"-"`
	Link         string  `json:"link,omitempty"`
	Mimetype     string  `json:"mimetype"`
	Filesize     int64   `json:"filesize"`
	TimeModified int64   `json:"time_modified"`
	Path         *string `json:"-"`
	Downloaded   bool    `json:"downloaded"`
	Embedded     bool    `json:"embedded"`
	Position     int     `json:"-"`
}

type MoodleAsset struct {
	ID       string
	CourseID int64
	URL      string
	Mimetype string
	Path     *string
}

type MoodleGrade struct {
	ID         int64    `json:"id"`
	CourseID   int64    `json:"course_id"`
	Name       string   `json:"name"`
	ItemType   string   `json:"item_type"`
	ItemModule string   `json:"item_module"`
	Grade      *float64 `json:"grade"`
	GradeMin   float64  `json:"grade_min"`
	GradeMax   float64  `json:"grade_max"`
	Passed     *bool    `json:"passed"`
	Formatted  string   `json:"formatted"`
	Feedback   string   `json:"feedback"`
	Position   int      `json:"-"`
}

type MoodleSnapshot struct {
	Courses  []MoodleCourse
	Sections []MoodleSection
	Modules  []MoodleModule
	Files    []MoodleFile
	Assets   []MoodleAsset
	Grades   []MoodleGrade
}

const (
	moodleCourseSelect = `
		SELECT c.id, c.owner_id, c.shortname, c.fullname, c.summary, c.category, c.semester,
			c.semester_number, c.is_current, c.is_favourite, c.start_date, c.end_date,
			c.image_source, c.image_path, c.image_type, c.position, c.synced_at,
			coalesce(p.semester, c.semester_number), coalesce(p.position, c.position), p.course_id IS NOT NULL
		FROM moodle_courses c
		LEFT JOIN moodle_placements p ON p.owner_id = c.owner_id AND p.course_id = c.id`
	moodleModuleColumns = "m.id, m.section_id, m.name, m.modname, m.url, m.indent, m.description, m.availability, m.content <> '', m.position"
	moodleFileColumns   = "f.id, f.module_id, f.filename, f.filepath, f.type, f.file_url, f.mimetype, f.filesize, f.time_modified, f.path, f.embedded, f.position"
)

func MoodleCourses(conn *sql.DB, ownerID int64) ([]MoodleCourse, error) {
	rows, err := conn.Query(moodleCourseSelect+" WHERE c.owner_id = ? ORDER BY c.position", ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	courses := []MoodleCourse{}
	for rows.Next() {
		course, err := scanMoodleCourse(rows)
		if err != nil {
			return nil, err
		}
		courses = append(courses, *course)
	}

	return courses, rows.Err()
}

func MoodleCourseByID(conn *sql.DB, ownerID, id int64) (*MoodleCourse, error) {
	return scanMoodleCourse(conn.QueryRow(moodleCourseSelect+" WHERE c.owner_id = ? AND c.id = ?", ownerID, id))
}

func MoodleContents(conn *sql.DB, ownerID, courseID int64) ([]MoodleSection, error) {
	sections, err := moodleSections(conn, ownerID, courseID)
	if err != nil {
		return nil, err
	}

	sectionIndex := map[int64]int{}
	for i, s := range sections {
		sectionIndex[s.ID] = i
	}

	modules, err := moodleModules(conn, ownerID, courseID)
	if err != nil {
		return nil, err
	}

	type position struct{ section, module int }
	moduleIndex := map[int64]position{}
	for _, m := range modules {
		si, ok := sectionIndex[m.SectionID]
		if !ok {
			continue
		}
		moduleIndex[m.ID] = position{section: si, module: len(sections[si].Modules)}
		sections[si].Modules = append(sections[si].Modules, m)
	}

	files, err := moodleFiles(conn,
		"FROM moodle_files f JOIN moodle_modules m ON m.owner_id = f.owner_id AND m.id = f.module_id "+
			"JOIN moodle_sections s ON s.owner_id = m.owner_id AND s.id = m.section_id "+
			"WHERE f.owner_id = ? AND s.course_id = ? ORDER BY f.position",
		ownerID, courseID,
	)
	if err != nil {
		return nil, err
	}

	for _, f := range files {
		at, ok := moduleIndex[f.ModuleID]
		if !ok {
			continue
		}
		module := &sections[at.section].Modules[at.module]
		module.Files = append(module.Files, f)
	}

	return sections, nil
}

func MoodleFileByID(conn *sql.DB, ownerID int64, id string) (*MoodleFile, error) {
	files, err := moodleFiles(conn, "FROM moodle_files f WHERE f.owner_id = ? AND f.id = ?", ownerID, id)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, sql.ErrNoRows
	}

	return &files[0], nil
}

func MoodleFilesByOwner(conn *sql.DB, ownerID int64) (map[string]MoodleFile, error) {
	files, err := moodleFiles(conn, "FROM moodle_files f WHERE f.owner_id = ?", ownerID)
	if err != nil {
		return nil, err
	}

	byID := make(map[string]MoodleFile, len(files))
	for _, f := range files {
		byID[f.ID] = f
	}

	return byID, nil
}

func MoodleAssetByID(conn *sql.DB, ownerID int64, id string) (*MoodleAsset, error) {
	var a MoodleAsset

	err := conn.QueryRow(
		"SELECT id, course_id, url, mimetype, path FROM moodle_assets WHERE owner_id = ? AND id = ?",
		ownerID, id,
	).Scan(&a.ID, &a.CourseID, &a.URL, &a.Mimetype, &a.Path)
	if err != nil {
		return nil, err
	}

	return &a, nil
}

func MoodleAssetsByOwner(conn *sql.DB, ownerID int64) (map[string]MoodleAsset, error) {
	rows, err := conn.Query(
		"SELECT id, course_id, url, mimetype, path FROM moodle_assets WHERE owner_id = ?",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assets := map[string]MoodleAsset{}
	for rows.Next() {
		var a MoodleAsset
		if err := rows.Scan(&a.ID, &a.CourseID, &a.URL, &a.Mimetype, &a.Path); err != nil {
			return nil, err
		}
		assets[a.ID] = a
	}

	return assets, rows.Err()
}

func ReplaceMoodle(conn *sql.DB, ownerID int64, snap MoodleSnapshot) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM moodle_courses WHERE owner_id = ?", ownerID); err != nil {
		return err
	}

	inserts := []struct {
		query string
		rows  [][]any
	}{
		{
			query: `INSERT OR IGNORE INTO moodle_courses (owner_id, id, shortname, fullname, summary, category,
				semester, semester_number, is_current, is_favourite, start_date, end_date,
				image_source, image_path, image_type, position, synced_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rows: courseRows(ownerID, snap.Courses),
		},
		{
			query: `INSERT OR IGNORE INTO moodle_sections (owner_id, course_id, id, number, name, summary, position)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
			rows: sectionRows(ownerID, snap.Sections),
		},
		{
			query: `INSERT OR IGNORE INTO moodle_modules (owner_id, section_id, id, name, modname, url, indent,
				description, availability, content, position)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rows: moduleRows(ownerID, snap.Modules),
		},
		{
			query: `INSERT OR IGNORE INTO moodle_files (owner_id, module_id, id, filename, filepath, type, file_url,
				mimetype, filesize, time_modified, path, embedded, position)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rows: fileRows(ownerID, snap.Files),
		},
		{
			query: `INSERT OR IGNORE INTO moodle_assets (owner_id, course_id, id, url, mimetype, path)
				VALUES (?, ?, ?, ?, ?, ?)`,
			rows: assetRows(ownerID, snap.Assets),
		},
		{
			query: `INSERT OR IGNORE INTO moodle_grades (owner_id, course_id, id, name, item_type, item_module,
				grade, grade_min, grade_max, passed, formatted, feedback, position)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			rows: gradeRows(ownerID, snap.Grades),
		},
	}

	for _, insert := range inserts {
		if err := execAll(tx, insert.query, insert.rows); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func MoodleGrades(conn *sql.DB, ownerID int64, courseID *int64) ([]MoodleGrade, error) {
	query := `
		SELECT g.id, g.course_id, g.name, g.item_type, g.item_module, g.grade,
			g.grade_min, g.grade_max, g.passed, g.formatted, g.feedback, g.position
		FROM moodle_grades g
		JOIN moodle_courses c ON c.owner_id = g.owner_id AND c.id = g.course_id
		WHERE g.owner_id = ?`
	args := []any{ownerID}
	if courseID != nil {
		query += " AND g.course_id = ?"
		args = append(args, *courseID)
	}

	rows, err := conn.Query(query+" ORDER BY c.position, g.position", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grades := []MoodleGrade{}
	for rows.Next() {
		var g MoodleGrade
		err := rows.Scan(&g.ID, &g.CourseID, &g.Name, &g.ItemType, &g.ItemModule, &g.Grade,
			&g.GradeMin, &g.GradeMax, &g.Passed, &g.Formatted, &g.Feedback, &g.Position)
		if err != nil {
			return nil, err
		}
		grades = append(grades, g)
	}

	return grades, rows.Err()
}

func execAll(tx *sql.Tx, query string, rows [][]any) error {
	stmt, err := tx.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, row := range rows {
		if _, err := stmt.Exec(row...); err != nil {
			return err
		}
	}

	return nil
}

func courseRows(ownerID int64, courses []MoodleCourse) [][]any {
	rows := make([][]any, 0, len(courses))
	for _, c := range courses {
		rows = append(rows, []any{ownerID, c.ID, c.Shortname, c.Fullname, c.Summary, c.Category,
			c.Semester, c.SemesterNumber, c.IsCurrent, c.IsFavourite, c.StartDate, c.EndDate,
			c.ImageSource, c.ImagePath, c.ImageType, c.Position, c.SyncedAt})
	}
	return rows
}

func sectionRows(ownerID int64, sections []MoodleSection) [][]any {
	rows := make([][]any, 0, len(sections))
	for _, s := range sections {
		rows = append(rows, []any{ownerID, s.CourseID, s.ID, s.Number, s.Name, s.Summary, s.Position})
	}
	return rows
}

func moduleRows(ownerID int64, modules []MoodleModule) [][]any {
	rows := make([][]any, 0, len(modules))
	for _, m := range modules {
		rows = append(rows, []any{ownerID, m.SectionID, m.ID, m.Name, m.Modname, m.URL, m.Indent,
			m.Description, m.Availability, m.Content, m.Position})
	}
	return rows
}

func fileRows(ownerID int64, files []MoodleFile) [][]any {
	rows := make([][]any, 0, len(files))
	for _, f := range files {
		rows = append(rows, []any{ownerID, f.ModuleID, f.ID, f.Filename, f.Filepath, f.Type, f.FileURL,
			f.Mimetype, f.Filesize, f.TimeModified, f.Path, f.Embedded, f.Position})
	}
	return rows
}

func assetRows(ownerID int64, assets []MoodleAsset) [][]any {
	rows := make([][]any, 0, len(assets))
	for _, a := range assets {
		rows = append(rows, []any{ownerID, a.CourseID, a.ID, a.URL, a.Mimetype, a.Path})
	}
	return rows
}

func gradeRows(ownerID int64, grades []MoodleGrade) [][]any {
	rows := make([][]any, 0, len(grades))
	for _, g := range grades {
		rows = append(rows, []any{ownerID, g.CourseID, g.ID, g.Name, g.ItemType, g.ItemModule,
			g.Grade, g.GradeMin, g.GradeMax, g.Passed, g.Formatted, g.Feedback, g.Position})
	}
	return rows
}

func moodleSections(conn *sql.DB, ownerID, courseID int64) ([]MoodleSection, error) {
	rows, err := conn.Query(
		"SELECT id, course_id, number, name, summary, position FROM moodle_sections WHERE owner_id = ? AND course_id = ? ORDER BY position",
		ownerID, courseID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sections := []MoodleSection{}
	for rows.Next() {
		s := MoodleSection{Modules: []MoodleModule{}}
		if err := rows.Scan(&s.ID, &s.CourseID, &s.Number, &s.Name, &s.Summary, &s.Position); err != nil {
			return nil, err
		}
		sections = append(sections, s)
	}

	return sections, rows.Err()
}

func moodleModules(conn *sql.DB, ownerID, courseID int64) ([]MoodleModule, error) {
	rows, err := conn.Query(`
		SELECT `+moodleModuleColumns+`
		FROM moodle_modules m
		JOIN moodle_sections s ON s.owner_id = m.owner_id AND s.id = m.section_id
		WHERE m.owner_id = ? AND s.course_id = ?
		ORDER BY m.position`,
		ownerID, courseID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	modules := []MoodleModule{}
	for rows.Next() {
		m, err := scanMoodleModule(rows)
		if err != nil {
			return nil, err
		}
		modules = append(modules, *m)
	}

	return modules, rows.Err()
}

func MoodleModuleByID(conn *sql.DB, ownerID, id int64) (*MoodleModule, error) {
	module, err := scanMoodleModule(conn.QueryRow(
		"SELECT "+moodleModuleColumns+" FROM moodle_modules m WHERE m.owner_id = ? AND m.id = ?",
		ownerID, id,
	))
	if err != nil {
		return nil, err
	}

	err = conn.QueryRow(
		"SELECT content FROM moodle_modules WHERE owner_id = ? AND id = ?",
		ownerID, id,
	).Scan(&module.Content)
	if err != nil {
		return nil, err
	}

	module.Files, err = moodleFiles(conn,
		"FROM moodle_files f WHERE f.owner_id = ? AND f.module_id = ? ORDER BY f.position", ownerID, id)
	if err != nil {
		return nil, err
	}

	return module, nil
}

func SetMoodlePlacements(conn *sql.DB, ownerID int64, placements []MoodlePlacement) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	err = execAll(tx, `
		INSERT INTO moodle_placements (owner_id, course_id, semester, position) VALUES (?, ?, ?, ?)
		ON CONFLICT (owner_id, course_id) DO UPDATE SET
			semester = excluded.semester,
			position = excluded.position`,
		placementRows(ownerID, placements),
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func DeleteMoodlePlacement(conn *sql.DB, ownerID, courseID int64) error {
	_, err := conn.Exec("DELETE FROM moodle_placements WHERE owner_id = ? AND course_id = ?", ownerID, courseID)
	return err
}

func SetMoodleFilePath(conn *sql.DB, ownerID int64, id, path string) error {
	_, err := conn.Exec("UPDATE moodle_files SET path = ? WHERE owner_id = ? AND id = ?", path, ownerID, id)
	return err
}

func SetMoodleAssetPath(conn *sql.DB, ownerID int64, id, path, mimetype string) error {
	_, err := conn.Exec(
		"UPDATE moodle_assets SET path = ?, mimetype = ? WHERE owner_id = ? AND id = ?",
		path, mimetype, ownerID, id,
	)
	return err
}

func MoodlePaths(conn *sql.DB, ownerID int64) (map[string]bool, error) {
	rows, err := conn.Query(`
		SELECT path FROM moodle_files WHERE owner_id = ? AND path IS NOT NULL
		UNION SELECT path FROM moodle_assets WHERE owner_id = ? AND path IS NOT NULL
		UNION SELECT image_path FROM moodle_courses WHERE owner_id = ? AND image_path IS NOT NULL`,
		ownerID, ownerID, ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := map[string]bool{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths[p] = true
	}

	return paths, rows.Err()
}

func placementRows(ownerID int64, placements []MoodlePlacement) [][]any {
	rows := make([][]any, 0, len(placements))
	for _, p := range placements {
		rows = append(rows, []any{ownerID, p.CourseID, p.Semester, p.Position})
	}
	return rows
}

func scanMoodleModule(row rowScanner) (*MoodleModule, error) {
	m := MoodleModule{Files: []MoodleFile{}}
	err := row.Scan(&m.ID, &m.SectionID, &m.Name, &m.Modname, &m.URL, &m.Indent,
		&m.Description, &m.Availability, &m.HasContent, &m.Position)
	if err != nil {
		return nil, err
	}

	return &m, nil
}

func moodleFiles(conn *sql.DB, from string, args ...any) ([]MoodleFile, error) {
	rows, err := conn.Query("SELECT "+moodleFileColumns+" "+from, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := []MoodleFile{}
	for rows.Next() {
		var f MoodleFile
		err := rows.Scan(&f.ID, &f.ModuleID, &f.Filename, &f.Filepath, &f.Type, &f.FileURL,
			&f.Mimetype, &f.Filesize, &f.TimeModified, &f.Path, &f.Embedded, &f.Position)
		if err != nil {
			return nil, err
		}

		f.Downloaded = f.Path != nil
		if f.Type == moodleLinkType {
			f.Link = f.FileURL
		}
		files = append(files, f)
	}

	return files, rows.Err()
}

func scanMoodleCourse(row rowScanner) (*MoodleCourse, error) {
	var c MoodleCourse
	err := row.Scan(&c.ID, &c.OwnerID, &c.Shortname, &c.Fullname, &c.Summary, &c.Category, &c.Semester,
		&c.SemesterNumber, &c.IsCurrent, &c.IsFavourite, &c.StartDate, &c.EndDate,
		&c.ImageSource, &c.ImagePath, &c.ImageType, &c.Position, &c.SyncedAt,
		&c.Placement.Semester, &c.Placement.Position, &c.Placement.Custom)
	if err != nil {
		return nil, err
	}

	c.HasImage = c.ImagePath != nil
	return &c, nil
}
