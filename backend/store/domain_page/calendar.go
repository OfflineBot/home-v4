package domainpage

import (
	"database/sql"
	"errors"
)

type CalendarEvent struct {
	ID          string  `json:"id"`
	Source      string  `json:"source"`
	Start       string  `json:"start"`
	End         string  `json:"end"`
	Title       string  `json:"title"`
	Topic       string  `json:"topic"`
	Room        string  `json:"room"`
	Teacher     string  `json:"teacher"`
	Kind        string  `json:"type"`
	IsOnline    bool    `json:"is_online"`
	IsCancelled bool    `json:"is_cancelled"`
	Info        string  `json:"info"`
	Mark        *string `json:"-"`
}

func CalendarSource(conn *sql.DB, ownerID int64, kind string) (*string, error) {
	var value string

	err := conn.QueryRow(
		"SELECT value FROM calendar_sources WHERE owner_id = ? AND kind = ?",
		ownerID, kind,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &value, nil
}

func SetCalendarSource(conn *sql.DB, ownerID int64, kind, value string) error {
	_, err := conn.Exec(`
		INSERT INTO calendar_sources (owner_id, kind, value) VALUES (?, ?, ?)
		ON CONFLICT (owner_id, kind) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
		ownerID, kind, value,
	)
	return err
}

func DeleteCalendarSource(conn *sql.DB, ownerID int64, kind string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM calendar_sources WHERE owner_id = ? AND kind = ?", ownerID, kind); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM calendar_events WHERE owner_id = ? AND source = ?", ownerID, kind); err != nil {
		return err
	}

	return tx.Commit()
}

func CalendarSourceUsers(conn *sql.DB, kind string) ([]int64, error) {
	rows, err := conn.Query("SELECT owner_id FROM calendar_sources WHERE kind = ? ORDER BY owner_id", kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		users = append(users, id)
	}

	return users, rows.Err()
}

func ReplaceAllCalendarEvents(conn *sql.DB, ownerID int64, source string, events []CalendarEvent) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM calendar_events WHERE owner_id = ? AND source = ?", ownerID, source); err != nil {
		return err
	}

	rows := make([][]any, 0, len(events))
	for _, e := range events {
		rows = append(rows, []any{ownerID, e.ID, source, e.Start, e.End, e.Title, e.Topic,
			e.Room, e.Teacher, e.Kind, e.IsOnline, e.IsCancelled, e.Info})
	}

	err = execAll(tx, `
		INSERT OR REPLACE INTO calendar_events (owner_id, id, source, start_at, end_at, title, topic,
			room, teacher, kind, is_online, is_cancelled, info)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, rows)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func CalendarEvents(conn *sql.DB, ownerID int64, from, to string) ([]CalendarEvent, error) {
	rows, err := conn.Query(`
		SELECT e.id, e.source, e.start_at, e.end_at, e.title, e.topic, e.room, e.teacher, e.kind,
			e.is_online, e.is_cancelled, e.info, m.mark
		FROM calendar_events e
		LEFT JOIN calendar_marks m ON m.owner_id = e.owner_id AND m.event_id = e.id
		WHERE e.owner_id = ? AND e.start_at < ? AND e.end_at > ?
		ORDER BY e.start_at, e.end_at, e.title`,
		ownerID, to, from,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []CalendarEvent{}
	for rows.Next() {
		var e CalendarEvent
		err := rows.Scan(&e.ID, &e.Source, &e.Start, &e.End, &e.Title, &e.Topic, &e.Room,
			&e.Teacher, &e.Kind, &e.IsOnline, &e.IsCancelled, &e.Info, &e.Mark)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, rows.Err()
}
