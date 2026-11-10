package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/auth"

	"golang.org/x/crypto/bcrypt"
)

const tokenBytes = 32

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrNameTaken          = errors.New("name already taken")
	ErrUnknownUser        = errors.New("unknown user")
)

type User = store.User

var (
	sessionTTL     time.Duration
	sessionRenewAt time.Duration
	decoyHash      []byte
)

func Setup() error {
	raw := os.Getenv("SESSION_TTL_MINUTES")
	if raw == "" {
		return errors.New("SESSION_TTL_MINUTES not set")
	}

	minutes, err := strconv.Atoi(raw)
	if err != nil {
		return err
	}
	if minutes <= 0 {
		return errors.New("SESSION_TTL_MINUTES must be positive")
	}

	sessionTTL = time.Duration(minutes) * time.Minute
	sessionRenewAt = sessionTTL / 2

	decoy := make([]byte, tokenBytes)
	if _, err := rand.Read(decoy); err != nil {
		return err
	}
	decoyHash, err = bcrypt.GenerateFromPassword(decoy, bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	if err := setupTwoFactor(); err != nil {
		return err
	}

	if err := store.DeleteExpiredSessions(db.DB); err != nil {
		return err
	}

	return ensureAdmin()
}

func Login(name, password, code string) (string, time.Time, error) {
	user, err := store.UserByName(db.DB, strings.TrimSpace(name))
	if err != nil {
		bcrypt.CompareHashAndPassword(decoyHash, []byte(password))
		return "", time.Time{}, ErrInvalidCredentials
	}

	if err := checkLockout(user.ID); err != nil {
		return "", time.Time{}, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		if failure := recordFailure(user.ID); failure != nil {
			return "", time.Time{}, failure
		}
		return "", time.Time{}, ErrInvalidCredentials
	}

	if err := checkTwoFactor(user.ID, code); err != nil {
		if errors.Is(err, ErrTwoFactorInvalid) {
			if failure := recordFailure(user.ID); failure != nil {
				return "", time.Time{}, failure
			}
		}
		return "", time.Time{}, err
	}

	if err := clearFailures(user.ID); err != nil {
		return "", time.Time{}, err
	}

	token, hash, err := newToken()
	if err != nil {
		return "", time.Time{}, err
	}

	expiresAt := time.Now().Add(sessionTTL)
	if err := store.CreateSession(db.DB, hash, user.ID, expiresAt); err != nil {
		return "", time.Time{}, err
	}

	return token, expiresAt, nil
}

func Unlock(name string) error {
	user, err := store.UserByName(db.DB, strings.TrimSpace(name))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrUnknownUser
		}
		return err
	}

	return clearFailures(user.ID)
}

func Logout(token string) error {
	return store.DeleteSession(db.DB, hashToken(token))
}

func Register(name, password string, isAdmin bool) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrInvalidCredentials
	}

	if err := checkClientHash(password); err != nil {
		return err
	}

	if _, err := store.UserByName(db.DB, name); err == nil {
		return ErrNameTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return store.CreateUser(db.DB, name, string(hash), isAdmin)
}

func UserByToken(token string) (*User, error) {
	hash := hashToken(token)

	user, expiresAt, err := store.UserBySession(db.DB, hash)
	if err != nil {
		return nil, err
	}

	if time.Until(expiresAt) < sessionRenewAt {
		if err := store.ExtendSession(db.DB, hash, time.Now().Add(sessionTTL)); err != nil {
			return nil, err
		}
	}

	return user, nil
}

func ensureAdmin() error {
	name := os.Getenv("ADMIN_USER")
	password := os.Getenv("ADMIN_PASSWORD")
	if name == "" || password == "" {
		return errors.New("ADMIN_USER and ADMIN_PASSWORD not set")
	}

	if len(password) < minPasswordLength {
		return ErrPasswordTooShort
	}

	count, err := store.CountUsers(db.DB)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	return Register(name, clientHash(name, password), true)
}

func newToken() (string, string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}

	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, hashToken(token), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
