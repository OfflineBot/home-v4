package domainpage

import "database/sql"

type ArchiveItem struct {
	ID           string `json:"id"`
	OwnerID      int64  `json:"-"`
	OwnerName    string `json:"-"`
	Name         string `json:"name"`
	OriginalPath string `json:"original_path"`
	Type         string `json:"type"`
	Size         int64  `json:"size"`
	DeletedAt    string `json:"deleted_at"`
	ExpiresAt    string `json:"expires_at"`
}

const archiveColumns = "a.id, a.owner_id, u.name, a.name, a.original_path, a.type, a.size, a.deleted_at, a.expires_at"

const archiveJoin = "FROM files_archive a JOIN users u ON u.id = a.owner_id"

func CreateArchiveItem(conn *sql.DB, item ArchiveItem) error {
	_, err := conn.Exec(`
		INSERT INTO files_archive (id, owner_id, name, original_path, type, size, deleted_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		item.ID, item.OwnerID, item.Name, item.OriginalPath, item.Type, item.Size, item.DeletedAt, item.ExpiresAt,
	)
	return err
}

func ArchiveItemsByOwner(conn *sql.DB, ownerID int64) ([]ArchiveItem, error) {
	return archiveItems(conn, "WHERE a.owner_id = ? ORDER BY a.deleted_at DESC, a.id", ownerID)
}

func ArchiveItemByID(conn *sql.DB, ownerID int64, id string) (*ArchiveItem, error) {
	items, err := archiveItems(conn, "WHERE a.owner_id = ? AND a.id = ?", ownerID, id)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}

	return &items[0], nil
}

func ExpiredArchiveItems(conn *sql.DB, now string) ([]ArchiveItem, error) {
	return archiveItems(conn, "WHERE a.expires_at <= ? ORDER BY a.expires_at", now)
}

func ArchivedBytes(conn *sql.DB, ownerID int64) (int64, int, error) {
	var size int64
	var count int
	err := conn.QueryRow("SELECT COALESCE(SUM(size), 0), COUNT(*) FROM files_archive WHERE owner_id = ?", ownerID).Scan(&size, &count)
	return size, count, err
}

func DeleteArchiveItem(conn *sql.DB, ownerID int64, id string) error {
	result, err := conn.Exec("DELETE FROM files_archive WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func archiveItems(conn *sql.DB, where string, args ...any) ([]ArchiveItem, error) {
	rows, err := conn.Query("SELECT "+archiveColumns+" "+archiveJoin+" "+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []ArchiveItem{}
	for rows.Next() {
		var item ArchiveItem
		err := rows.Scan(&item.ID, &item.OwnerID, &item.OwnerName, &item.Name, &item.OriginalPath,
			&item.Type, &item.Size, &item.DeletedAt, &item.ExpiresAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}
