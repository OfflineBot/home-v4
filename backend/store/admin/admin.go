package admin

import "database/sql"

type DataCounts struct {
	Grades          int `json:"grades"`
	MoodleCourses   int `json:"moodle_courses"`
	MoodleFiles     int `json:"moodle_files"`
	Mails           int `json:"mails"`
	MailAttachments int `json:"mail_attachments"`
	CalendarEvents  int `json:"calendar_events"`
	CalendarEntries int `json:"calendar_entries"`
}

type SyncHealth struct {
	Failing      int `json:"failing"`
	DualisLocked int `json:"dualis_locked"`
}

func Counts(conn *sql.DB, userID int64) (*DataCounts, error) {
	var c DataCounts

	err := conn.QueryRow(`
		SELECT
			(SELECT count(*) FROM grades WHERE owner_id = ?1),
			(SELECT count(*) FROM moodle_courses WHERE owner_id = ?1),
			(SELECT count(*) FROM moodle_files WHERE owner_id = ?1),
			(SELECT count(*) FROM mail_messages WHERE owner_id = ?1),
			(SELECT count(*) FROM mail_attachments WHERE owner_id = ?1),
			(SELECT count(*) FROM calendar_events WHERE owner_id = ?1),
			(SELECT count(*) FROM calendar_entries WHERE owner_id = ?1)`,
		userID,
	).Scan(&c.Grades, &c.MoodleCourses, &c.MoodleFiles, &c.Mails, &c.MailAttachments,
		&c.CalendarEvents, &c.CalendarEntries)
	if err != nil {
		return nil, err
	}

	return &c, nil
}

func Health(conn *sql.DB) (*SyncHealth, error) {
	var h SyncHealth

	err := conn.QueryRow(`
		SELECT
			(SELECT count(*) FROM sync_state WHERE error IS NOT NULL),
			(SELECT count(*) FROM dualis_guard WHERE locked = 1)`,
	).Scan(&h.Failing, &h.DualisLocked)
	if err != nil {
		return nil, err
	}

	return &h, nil
}
