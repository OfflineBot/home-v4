package domainpage

import "database/sql"

type Machine struct {
	ID            int64  `json:"id"`
	OwnerID       int64  `json:"-"`
	Name          string `json:"name"`
	MAC           string `json:"mac"`
	Username      string `json:"username"`
	Broadcast     string `json:"broadcast"`
	IP            string `json:"ip"`
	SSHPort       uint16 `json:"ssh_port"`
	WakeOnLanPort uint16 `json:"wake_on_lan_port"`
}

const machineColumns = "id, owner_id, name, mac, username, broadcast, ip, ssh_port, wake_on_lan_port"

func CreateMachine(conn *sql.DB, m Machine) (int64, error) {
	result, err := conn.Exec(`
		INSERT INTO machines (owner_id, name, mac, username, broadcast, ip, ssh_port, wake_on_lan_port)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.OwnerID, m.Name, m.MAC, m.Username, m.Broadcast, m.IP, m.SSHPort, m.WakeOnLanPort,
	)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func MachinesByOwner(conn *sql.DB, ownerID int64) ([]Machine, error) {
	rows, err := conn.Query(
		"SELECT "+machineColumns+" FROM machines WHERE owner_id = ? ORDER BY name",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	machines := []Machine{}
	for rows.Next() {
		m, err := scanMachine(rows)
		if err != nil {
			return nil, err
		}
		machines = append(machines, *m)
	}

	return machines, rows.Err()
}

func MachineByID(conn *sql.DB, ownerID, id int64) (*Machine, error) {
	return scanMachine(conn.QueryRow(
		"SELECT "+machineColumns+" FROM machines WHERE owner_id = ? AND id = ?",
		ownerID, id,
	))
}

func DeleteMachine(conn *sql.DB, ownerID, id int64) error {
	result, err := conn.Exec("DELETE FROM machines WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanMachine(row rowScanner) (*Machine, error) {
	var m Machine
	err := row.Scan(&m.ID, &m.OwnerID, &m.Name, &m.MAC, &m.Username,
		&m.Broadcast, &m.IP, &m.SSHPort, &m.WakeOnLanPort)
	if err != nil {
		return nil, err
	}

	return &m, nil
}

type MachineHostKey struct {
	MachineID   int64  `json:"-"`
	OwnerID     int64  `json:"-"`
	Type        string `json:"key_type"`
	Key         string `json:"-"`
	Fingerprint string `json:"fingerprint"`
	AddedAt     string `json:"added_at"`
}

func HostKeyByMachine(conn *sql.DB, ownerID, machineID int64) (*MachineHostKey, error) {
	var k MachineHostKey

	err := conn.QueryRow(`
		SELECT machine_id, owner_id, key_type, key, fingerprint, added_at
		FROM machine_host_keys WHERE owner_id = ? AND machine_id = ?`,
		ownerID, machineID,
	).Scan(&k.MachineID, &k.OwnerID, &k.Type, &k.Key, &k.Fingerprint, &k.AddedAt)
	if err != nil {
		return nil, err
	}

	return &k, nil
}

func SaveHostKey(conn *sql.DB, k MachineHostKey) error {
	_, err := conn.Exec(`
		INSERT INTO machine_host_keys (machine_id, owner_id, key_type, key, fingerprint)
		SELECT id, owner_id, ?, ?, ? FROM machines WHERE owner_id = ? AND id = ?
		ON CONFLICT (machine_id) DO UPDATE SET
			key_type = excluded.key_type,
			key = excluded.key,
			fingerprint = excluded.fingerprint,
			added_at = datetime('now')`,
		k.Type, k.Key, k.Fingerprint, k.OwnerID, k.MachineID,
	)
	return err
}

func DeleteHostKey(conn *sql.DB, ownerID, machineID int64) error {
	result, err := conn.Exec("DELETE FROM machine_host_keys WHERE owner_id = ? AND machine_id = ?", ownerID, machineID)
	if err != nil {
		return err
	}

	return affectedOne(result)
}
