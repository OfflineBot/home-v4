package domainpage

import (
	"database/sql"
	"errors"
)

type AutomationInstance struct {
	OwnerEmail    string
	OwnerPassword string
	APIKey        *string
}

type AutomationCredential struct {
	ID        string `json:"id"`
	OwnerID   int64  `json:"-"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

const automationCredentialColumns = "credential_id, owner_id, name, type, created_at, updated_at"

func AutomationInstanceRow(conn *sql.DB) (*AutomationInstance, error) {
	var inst AutomationInstance

	err := conn.QueryRow(
		"SELECT owner_email, owner_password, api_key FROM automation_instance WHERE id = 1",
	).Scan(&inst.OwnerEmail, &inst.OwnerPassword, &inst.APIKey)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &inst, nil
}

func SaveAutomationInstance(conn *sql.DB, inst AutomationInstance, at string) error {
	_, err := conn.Exec(`
		INSERT INTO automation_instance (id, owner_email, owner_password, api_key, updated_at)
		VALUES (1, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET
			owner_email = excluded.owner_email,
			owner_password = excluded.owner_password,
			api_key = excluded.api_key,
			updated_at = excluded.updated_at`,
		inst.OwnerEmail, inst.OwnerPassword, inst.APIKey, at,
	)
	return err
}

func SetAutomationAPIKey(conn *sql.DB, sealed *string, at string) error {
	_, err := conn.Exec(
		"UPDATE automation_instance SET api_key = ?, updated_at = ? WHERE id = 1",
		sealed, at,
	)
	return err
}

func AddAutomationWorkflow(conn *sql.DB, workflowID string, ownerID int64, at string) error {
	_, err := conn.Exec(
		"INSERT INTO automation_workflows (workflow_id, owner_id, created_at) VALUES (?, ?, ?)",
		workflowID, ownerID, at,
	)
	return err
}

func AutomationWorkflowOwned(conn *sql.DB, ownerID int64, workflowID string) (bool, error) {
	var found int

	err := conn.QueryRow(
		"SELECT 1 FROM automation_workflows WHERE owner_id = ? AND workflow_id = ?",
		ownerID, workflowID,
	).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}

	return err == nil, err
}

func AutomationWorkflowsByOwner(conn *sql.DB, ownerID int64) ([]string, error) {
	return automationIDs(conn, "SELECT workflow_id FROM automation_workflows WHERE owner_id = ?", ownerID)
}

func AllAutomationWorkflows(conn *sql.DB) ([]string, error) {
	return automationIDs(conn, "SELECT workflow_id FROM automation_workflows")
}

func CountAutomationWorkflows(conn *sql.DB, ownerID int64) (int, error) {
	var count int
	err := conn.QueryRow("SELECT COUNT(*) FROM automation_workflows WHERE owner_id = ?", ownerID).Scan(&count)
	return count, err
}

func RemoveAutomationWorkflow(conn *sql.DB, ownerID int64, workflowID string) error {
	_, err := conn.Exec(
		"DELETE FROM automation_workflows WHERE owner_id = ? AND workflow_id = ?",
		ownerID, workflowID,
	)
	return err
}

func AddAutomationCredential(conn *sql.DB, cred AutomationCredential) error {
	_, err := conn.Exec(
		"INSERT INTO automation_credentials ("+automationCredentialColumns+") VALUES (?, ?, ?, ?, ?, ?)",
		cred.ID, cred.OwnerID, cred.Name, cred.Type, cred.CreatedAt, cred.UpdatedAt,
	)
	return err
}

func AutomationCredentialsByOwner(conn *sql.DB, ownerID int64) ([]AutomationCredential, error) {
	rows, err := conn.Query(
		"SELECT "+automationCredentialColumns+" FROM automation_credentials WHERE owner_id = ? ORDER BY name COLLATE NOCASE, credential_id",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	creds := []AutomationCredential{}
	for rows.Next() {
		var c AutomationCredential
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.Name, &c.Type, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		creds = append(creds, c)
	}

	return creds, rows.Err()
}

func AutomationCredentialByID(conn *sql.DB, ownerID int64, id string) (*AutomationCredential, error) {
	var c AutomationCredential

	err := conn.QueryRow(
		"SELECT "+automationCredentialColumns+" FROM automation_credentials WHERE owner_id = ? AND credential_id = ?",
		ownerID, id,
	).Scan(&c.ID, &c.OwnerID, &c.Name, &c.Type, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &c, nil
}

func AllAutomationCredentials(conn *sql.DB) ([]string, error) {
	return automationIDs(conn, "SELECT credential_id FROM automation_credentials")
}

func CountAutomationCredentials(conn *sql.DB, ownerID int64) (int, error) {
	var count int
	err := conn.QueryRow("SELECT COUNT(*) FROM automation_credentials WHERE owner_id = ?", ownerID).Scan(&count)
	return count, err
}

func RenameAutomationCredential(conn *sql.DB, ownerID int64, id, name, at string) error {
	_, err := conn.Exec(
		"UPDATE automation_credentials SET name = ?, updated_at = ? WHERE owner_id = ? AND credential_id = ?",
		name, at, ownerID, id,
	)
	return err
}

func RemoveAutomationCredential(conn *sql.DB, ownerID int64, id string) error {
	_, err := conn.Exec(
		"DELETE FROM automation_credentials WHERE owner_id = ? AND credential_id = ?",
		ownerID, id,
	)
	return err
}

func automationIDs(conn *sql.DB, query string, args ...any) ([]string, error) {
	rows, err := conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, rows.Err()
}

type AutomationHomeAccess struct {
	UserID       int64
	CredentialID string
	TokenHash    string
}

func AutomationHomeAccessByUser(conn *sql.DB, userID int64) (*AutomationHomeAccess, error) {
	var access AutomationHomeAccess

	err := conn.QueryRow(
		"SELECT user_id, credential_id, token_hash FROM automation_home_access WHERE user_id = ?",
		userID,
	).Scan(&access.UserID, &access.CredentialID, &access.TokenHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &access, nil
}

func SaveAutomationHomeAccess(conn *sql.DB, access AutomationHomeAccess, at string) error {
	_, err := conn.Exec(`
		INSERT INTO automation_home_access (user_id, credential_id, token_hash, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			credential_id = excluded.credential_id,
			token_hash = excluded.token_hash,
			created_at = excluded.created_at`,
		access.UserID, access.CredentialID, access.TokenHash, at,
	)
	return err
}

func AutomationHomeUser(conn *sql.DB, tokenHash string) (int64, error) {
	var userID int64

	err := conn.QueryRow(`
		SELECT a.user_id FROM automation_home_access a
		JOIN users u ON u.id = a.user_id
		WHERE a.token_hash = ? AND u.approved_at IS NOT NULL`,
		tokenHash,
	).Scan(&userID)

	return userID, err
}

func AllAutomationHomeCredentials(conn *sql.DB) ([]string, error) {
	return automationIDs(conn, "SELECT credential_id FROM automation_home_access")
}
