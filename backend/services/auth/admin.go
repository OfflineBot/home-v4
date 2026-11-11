package auth

import (
	"database/sql"
	"errors"
	"strings"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/auth"
)

type UserSummary = store.UserSummary

var (
	ErrSelfTarget = errors.New("cannot target your own account")
	ErrLastAdmin  = errors.New("cannot remove the last admin")
	ErrNoChange   = errors.New("nothing to change")
)

func ListUsers() ([]UserSummary, error) {
	return store.ListUsers(db.DB)
}

func Approve(name string) error {
	user, err := target(name)
	if err != nil {
		return err
	}

	if err := store.ApproveUser(db.DB, user.ID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNoChange
		}
		return err
	}

	return nil
}

func RevokeApproval(actor *User, name string) error {
	user, err := otherUser(actor, name)
	if err != nil {
		return err
	}

	if err := store.RevokeApproval(db.DB, user.ID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNoChange
		}
		return err
	}

	return store.DeleteSessionsByUser(db.DB, user.ID)
}

func SetAdmin(actor *User, name string, isAdmin bool) error {
	user, err := otherUser(actor, name)
	if err != nil {
		return err
	}

	if !isAdmin {
		if err := keepOneAdmin(user); err != nil {
			return err
		}
	}

	if err := store.SetAdmin(db.DB, user.ID, isAdmin); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNoChange
		}
		return err
	}

	return nil
}

func DeleteUser(actor *User, name string) error {
	user, err := otherUser(actor, name)
	if err != nil {
		return err
	}

	if err := keepOneAdmin(user); err != nil {
		return err
	}

	return store.DeleteUser(db.DB, user.ID)
}

func ResetTwoFactor(actor *User, name string) error {
	user, err := otherUser(actor, name)
	if err != nil {
		return err
	}

	return store.DeleteTwoFactor(db.DB, user.ID)
}

func Unlock(name string) error {
	user, err := target(name)
	if err != nil {
		return err
	}

	return clearFailures(user.ID)
}

func target(name string) (*User, error) {
	user, err := store.UserByName(db.DB, strings.TrimSpace(name))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUnknownUser
		}
		return nil, err
	}

	return user, nil
}

func otherUser(actor *User, name string) (*User, error) {
	user, err := target(name)
	if err != nil {
		return nil, err
	}
	if user.ID == actor.ID {
		return nil, ErrSelfTarget
	}

	return user, nil
}

func keepOneAdmin(user *User) error {
	if !user.IsAdmin {
		return nil
	}

	admins, err := store.CountAdmins(db.DB)
	if err != nil {
		return err
	}
	if admins <= 1 {
		return ErrLastAdmin
	}

	return nil
}
