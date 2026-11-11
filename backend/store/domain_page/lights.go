package domainpage

import "database/sql"

type Light struct {
	ID      int64  `json:"id"`
	OwnerID int64  `json:"-"`
	Name    string `json:"name"`
	URL     string `json:"url"`
}

const lightColumns = "id, owner_id, name, url"

func CreateLight(conn *sql.DB, light Light) (int64, error) {
	result, err := conn.Exec(
		"INSERT INTO lights (owner_id, name, url) VALUES (?, ?, ?)",
		light.OwnerID, light.Name, light.URL,
	)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func UpdateLight(conn *sql.DB, light Light) error {
	result, err := conn.Exec(
		"UPDATE lights SET name = ?, url = ? WHERE owner_id = ? AND id = ?",
		light.Name, light.URL, light.OwnerID, light.ID,
	)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func LightsByOwner(conn *sql.DB, ownerID int64) ([]Light, error) {
	rows, err := conn.Query(
		"SELECT "+lightColumns+" FROM lights WHERE owner_id = ? ORDER BY name COLLATE NOCASE",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	lights := []Light{}
	for rows.Next() {
		var light Light
		if err := rows.Scan(&light.ID, &light.OwnerID, &light.Name, &light.URL); err != nil {
			return nil, err
		}
		lights = append(lights, light)
	}

	return lights, rows.Err()
}

func LightByID(conn *sql.DB, ownerID, id int64) (*Light, error) {
	var light Light

	err := conn.QueryRow(
		"SELECT "+lightColumns+" FROM lights WHERE owner_id = ? AND id = ?",
		ownerID, id,
	).Scan(&light.ID, &light.OwnerID, &light.Name, &light.URL)
	if err != nil {
		return nil, err
	}

	return &light, nil
}

func DeleteLight(conn *sql.DB, ownerID, id int64) error {
	result, err := conn.Exec("DELETE FROM lights WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}
