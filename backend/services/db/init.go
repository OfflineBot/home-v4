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

//go:embed *.sql
var schemaFS embed.FS

var schemaFiles = []string{
	"user_schema.sql",
	"session_schema.sql",
	"lockout_schema.sql",
	"settings_schema.sql",
	"twofactor_schema.sql",
	"dhbw_account_schema.sql",
}

var DB *sql.DB

type extraSchema struct {
	name string
	sql  string
}

var extraSchemas []extraSchema

func AddSchema(name, schema string) {
	extraSchemas = append(extraSchemas, extraSchema{name: name, sql: schema})
}

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

	for _, name := range schemaFiles {
		schema, err := schemaFS.ReadFile(name)
		if err != nil { return err }

		if _, err := conn.Exec(string(schema)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}

	for _, extra := range extraSchemas {
		if _, err := conn.Exec(extra.sql); err != nil {
			return fmt.Errorf("%s: %w", extra.name, err)
		}
	}

	DB = conn
	return nil
}

