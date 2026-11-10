
package services

import (
	"fmt"
	"home-v4/backend/services/db"
)

// / the entry point for all server startup tasks
func Setup() error {
	if err := db.Setup(); err != nil {
		return fmt.Errorf("Database setup failed with error: %w", err)
	}
	return nil
}

