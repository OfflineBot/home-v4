package db

import (
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const pragmas = "_pragma=foreign_keys(ON)" +
	"&_pragma=journal_mode(WAL)" +
	"&_pragma=busy_timeout(5000)"

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

	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil { return err }
	
	if _, err := conn.Exec(string(schema)); err != nil {
		return err
	}

	DB = conn
	return nil
}

