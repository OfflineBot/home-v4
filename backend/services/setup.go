package services

import (
	"fmt"
	"home-v4/backend/services/db"
)

/// the entry point for all server startup tasks
func Setup() error {
	err := db.Setup()
	if err != nil {
		fmt.Println("Database setup failed with error: " + err.Error())
	}

	return nil
}

