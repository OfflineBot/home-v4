package domainpage

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Grade struct {
	ID          int64           `json:"id"`
	OwnerID     int64           `json:"-"`
	SemesterID  string          `json:"semester_id"`
	Semester    string          `json:"semester"`
	ModuleID    string          `json:"module_id"`
	Name        string          `json:"name"`
	Grade       *float64        `json:"grade"`
	ECTS        float64         `json:"ects"`
	Status      string          `json:"status"`
	DetailArgs  string          `json:"-"`
	Attempts    json.RawMessage `json:"attempts"`
	NotOriginal bool            `json:"not_original"`
	SyncedAt    string          `json:"synced_at"`
}

const (
	gradeColumns  = "id, owner_id, semester_id, semester, module_id, name, grade, ects, status, detail_args, attempts, not_original, synced_at"
	emptyAttempts = "[]"
)

func GradesByOwner(conn *sql.DB, ownerID int64) ([]Grade, error) {
	rows, err := conn.Query(
		"SELECT "+gradeColumns+" FROM grades WHERE owner_id = ? ORDER BY position",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grades := []Grade{}
	for rows.Next() {
		g, err := scanGrade(rows)
		if err != nil {
			return nil, err
		}
		grades = append(grades, *g)
	}

	return grades, rows.Err()
}

func ReplaceGrades(conn *sql.DB, ownerID int64, grades []Grade) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	syncedAt := time.Now().UTC().Format(time.RFC3339Nano)

	for position, g := range grades {
		attempts := string(g.Attempts)
		if attempts == "" {
			attempts = emptyAttempts
		}

		_, err := tx.Exec(`
			INSERT INTO grades (owner_id, semester_id, semester, module_id, name,
				grade, ects, status, detail_args, attempts, not_original, position, synced_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (owner_id, semester_id, module_id) DO UPDATE SET
				semester = excluded.semester,
				name = excluded.name,
				grade = excluded.grade,
				ects = excluded.ects,
				status = excluded.status,
				detail_args = excluded.detail_args,
				attempts = excluded.attempts,
				not_original = excluded.not_original,
				position = excluded.position,
				synced_at = excluded.synced_at`,
			ownerID, g.SemesterID, g.Semester, g.ModuleID, g.Name,
			g.Grade, g.ECTS, g.Status, g.DetailArgs, attempts, g.NotOriginal, position, syncedAt,
		)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec("DELETE FROM grades WHERE owner_id = ? AND synced_at <> ?", ownerID, syncedAt)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func scanGrade(row rowScanner) (*Grade, error) {
	var g Grade
	var attempts string
	err := row.Scan(&g.ID, &g.OwnerID, &g.SemesterID, &g.Semester, &g.ModuleID, &g.Name,
		&g.Grade, &g.ECTS, &g.Status, &g.DetailArgs, &attempts, &g.NotOriginal, &g.SyncedAt)
	if err != nil {
		return nil, err
	}

	g.Attempts = json.RawMessage(attempts)
	return &g, nil
}
