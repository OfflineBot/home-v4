package grades

import (
	_ "embed"
	"encoding/json"
	"strconv"
	"strings"

	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/dualis"
)

//go:embed schema.sql
var Schema string

type Grade = store.Grade

type gradeKey struct {
	semester string
	module   string
}

const pendingStatus = "pending"

type Semester struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Modules []Grade `json:"modules"`
}

func Semesters(list []Grade) []Semester {
	semesters := []Semester{}
	index := map[string]int{}

	for _, g := range list {
		i, ok := index[g.SemesterID]
		if !ok {
			i = len(semesters)
			index[g.SemesterID] = i
			semesters = append(semesters, Semester{ID: g.SemesterID, Name: g.Semester, Modules: []Grade{}})
		}
		semesters[i].Modules = append(semesters[i].Modules, g)
	}

	return semesters
}

func ByUser(userID int64) ([]Grade, error) {
	return store.GradesByOwner(db.DB, userID)
}

func Sync(userID int64) error {
	sess, err := connections.DualisSession(userID)
	if err != nil {
		return err
	}

	all, err := dualis.GetAllGrades(sess)
	if err != nil {
		return err
	}

	var list []Grade
	for _, sem := range all.Semesters {
		for _, m := range sem.Modules {
			attempts, err := details(sess, m.DetailArgs)
			if err != nil {
				return err
			}

			list = append(list, Grade{
				SemesterID: sem.Semester.ID,
				Semester:   sem.Semester.Name,
				ModuleID:   m.ID,
				Name:       m.Name,
				Grade:      parseGrade(m.Grade),
				ECTS:       m.ECTS,
				Status:     m.Status,
				DetailArgs: m.DetailArgs,
				Attempts:   attempts,
			})
		}
	}

	existing, err := store.GradesByOwner(db.DB, userID)
	if err != nil {
		return err
	}

	return store.ReplaceGrades(db.DB, userID, keepLost(list, existing))
}

func keepLost(fresh, existing []Grade) []Grade {
	previous := make(map[gradeKey]Grade, len(existing))
	for _, g := range existing {
		previous[keyOf(g)] = g
	}

	seen := make(map[gradeKey]bool, len(fresh))
	for i := range fresh {
		k := keyOf(fresh[i])
		seen[k] = true

		old, ok := previous[k]
		if ok && hasResult(old) && !hasResult(fresh[i]) {
			fresh[i].Grade = old.Grade
			fresh[i].Status = old.Status
			fresh[i].Attempts = old.Attempts
			fresh[i].NotOriginal = true
		}
	}

	for _, old := range existing {
		if !seen[keyOf(old)] && hasResult(old) {
			old.NotOriginal = true
			fresh = append(fresh, old)
		}
	}

	return fresh
}

func hasResult(g Grade) bool {
	return g.Grade != nil || g.Status != pendingStatus
}

func keyOf(g Grade) gradeKey {
	return gradeKey{semester: g.SemesterID, module: g.ModuleID}
}

func details(sess *dualis.Session, detailArgs string) (json.RawMessage, error) {
	attempts := []dualis.ExamAttempt{}

	if detailArgs != "" {
		fetched, err := dualis.GetGradeDetails(sess, detailArgs)
		if err != nil {
			return nil, err
		}
		if fetched != nil {
			attempts = fetched
		}
	}

	return json.Marshal(attempts)
}

func parseGrade(raw string) *float64 {
	value, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(raw), ",", "."), 64)
	if err != nil || value < 1 || value > 5 {
		return nil
	}

	return &value
}
