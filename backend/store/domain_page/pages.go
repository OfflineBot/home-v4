package domainpage

import "database/sql"

type Page struct {
	ID        int64
	OwnerID   int64
	OwnerName string
	Name      string
	Title     string
	Source    string
	RepoID    *int64
	Project   *string
	Repo      *string
	Ref       string
	Folder    string
	SPA       bool
	Enabled   bool
	CreatedAt string
	UpdatedAt string
}

const pageColumns = `pg.id, pg.owner_id, u.name, pg.name, pg.title, pg.source, pg.repo_id, gp.name, gr.name,
	pg.ref, pg.folder, pg.spa, pg.enabled, pg.created_at, pg.updated_at`

const pageJoin = `FROM pages pg
	JOIN users u ON u.id = pg.owner_id
	LEFT JOIN git_repos gr ON gr.id = pg.repo_id
	LEFT JOIN git_projects gp ON gp.id = gr.project_id`

func CreatePage(conn *sql.DB, p Page) error {
	_, err := conn.Exec(`
		INSERT INTO pages (owner_id, name, title, source, repo_id, ref, folder, spa, enabled)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.OwnerID, p.Name, p.Title, p.Source, p.RepoID, p.Ref, p.Folder, p.SPA, p.Enabled,
	)
	return err
}

func UpdatePage(conn *sql.DB, p Page) error {
	result, err := conn.Exec(`
		UPDATE pages SET title = ?, source = ?, repo_id = ?, ref = ?, folder = ?, spa = ?, enabled = ?,
			updated_at = datetime('now')
		WHERE id = ? AND owner_id = ?`,
		p.Title, p.Source, p.RepoID, p.Ref, p.Folder, p.SPA, p.Enabled, p.ID, p.OwnerID,
	)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func PagesByOwner(conn *sql.DB, ownerID int64) ([]Page, error) {
	rows, err := conn.Query("SELECT "+pageColumns+" "+pageJoin+" WHERE pg.owner_id = ? ORDER BY pg.name", ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pages := []Page{}
	for rows.Next() {
		p, err := scanPage(rows)
		if err != nil {
			return nil, err
		}
		pages = append(pages, *p)
	}

	return pages, rows.Err()
}

func PageByName(conn *sql.DB, name string) (*Page, error) {
	return scanPage(conn.QueryRow("SELECT "+pageColumns+" "+pageJoin+" WHERE pg.name = ?", name))
}

func DeletePage(conn *sql.DB, ownerID, id int64) error {
	result, err := conn.Exec("DELETE FROM pages WHERE id = ? AND owner_id = ?", id, ownerID)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func GitRepoByID(conn *sql.DB, id int64) (*GitRepo, error) {
	return scanGitRepo(conn.QueryRow("SELECT "+gitRepoColumns+" "+gitRepoJoin+" WHERE r.id = ?", id))
}

func scanPage(row rowScanner) (*Page, error) {
	var p Page
	err := row.Scan(&p.ID, &p.OwnerID, &p.OwnerName, &p.Name, &p.Title, &p.Source, &p.RepoID, &p.Project, &p.Repo,
		&p.Ref, &p.Folder, &p.SPA, &p.Enabled, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

func PublicPages(conn *sql.DB) ([]Page, error) {
	rows, err := conn.Query("SELECT " + pageColumns + " " + pageJoin +
		" WHERE pg.enabled = 1 AND u.approved_at IS NOT NULL ORDER BY pg.updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pages := []Page{}
	for rows.Next() {
		p, err := scanPage(rows)
		if err != nil {
			return nil, err
		}
		pages = append(pages, *p)
	}

	return pages, rows.Err()
}
