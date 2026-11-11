package files

import (
	"database/sql"
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
)

type ArchiveItem = store.ArchiveItem

type ArchiveListing struct {
	RetentionDays int           `json:"retention_days"`
	Items         []ArchiveItem `json:"items"`
}

const (
	RetentionDays = 90
	archiveDir    = internalPrefix + "archive"
	archiveIDSize = 8
	purgeEvery    = time.Hour
)

var ErrArchiveNotFound = errors.New("archive item not found")

func Archived(owner Owner) (*ArchiveListing, error) {
	if base == nil {
		return nil, ErrUnavailable
	}
	purgeExpired()

	items, err := store.ArchiveItemsByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}

	return &ArchiveListing{RetentionDays: RetentionDays, Items: items}, nil
}

func Restore(owner Owner, id, rawTarget string, overwrite bool) (*Entry, error) {
	item, err := archiveItem(owner, id)
	if err != nil {
		return nil, err
	}

	if rawTarget == "" {
		rawTarget = item.OriginalPath
	}
	root, target, err := open(owner, rawTarget)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if target == "." {
		return nil, ErrRoot
	}

	stored := storedPath(item)
	if _, err := root.Lstat(stored); err != nil {
		store.DeleteArchiveItem(db.DB, owner.ID, item.ID)
		return nil, ErrArchiveNotFound
	}

	if _, err := root.Lstat(target); err == nil {
		if !overwrite {
			return nil, ErrExists
		}
		if _, err := moveToArchive(root, owner, target); err != nil {
			return nil, err
		}
	}

	if err := root.MkdirAll(path.Dir(target), dirMode); err != nil {
		return nil, mkdirError(err)
	}
	if err := root.Rename(stored, target); err != nil {
		return nil, err
	}

	root.Remove(path.Dir(stored))
	if err := store.DeleteArchiveItem(db.DB, owner.ID, item.ID); err != nil {
		slog.Warn("files: archive entry left after restore", "id", item.ID, "err", err)
	}

	return stat(root, target)
}

func Purge(owner Owner, id string) error {
	item, err := archiveItem(owner, id)
	if err != nil {
		return err
	}

	return purge(item)
}

func PurgeAll(owner Owner) error {
	if base == nil {
		return ErrUnavailable
	}

	items, err := store.ArchiveItemsByOwner(db.DB, owner.ID)
	if err != nil {
		return err
	}

	var failures []error
	for i := range items {
		if err := purge(&items[i]); err != nil {
			failures = append(failures, err)
		}
	}

	return errors.Join(failures...)
}

func moveToArchive(root *os.Root, owner Owner, rel string) (*ArchiveItem, error) {
	info, err := root.Lstat(rel)
	if err != nil {
		return nil, notFound(err)
	}

	item := &ArchiveItem{
		ID:           randomID(),
		OwnerID:      owner.ID,
		OwnerName:    owner.Name,
		Name:         path.Base(rel),
		OriginalPath: display(rel),
		Type:         typeFile,
		Size:         info.Size(),
	}
	if info.IsDir() {
		item.Type = typeDir
		item.Size = treeSize(root, rel)
	}

	now := time.Now().UTC()
	item.DeletedAt = now.Format(time.RFC3339)
	item.ExpiresAt = now.AddDate(0, 0, RetentionDays).Format(time.RFC3339)

	holder := path.Join(archiveDir, item.ID)
	if err := root.MkdirAll(holder, dirMode); err != nil {
		return nil, err
	}
	stored := storedPath(item)
	if err := root.Rename(rel, stored); err != nil {
		root.Remove(holder)
		return nil, err
	}

	if err := store.CreateArchiveItem(db.DB, *item); err != nil {
		if restoreErr := root.Rename(stored, rel); restoreErr == nil {
			root.Remove(holder)
		}
		return nil, err
	}

	return item, nil
}

func archiveItem(owner Owner, id string) (*ArchiveItem, error) {
	if base == nil {
		return nil, ErrUnavailable
	}

	item, err := store.ArchiveItemByID(db.DB, owner.ID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrArchiveNotFound
	}

	return item, err
}

func purge(item *ArchiveItem) error {
	root, _, err := open(Owner{ID: item.OwnerID, Name: item.OwnerName}, "/")
	if err != nil {
		return err
	}
	defer root.Close()

	if err := root.RemoveAll(path.Join(archiveDir, item.ID)); err != nil {
		return err
	}

	err = store.DeleteArchiveItem(db.DB, item.OwnerID, item.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}

	return err
}

func purgeExpired() {
	items, err := store.ExpiredArchiveItems(db.DB, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		slog.Warn("files: reading expired archive failed", "err", err)
		return
	}

	for i := range items {
		if err := purge(&items[i]); err != nil {
			slog.Warn("files: purging archive item failed", "id", items[i].ID, "err", err)
		}
	}
}

func purgeLoop() {
	ticker := time.NewTicker(purgeEvery)
	defer ticker.Stop()

	for {
		purgeExpired()
		<-ticker.C
	}
}

func storedPath(item *ArchiveItem) string {
	return path.Join(archiveDir, item.ID, item.Name)
}

func treeSize(root *os.Root, rel string) int64 {
	var total int64
	fs.WalkDir(root.FS(), rel, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, err := d.Info(); err == nil && info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})

	return total
}

func randomID() string {
	return randomHex(archiveIDSize)
}
