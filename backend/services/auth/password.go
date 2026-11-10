package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

const (
	minPasswordLength = 8
	clientHashPrefix  = "home-v4"
	clientHashLength  = sha256.Size * 2
)

var (
	ErrPasswordTooShort = errors.New("password too short")
	ErrNotClientHashed  = errors.New("password is not a client hash")
)

func clientHash(name, password string) string {
	sum := sha256.Sum256([]byte(clientHashPrefix + ":" + name + ":" + password))
	return hex.EncodeToString(sum[:])
}

func checkClientHash(password string) error {
	if len(password) != clientHashLength {
		return ErrNotClientHashed
	}

	for _, char := range password {
		isHex := (char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')
		if !isHex {
			return ErrNotClientHashed
		}
	}

	return nil
}
