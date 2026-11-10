package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"database/sql"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/auth"
)

const (
	totpSecretBytes  = 20
	totpDigits       = 6
	totpDivisor      = 1000000
	totpPeriod       = 30 * time.Second
	totpAllowedSteps = 1
	totpIssuer       = "Home V4"
	totpOffsetMask   = 0x0f
	totpSignMask     = 0x7fffffff
	totpKeyBytes     = 32
)

var (
	ErrTwoFactorRequired  = errors.New("two factor code required")
	ErrTwoFactorKeyUnset  = errors.New("TOTP_SECRET_KEY not set")
	ErrTwoFactorInvalid   = errors.New("invalid two factor code")
	ErrTwoFactorConfirmed = errors.New("two factor already confirmed")
	ErrTwoFactorMissing   = errors.New("two factor not set up")
)

var totpEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

var totpCipher cipher.AEAD

func setupTwoFactor() error {
	raw := os.Getenv("TOTP_SECRET_KEY")
	if raw == "" {
		return ErrTwoFactorKeyUnset
	}

	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return err
	}
	if len(key) != totpKeyBytes {
		return fmt.Errorf("TOTP_SECRET_KEY must decode to %d bytes", totpKeyBytes)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	totpCipher, err = cipher.NewGCM(block)
	return err
}

func sealSecret(secret string) (string, error) {
	nonce := make([]byte, totpCipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	sealed := totpCipher.Seal(nonce, nonce, []byte(secret), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func openSecret(stored string) (string, error) {
	sealed, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		return "", err
	}
	if len(sealed) < totpCipher.NonceSize() {
		return "", ErrTwoFactorMissing
	}

	nonce := sealed[:totpCipher.NonceSize()]
	secret, err := totpCipher.Open(nil, nonce, sealed[totpCipher.NonceSize():], nil)
	if err != nil {
		return "", err
	}

	return string(secret), nil
}

func TwoFactorSetup(user *User, password string) (string, string, error) {
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", "", ErrInvalidCredentials
	}

	existing, err := store.TwoFactorByUser(db.DB, user.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", "", err
	}
	if existing != nil && existing.Confirmed {
		return "", "", ErrTwoFactorConfirmed
	}

	raw := make([]byte, totpSecretBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	secret := totpEncoding.EncodeToString(raw)

	sealed, err := sealSecret(secret)
	if err != nil {
		return "", "", err
	}
	if err := store.SetTwoFactorSecret(db.DB, user.ID, sealed); err != nil {
		return "", "", err
	}

	return secret, otpauthURI(user.Name, secret), nil
}

func TwoFactorConfirm(userID int64, code string) error {
	twoFactor, err := store.TwoFactorByUser(db.DB, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrTwoFactorMissing
		}
		return err
	}
	if twoFactor.Confirmed {
		return ErrTwoFactorConfirmed
	}

	counter, err := verifyCode(twoFactor, code)
	if err != nil {
		return err
	}

	return store.ConfirmTwoFactor(db.DB, userID, counter)
}

func TwoFactorDisable(user *User, password, code string) error {
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return ErrInvalidCredentials
	}

	twoFactor, err := store.TwoFactorByUser(db.DB, user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrTwoFactorMissing
		}
		return err
	}

	if twoFactor.Confirmed {
		if _, err := verifyCode(twoFactor, code); err != nil {
			return err
		}
	}

	return store.DeleteTwoFactor(db.DB, user.ID)
}

func TwoFactorConfirmed(userID int64) (bool, error) {
	twoFactor, err := store.TwoFactorByUser(db.DB, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	return twoFactor.Confirmed, nil
}

func checkTwoFactor(userID int64, code string) error {
	twoFactor, err := store.TwoFactorByUser(db.DB, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	if !twoFactor.Confirmed {
		return nil
	}

	if strings.TrimSpace(code) == "" {
		return ErrTwoFactorRequired
	}

	counter, err := verifyCode(twoFactor, code)
	if err != nil {
		return err
	}

	return store.SetTwoFactorCounter(db.DB, userID, counter)
}

func verifyCode(twoFactor *store.TwoFactor, code string) (int64, error) {
	plain, err := openSecret(twoFactor.Secret)
	if err != nil {
		return 0, err
	}

	secret, err := totpEncoding.DecodeString(plain)
	if err != nil {
		return 0, err
	}

	code = strings.TrimSpace(code)
	current := time.Now().Unix() / int64(totpPeriod.Seconds())

	for offset := -totpAllowedSteps; offset <= totpAllowedSteps; offset++ {
		counter := current + int64(offset)
		if counter <= twoFactor.LastCounter {
			continue
		}

		expected := totpCode(secret, uint64(counter))
		if subtle.ConstantTimeCompare([]byte(expected), []byte(code)) == 1 {
			return counter, nil
		}
	}

	return 0, ErrTwoFactorInvalid
}

func totpCode(secret []byte, counter uint64) string {
	var message [8]byte
	binary.BigEndian.PutUint64(message[:], counter)

	mac := hmac.New(sha1.New, secret)
	mac.Write(message[:])
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & totpOffsetMask
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & totpSignMask

	return fmt.Sprintf("%0*d", totpDigits, value%totpDivisor)
}

func otpauthURI(name, secret string) string {
	label := totpIssuer + ":" + name
	query := url.Values{}
	query.Set("secret", secret)
	query.Set("issuer", totpIssuer)
	query.Set("algorithm", "SHA1")
	query.Set("digits", fmt.Sprint(totpDigits))
	query.Set("period", fmt.Sprint(int(totpPeriod.Seconds())))

	return "otpauth://totp/" + url.PathEscape(label) + "?" + query.Encode()
}
