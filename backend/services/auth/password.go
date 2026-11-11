package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	minPasswordLength = 8
	clientHashPrefix  = "home-v4:"
	clientHashRounds  = 600000
	clientHashBytes   = sha256.Size
	clientHashLength  = clientHashBytes * 2
)

var (
	ErrPasswordTooShort = errors.New("password too short")
	ErrNotClientHashed  = errors.New("password is not a client hash")
)

func normalizeName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func clientHash(name, password string) string {
	salt := clientHashPrefix + normalizeName(name)
	key := pbkdf2.Key([]byte(password), []byte(salt), clientHashRounds, clientHashBytes, sha256.New)

	return hex.EncodeToString(key)
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
