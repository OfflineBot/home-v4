package domainpage

import "database/sql"

type GitProject struct {
	ID        int64  `json:"-"`
	OwnerID   int64  `json:"-"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

type GitRepo struct {
	ID          int64  `json:"-"`
	ProjectID   int64  `json:"-"`
	Project     string `json:"project"`
	OwnerID     int64  `json:"-"`
	OwnerName   string `json:"-"`
	Approved    bool   `json:"-"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Private     bool   `json:"private"`
	CreatedAt   string `json:"created_at"`
}

type GitToken struct {
	ID         int64   `json:"id"`
	OwnerID    int64   `json:"-"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
}

type GitSSHKey struct {
	ID          int64   `json:"id"`
	OwnerID     int64   `json:"-"`
	Name        string  `json:"name"`
	Fingerprint string  `json:"fingerprint"`
	CreatedAt   string  `json:"created_at"`
	LastUsedAt  *string `json:"last_used_at"`
}

type GitTokenOwner struct {
	TokenID    int64
	OwnerID    int64
	OwnerName  string
	Approved   bool
	LastUsedAt *string
}

const gitRepoColumns = `r.id, r.project_id, p.name, p.owner_id, u.name, u.approved_at IS NOT NULL,
	r.name, r.description, r.private, r.created_at`

const gitRepoJoin = `FROM git_repos r
	JOIN git_projects p ON p.id = r.project_id
	JOIN users u ON u.id = p.owner_id`

func CreateGitProject(conn *sql.DB, ownerID int64, name string) (int64, error) {
	result, err := conn.Exec("INSERT INTO git_projects (owner_id, name) VALUES (?, ?)", ownerID, name)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func GitProjectByName(conn *sql.DB, name string) (*GitProject, error) {
	var p GitProject
	err := conn.QueryRow(
		"SELECT id, owner_id, name, created_at FROM git_projects WHERE name = ?", name,
	).Scan(&p.ID, &p.OwnerID, &p.Name, &p.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

func GitProjectsByOwner(conn *sql.DB, ownerID int64) ([]GitProject, error) {
	rows, err := conn.Query(
		"SELECT id, owner_id, name, created_at FROM git_projects WHERE owner_id = ? ORDER BY name", ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []GitProject{}
	for rows.Next() {
		var p GitProject
		if err := rows.Scan(&p.ID, &p.OwnerID, &p.Name, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}

	return projects, rows.Err()
}

func DeleteGitProject(conn *sql.DB, id int64) error {
	result, err := conn.Exec("DELETE FROM git_projects WHERE id = ?", id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func CreateGitRepo(conn *sql.DB, projectID int64, name, description string, private bool) (int64, error) {
	result, err := conn.Exec(
		"INSERT INTO git_repos (project_id, name, description, private) VALUES (?, ?, ?, ?)",
		projectID, name, description, private,
	)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func GitReposByOwner(conn *sql.DB, ownerID int64) ([]GitRepo, error) {
	rows, err := conn.Query("SELECT "+gitRepoColumns+" "+gitRepoJoin+" WHERE p.owner_id = ? ORDER BY p.name, r.name", ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	repos := []GitRepo{}
	for rows.Next() {
		r, err := scanGitRepo(rows)
		if err != nil {
			return nil, err
		}
		repos = append(repos, *r)
	}

	return repos, rows.Err()
}

func GitRepoByPath(conn *sql.DB, project, name string) (*GitRepo, error) {
	return scanGitRepo(conn.QueryRow("SELECT "+gitRepoColumns+" "+gitRepoJoin+" WHERE p.name = ? AND r.name = ?", project, name))
}

func UpdateGitRepo(conn *sql.DB, id int64, description string, private bool) error {
	result, err := conn.Exec("UPDATE git_repos SET description = ?, private = ? WHERE id = ?", description, private, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func DeleteGitRepo(conn *sql.DB, id int64) error {
	result, err := conn.Exec("DELETE FROM git_repos WHERE id = ?", id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func CreateGitToken(conn *sql.DB, ownerID int64, name, hash, prefix string) (*GitToken, error) {
	result, err := conn.Exec(
		"INSERT INTO git_tokens (owner_id, name, token_hash, prefix) VALUES (?, ?, ?, ?)",
		ownerID, name, hash, prefix,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	var t GitToken
	err = conn.QueryRow(
		"SELECT id, owner_id, name, prefix, created_at, last_used_at FROM git_tokens WHERE id = ?", id,
	).Scan(&t.ID, &t.OwnerID, &t.Name, &t.Prefix, &t.CreatedAt, &t.LastUsedAt)
	if err != nil {
		return nil, err
	}

	return &t, nil
}

func GitTokensByOwner(conn *sql.DB, ownerID int64) ([]GitToken, error) {
	rows, err := conn.Query(
		"SELECT id, owner_id, name, prefix, created_at, last_used_at FROM git_tokens WHERE owner_id = ? ORDER BY created_at DESC, id DESC",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []GitToken{}
	for rows.Next() {
		var t GitToken
		if err := rows.Scan(&t.ID, &t.OwnerID, &t.Name, &t.Prefix, &t.CreatedAt, &t.LastUsedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}

	return tokens, rows.Err()
}

func GitTokenOwnerByHash(conn *sql.DB, hash string) (*GitTokenOwner, error) {
	var o GitTokenOwner
	err := conn.QueryRow(`
		SELECT t.id, t.owner_id, u.name, u.approved_at IS NOT NULL, t.last_used_at
		FROM git_tokens t JOIN users u ON u.id = t.owner_id
		WHERE t.token_hash = ?`, hash,
	).Scan(&o.TokenID, &o.OwnerID, &o.OwnerName, &o.Approved, &o.LastUsedAt)
	if err != nil {
		return nil, err
	}

	return &o, nil
}

func TouchGitToken(conn *sql.DB, id int64, at string) error {
	_, err := conn.Exec("UPDATE git_tokens SET last_used_at = ? WHERE id = ?", at, id)
	return err
}

func DeleteGitToken(conn *sql.DB, ownerID, id int64) error {
	result, err := conn.Exec("DELETE FROM git_tokens WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func scanGitRepo(row rowScanner) (*GitRepo, error) {
	var r GitRepo
	err := row.Scan(&r.ID, &r.ProjectID, &r.Project, &r.OwnerID, &r.OwnerName, &r.Approved,
		&r.Name, &r.Description, &r.Private, &r.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &r, nil
}

func CreateGitSSHKey(conn *sql.DB, ownerID int64, name, fingerprint, publicKey string) (*GitSSHKey, error) {
	result, err := conn.Exec(
		"INSERT INTO git_ssh_keys (owner_id, name, fingerprint, public_key) VALUES (?, ?, ?, ?)",
		ownerID, name, fingerprint, publicKey,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	var key GitSSHKey
	err = conn.QueryRow(
		"SELECT id, owner_id, name, fingerprint, created_at, last_used_at FROM git_ssh_keys WHERE id = ?", id,
	).Scan(&key.ID, &key.OwnerID, &key.Name, &key.Fingerprint, &key.CreatedAt, &key.LastUsedAt)
	if err != nil {
		return nil, err
	}

	return &key, nil
}

func GitSSHKeysByOwner(conn *sql.DB, ownerID int64) ([]GitSSHKey, error) {
	rows, err := conn.Query(`
		SELECT id, owner_id, name, fingerprint, created_at, last_used_at
		FROM git_ssh_keys WHERE owner_id = ? ORDER BY created_at`, ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []GitSSHKey{}
	for rows.Next() {
		var key GitSSHKey
		if err := rows.Scan(&key.ID, &key.OwnerID, &key.Name, &key.Fingerprint,
			&key.CreatedAt, &key.LastUsedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}

	return keys, rows.Err()
}

func GitSSHKeyOwnerByFingerprint(conn *sql.DB, fingerprint string) (*GitTokenOwner, error) {
	var o GitTokenOwner
	err := conn.QueryRow(`
		SELECT k.id, k.owner_id, u.name, u.approved_at IS NOT NULL, k.last_used_at
		FROM git_ssh_keys k JOIN users u ON u.id = k.owner_id
		WHERE k.fingerprint = ?`, fingerprint,
	).Scan(&o.TokenID, &o.OwnerID, &o.OwnerName, &o.Approved, &o.LastUsedAt)
	if err != nil {
		return nil, err
	}

	return &o, nil
}

func TouchGitSSHKey(conn *sql.DB, id int64, at string) error {
	_, err := conn.Exec("UPDATE git_ssh_keys SET last_used_at = ? WHERE id = ?", at, id)
	return err
}

func DeleteGitSSHKey(conn *sql.DB, ownerID, id int64) error {
	_, err := conn.Exec("DELETE FROM git_ssh_keys WHERE owner_id = ? AND id = ?", ownerID, id)
	return err
}
