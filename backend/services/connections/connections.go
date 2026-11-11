package connections

import (
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/connections"
	"home-v4/libs/dualis"
	"home-v4/libs/email"
	"home-v4/libs/moodle"
)

type DHBWAccount = store.DHBWAccount

type Module string

const (
	Dualis Module = "dualis"
	Mail   Module = "mail"
	Moodle Module = "moodle"
)

var Modules = []Module{Dualis, Mail, Moodle}

type Credentials struct {
	Username string
	Password string
}

type Status struct {
	Name        *string           `json:"name"`
	Dualis      bool              `json:"dualis"`
	Mail        bool              `json:"mail"`
	Moodle      bool              `json:"moodle"`
	Logins      map[Module]string `json:"logins"`
	DualisGuard *Guard            `json:"dualis_guard"`
}

type ModuleError struct {
	Module Module
	Err    error
}

func (e *ModuleError) Error() string {
	return string(e.Module) + ": " + e.Err.Error()
}

func (e *ModuleError) Unwrap() error {
	return e.Err
}

var (
	MoodleURL  = "https://elearning.dhbw-ravensburg.de"
	MailServer = "webmail.dhbw-ravensburg.de"
)

const (
	dualisSuffix     = "@stud.dhbw-ravensburg.de"
	mailPrefix       = `DOMAB\`
	keyBytes         = 32
	maxPasswordBytes = 256
)

var (
	ErrKeyUnset        = errors.New("TOTP_SECRET_KEY not set")
	ErrInvalidName     = errors.New("invalid dhbw name")
	ErrInvalidPassword = errors.New("invalid dhbw password")
	ErrUnknownModule   = errors.New("unknown dhbw module")
	ErrNotConfigured   = errors.New("dhbw login not configured")
	ErrNameMissing     = errors.New("dhbw name not set")
	ErrLoginFailed     = errors.New("dhbw login rejected")
	ErrVerifyFailed    = errors.New("dhbw login could not be verified")
)

var namePattern = regexp.MustCompile(`^[a-z0-9]+([._-][a-z0-9]+)*$`)

var aead cipher.AEAD

var verifyLogin = verify

func Setup() error {
	raw := os.Getenv("TOTP_SECRET_KEY")
	if raw == "" {
		return ErrKeyUnset
	}

	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return err
	}
	if len(key) != keyBytes {
		return fmt.Errorf("TOTP_SECRET_KEY must decode to %d bytes", keyBytes)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	aead, err = cipher.NewGCMWithRandomNonce(block)
	return err
}

func ParseName(raw string) (string, error) {
	name := strings.ToLower(strings.TrimSpace(raw))
	name = strings.TrimPrefix(name, strings.ToLower(mailPrefix))
	name = strings.TrimSuffix(name, dualisSuffix)

	if !namePattern.MatchString(name) {
		return "", ErrInvalidName
	}

	return name, nil
}

func (m Module) Username(name string) (string, error) {
	switch m {
	case Dualis:
		return name + dualisSuffix, nil
	case Mail:
		return mailPrefix + name, nil
	case Moodle:
		return name, nil
	}

	return "", ErrUnknownModule
}

func ByUser(userID int64) (*DHBWAccount, error) {
	acc, err := store.DHBWAccountByUser(db.DB, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return acc, nil
}

func StatusByUser(userID int64) (*Status, error) {
	acc, err := ByUser(userID)
	if err != nil {
		return nil, err
	}
	guard, err := DualisGuard(userID)
	if err != nil {
		return nil, err
	}

	status := &Status{Logins: map[Module]string{}, DualisGuard: guard}
	if acc == nil {
		return status, nil
	}

	status.Name = acc.Name
	status.Dualis = acc.Dualis != nil
	status.Mail = acc.Mail != nil
	status.Moodle = acc.Moodle != nil

	if acc.Name != nil {
		for _, module := range Modules {
			login, err := module.Username(*acc.Name)
			if err != nil {
				return nil, err
			}
			status.Logins[module] = login
		}
	}

	return status, nil
}

func SetName(userID int64, raw string) error {
	name, err := ParseName(raw)
	if err != nil {
		return err
	}

	acc, err := ByUser(userID)
	if err != nil {
		return err
	}
	if acc != nil && (acc.Name == nil || *acc.Name != name) {
		if err := verifyStored(userID, acc, name); err != nil {
			return err
		}
	}

	return store.SetName(db.DB, userID, &name)
}

func RemoveName(userID int64) error {
	return store.SetName(db.DB, userID, nil)
}

func SetPassword(userID int64, module Module, password string) error {
	set, err := setter(module)
	if err != nil {
		return err
	}
	if password == "" || len(password) > maxPasswordBytes {
		return ErrInvalidPassword
	}

	acc, err := ByUser(userID)
	if err != nil {
		return err
	}
	if acc == nil || acc.Name == nil {
		return ErrNameMissing
	}

	username, err := module.Username(*acc.Name)
	if err != nil {
		return err
	}
	if err := verifyLogin(userID, module, username, password); err != nil {
		return err
	}

	sealed := base64.StdEncoding.EncodeToString(
		aead.Seal(nil, nil, []byte(password), additionalData(userID, module)),
	)

	return set(db.DB, userID, &sealed)
}

func RemovePassword(userID int64, module Module) error {
	set, err := setter(module)
	if err != nil {
		return err
	}

	return set(db.DB, userID, nil)
}

func RemovePasswords(userID int64) error {
	return store.ClearPasswords(db.DB, userID)
}

func UsersWith(module Module) ([]int64, error) {
	if _, err := setter(module); err != nil {
		return nil, err
	}

	return store.UsersWith(db.DB, string(module))
}

func ErrorCode(err error) string {
	var netErr net.Error

	switch {
	case errors.Is(err, ErrNotConfigured):
		return "not_configured"
	case errors.Is(err, ErrDualisLocked):
		return "locked"
	case errors.Is(err, ErrDualisBackoff):
		return "backoff"
	case errors.Is(err, dualis.ErrAuthFailed),
		errors.Is(err, email.ErrAuthFailed),
		errors.Is(err, moodle.ErrInvalidLogin),
		errors.Is(err, moodle.ErrAuthFailed):
		return "login_failed"
	case errors.As(err, &netErr):
		return "unreachable"
	default:
		return "failed"
	}
}

func Login(userID int64, module Module) (*Credentials, error) {
	acc, err := ByUser(userID)
	if err != nil {
		return nil, err
	}
	if acc == nil || acc.Name == nil {
		return nil, ErrNotConfigured
	}

	username, err := module.Username(*acc.Name)
	if err != nil {
		return nil, err
	}

	stored, err := storedPassword(acc, module)
	if err != nil {
		return nil, err
	}
	if stored == nil {
		return nil, ErrNotConfigured
	}

	password, err := open(userID, module, *stored)
	if err != nil {
		return nil, err
	}

	return &Credentials{Username: username, Password: password}, nil
}

func DualisSession(userID int64) (*dualis.Session, error) {
	creds, err := Login(userID, Dualis)
	if err != nil {
		return nil, err
	}

	return dualisLogin(userID, creds.Username, creds.Password, true)
}

func MoodleToken(userID int64) (string, error) {
	creds, err := Login(userID, Moodle)
	if err != nil {
		return "", err
	}

	pair, err := moodle.GetToken(MoodleURL, creds.Username, creds.Password)
	if err != nil {
		return "", err
	}

	return pair.Token, nil
}

func verify(userID int64, module Module, username, password string) error {
	var err, rejected error

	switch module {
	case Dualis:
		_, err = dualisLogin(userID, username, password, false)
		rejected = dualis.ErrAuthFailed
	case Mail:
		_, err = email.TestConnection(MailServer, username, password)
		rejected = email.ErrAuthFailed
	case Moodle:
		_, err = moodle.GetToken(MoodleURL, username, password)
		rejected = moodle.ErrInvalidLogin
	default:
		return ErrUnknownModule
	}

	switch {
	case err == nil:
		return nil
	case errors.Is(err, ErrDualisLocked):
		return &ModuleError{Module: module, Err: err}
	case errors.Is(err, rejected):
		return &ModuleError{Module: module, Err: ErrLoginFailed}
	default:
		return &ModuleError{Module: module, Err: fmt.Errorf("%w: %w", ErrVerifyFailed, err)}
	}
}

func verifyStored(userID int64, acc *DHBWAccount, name string) error {
	results := make([]error, len(Modules))

	var wg sync.WaitGroup
	for i, module := range Modules {
		stored, err := storedPassword(acc, module)
		if err != nil {
			return err
		}
		if stored == nil {
			continue
		}

		wg.Go(func() {
			password, err := open(userID, module, *stored)
			if err != nil {
				results[i] = err
				return
			}

			username, err := module.Username(name)
			if err != nil {
				results[i] = err
				return
			}

			results[i] = verifyLogin(userID, module, username, password)
		})
	}
	wg.Wait()

	for _, err := range results {
		if err != nil {
			return err
		}
	}

	return nil
}

func open(userID int64, module Module, stored string) (string, error) {
	sealed, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		return "", err
	}

	password, err := aead.Open(nil, nil, sealed, additionalData(userID, module))
	if err != nil {
		return "", err
	}

	return string(password), nil
}

func setter(module Module) (func(*sql.DB, int64, *string) error, error) {
	switch module {
	case Dualis:
		return store.SetDualis, nil
	case Mail:
		return store.SetMail, nil
	case Moodle:
		return store.SetMoodle, nil
	}

	return nil, ErrUnknownModule
}

func storedPassword(acc *DHBWAccount, module Module) (*string, error) {
	switch module {
	case Dualis:
		return acc.Dualis, nil
	case Mail:
		return acc.Mail, nil
	case Moodle:
		return acc.Moodle, nil
	}

	return nil, ErrUnknownModule
}

func additionalData(userID int64, module Module) []byte {
	return []byte("dhbw:" + string(module) + ":" + strconv.FormatInt(userID, 10))
}
