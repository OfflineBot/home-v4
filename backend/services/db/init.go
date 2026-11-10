package db

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"

	_ "modernc.org/sqlite"
)

const pragmas = "_pragma=foreign_keys(ON)" +
	"&_pragma=journal_mode(WAL)" +
	"&_pragma=busy_timeout(5000)"

//go:embed *.sql
var schemaFS embed.FS
var DB *sql.DB

func Setup() error {
	path := os.Getenv("DB_PATH")
	if path == "" {
		return fmt.Errorf("No DB_PATH set!")
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	conn, err := sql.Open("sqlite", "file:"+path+"?"+pragmas)
	if err != nil { return err }
	if err := conn.Ping(); err != nil { return err }
	conn.SetMaxOpenConns(1)

	names, err := fs.Glob(schemaFS, "*.sql")
	if err != nil { return err }
	slices.Sort(names)

	for _, name := range names {
		schema, err := schemaFS.ReadFile(name)
		if err != nil { return err }

		if _, err := conn.Exec(string(schema)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}

	DB = conn
	return nil
}

