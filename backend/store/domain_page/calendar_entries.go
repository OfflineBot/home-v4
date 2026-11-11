package domainpage

import (
	"database/sql"
)

type CalendarCategory struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Source   string `json:"source,omitempty"`
	Hidden   bool   `json:"hidden"`
	Position int    `json:"-"`
}

type CalendarEntry struct {
	ID          string
	CategoryID  string
	Title       string
	Start       string
	End         string
	Room        string
	Description string
	Mark        string
}

const (
	calendarCategoryColumns = "id, name, color, source, hidden, position"
	calendarEntryColumns    = "id, category_id, title, start_at, end_at, room, description, mark"
)

func CalendarCategories(conn *sql.DB, ownerID int64) ([]CalendarCategory, error) {
	rows, err := conn.Query(
		"SELECT "+calendarCategoryColumns+" FROM calendar_categories WHERE owner_id = ? ORDER BY position, name",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categories := []CalendarCategory{}
	for rows.Next() {
		var c CalendarCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Color, &c.Source, &c.Hidden, &c.Position); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, rows.Err()
}

func CalendarCategoryByID(conn *sql.DB, ownerID int64, id string) (*CalendarCategory, error) {
	var c CalendarCategory

	err := conn.QueryRow(
		"SELECT "+calendarCategoryColumns+" FROM calendar_categories WHERE owner_id = ? AND id = ?",
		ownerID, id,
	).Scan(&c.ID, &c.Name, &c.Color, &c.Source, &c.Hidden, &c.Position)
	if err != nil {
		return nil, err
	}

	return &c, nil
}

func EnsureCalendarCategory(conn *sql.DB, ownerID int64, c CalendarCategory) error {
	_, err := conn.Exec(`
		INSERT OR IGNORE INTO calendar_categories (owner_id, id, name, color, source, hidden, position)
		VALUES (?, ?, ?, ?, ?, 0, (SELECT coalesce(max(position) + 1, 0) FROM calendar_categories WHERE owner_id = ?))`,
		ownerID, c.ID, c.Name, c.Color, c.Source, ownerID,
	)
	return err
}

func SaveCalendarCategory(conn *sql.DB, ownerID int64, c CalendarCategory) error {
	_, err := conn.Exec(`
		INSERT INTO calendar_categories (owner_id, id, name, color, source, hidden, position)
		VALUES (?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM calendar_categories WHERE owner_id = ?))
		ON CONFLICT (owner_id, id) DO UPDATE SET
			name = excluded.name,
			color = excluded.color,
			hidden = excluded.hidden`,
		ownerID, c.ID, c.Name, c.Color, c.Source, c.Hidden, ownerID,
	)
	return err
}

func DeleteCalendarCategory(conn *sql.DB, ownerID int64, id string) error {
	result, err := conn.Exec("DELETE FROM calendar_categories WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func CalendarEntries(conn *sql.DB, ownerID int64, from, to string) ([]CalendarEntry, error) {
	rows, err := conn.Query(
		"SELECT "+calendarEntryColumns+" FROM calendar_entries WHERE owner_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at, end_at, title",
		ownerID, to, from,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []CalendarEntry{}
	for rows.Next() {
		e, err := scanCalendarEntry(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, *e)
	}

	return entries, rows.Err()
}

func CalendarEntryByID(conn *sql.DB, ownerID int64, id string) (*CalendarEntry, error) {
	return scanCalendarEntry(conn.QueryRow(
		"SELECT "+calendarEntryColumns+" FROM calendar_entries WHERE owner_id = ? AND id = ?",
		ownerID, id,
	))
}

func SaveCalendarEntry(conn *sql.DB, ownerID int64, e CalendarEntry) error {
	_, err := conn.Exec(`
		INSERT INTO calendar_entries (owner_id, id, category_id, title, start_at, end_at, room, description, mark)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (owner_id, id) DO UPDATE SET
			category_id = excluded.category_id,
			title = excluded.title,
			start_at = excluded.start_at,
			end_at = excluded.end_at,
			room = excluded.room,
			description = excluded.description,
			mark = excluded.mark,
			updated_at = datetime('now')`,
		ownerID, e.ID, e.CategoryID, e.Title, e.Start, e.End, e.Room, e.Description, e.Mark,
	)
	return err
}

func DeleteCalendarEntry(conn *sql.DB, ownerID int64, id string) error {
	result, err := conn.Exec("DELETE FROM calendar_entries WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func SetCalendarEntryMark(conn *sql.DB, ownerID int64, id, mark string) error {
	result, err := conn.Exec(
		"UPDATE calendar_entries SET mark = ?, updated_at = datetime('now') WHERE owner_id = ? AND id = ?",
		mark, ownerID, id,
	)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func CalendarEventExists(conn *sql.DB, ownerID int64, id string) (bool, error) {
	var exists bool
	err := conn.QueryRow(
		"SELECT EXISTS (SELECT 1 FROM calendar_events WHERE owner_id = ? AND id = ?)",
		ownerID, id,
	).Scan(&exists)
	return exists, err
}

func SetCalendarMark(conn *sql.DB, ownerID int64, eventID string, mark *string) error {
	if mark == nil {
		_, err := conn.Exec("DELETE FROM calendar_marks WHERE owner_id = ? AND event_id = ?", ownerID, eventID)
		return err
	}

	_, err := conn.Exec(`
		INSERT INTO calendar_marks (owner_id, event_id, mark) VALUES (?, ?, ?)
		ON CONFLICT (owner_id, event_id) DO UPDATE SET mark = excluded.mark`,
		ownerID, eventID, *mark,
	)
	return err
}

func scanCalendarEntry(row rowScanner) (*CalendarEntry, error) {
	var e CalendarEntry
	err := row.Scan(&e.ID, &e.CategoryID, &e.Title, &e.Start, &e.End, &e.Room, &e.Description, &e.Mark)
	if err != nil {
		return nil, err
	}

	return &e, nil
}

func affectedOne(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	return nil
}
