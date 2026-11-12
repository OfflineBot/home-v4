package storage

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strconv"
)

const (
	dirMode    = 0o700
	fileMode   = 0o600
	partSuffix = ".part"
)

var root *os.Root

func Setup() error {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		return errors.New("No DB_PATH set!")
	}

	dir := filepath.Join(filepath.Dir(dbPath), "files")
	if err := os.MkdirAll(dir, dirMode); err != nil {
		return err
	}

	opened, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}

	root = opened
	return nil
}

func UserDir(userID int64, area string) string {
	return path.Join(strconv.FormatInt(userID, 10), area)
}

func Write(name string, r io.Reader) error {
	if err := root.MkdirAll(path.Dir(name), dirMode); err != nil {
		return err
	}

	part := name + partSuffix
	f, err := root.OpenFile(part, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, fileMode)
	if err != nil {
		return err
	}

	if _, err := io.Copy(f, r); err != nil {
		f.Close()
		root.Remove(part)
		return err
	}
	if err := f.Close(); err != nil {
		root.Remove(part)
		return err
	}

	return root.Rename(part, name)
}

func Open(name string) (*os.File, error) {
	return root.Open(name)
}

func Remove(name string) error {
	if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	return nil
}

func Prune(dir string, keep map[string]bool) error {
	entries, err := fs.ReadDir(root.FS(), dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	for _, entry := range entries {
		name := path.Join(dir, entry.Name())
		if entry.IsDir() || keep[name] {
			continue
		}
		if err := root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}

	return nil
}

func RemoveUser(userID int64) error {
	return root.RemoveAll(strconv.FormatInt(userID, 10))
}

func Usage(userID int64) (int64, error) {
	return dirSize(strconv.FormatInt(userID, 10))
}

func TotalUsage() (int64, error) {
	return dirSize(".")
}

func dirSize(dir string) (int64, error) {
	var total int64

	err := fs.WalkDir(root.FS(), dir, func(_ string, entry fs.DirEntry, err error) error {
		if errors.Is(err, fs.ErrNotExist) {
			return fs.SkipAll
		}
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})

	return total, err
}
