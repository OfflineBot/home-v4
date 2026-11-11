package files

import (
	"archive/zip"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	authstore "home-v4/backend/store/auth"
	store "home-v4/backend/store/domain_page"
)

//go:embed schema.sql
var Schema string

type Owner struct {
	ID   int64
	Name string
}

type Entry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	MimeType string `json:"mime_type,omitempty"`
}

type Listing struct {
	Path    string  `json:"path"`
	Parent  *string `json:"parent"`
	Entries []Entry `json:"entries"`
}

type Usage struct {
	Folder        string `json:"folder"`
	Used          int64  `json:"used_bytes"`
	Files         int    `json:"files"`
	Archived      int64  `json:"archived_bytes"`
	ArchivedItems int    `json:"archived_items"`
	Free          uint64 `json:"free_bytes"`
	Total         uint64 `json:"total_bytes"`
}

type Download struct {
	File     *os.File
	Name     string
	MimeType string
}

const (
	dirEnv         = "STORAGE_DIR"
	defaultDir     = "storage"
	rootMode       = 0o700
	dirMode        = 0o755
	fileMode       = 0o644
	internalPrefix = ".home-v4-"
	partPrefix     = internalPrefix + "upload-"
	partSuffix     = ".part"
	partRandom     = 8
	maxPath        = 4096
	maxSegment     = 255
	fallbackPrefix = "user-"
	deletedInfix   = ".deleted-"
	deletedLayout  = "20060102-150405"
	typeDir        = "dir"
	typeFile       = "file"
	zipSuffix      = ".zip"
	defaultMime    = "application/octet-stream"
)

var (
	folderPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	fallbackPattern = regexp.MustCompile(`^` + fallbackPrefix + `[0-9]+$`)
)

var compressedTypes = []string{"application/json", "application/xml", "application/javascript", "image/svg+xml"}

var (
	ErrUnavailable = errors.New("storage unavailable")
	ErrInvalidPath = errors.New("invalid path")
	ErrNotFound    = errors.New("path not found")
	ErrExists      = errors.New("path already exists")
	ErrNotDir      = errors.New("not a directory")
	ErrIsDir       = errors.New("is a directory")
	ErrRoot        = errors.New("storage root cannot be changed")
	ErrIntoItself  = errors.New("cannot move a folder into itself")
)

var (
	base *os.Root
	dir  string
)

func Setup() error {
	target := os.Getenv(dirEnv)
	if target == "" {
		dbPath := os.Getenv("DB_PATH")
		if dbPath == "" {
			return errors.New("no STORAGE_DIR or DB_PATH set")
		}
		target = filepath.Join(filepath.Dir(dbPath), defaultDir)
	}

	if err := os.MkdirAll(target, rootMode); err != nil {
		return err
	}
	if err := os.Chmod(target, rootMode); err != nil {
		return err
	}

	opened, err := os.OpenRoot(target)
	if err != nil {
		return err
	}

	base = opened
	dir = target
	go purgeLoop()
	return nil
}

func Folder(owner Owner) string {
	if folderPattern.MatchString(owner.Name) && !fallbackPattern.MatchString(owner.Name) && !strings.Contains(owner.Name, deletedInfix) {
		return owner.Name
	}

	return fallbackPrefix + strconv.FormatInt(owner.ID, 10)
}

func List(owner Owner, raw string) (*Listing, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return nil, err
	}
	defer root.Close()

	info, err := root.Stat(rel)
	if err != nil {
		return nil, notFound(err)
	}
	if !info.IsDir() {
		return nil, ErrNotDir
	}

	d, err := root.Open(rel)
	if err != nil {
		return nil, notFound(err)
	}
	defer d.Close()

	items, err := d.ReadDir(-1)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(items))
	for _, item := range items {
		if isInternal(item.Name()) {
			continue
		}
		child := path.Join(rel, item.Name())
		childInfo, err := root.Stat(child)
		if err != nil {
			continue
		}
		if entry, ok := entryOf(child, childInfo); ok {
			entries = append(entries, entry)
		}
	}
	slices.SortFunc(entries, func(a, b Entry) int {
		if a.Type != b.Type {
			if a.Type == typeDir {
				return -1
			}
			return 1
		}
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	listing := &Listing{Path: display(rel), Entries: entries}
	if rel != "." {
		parent := display(path.Dir(rel))
		listing.Parent = &parent
	}

	return listing, nil
}

func Open(owner Owner, raw string) (*Download, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return nil, err
	}
	defer root.Close()

	info, err := root.Stat(rel)
	if err != nil {
		return nil, notFound(err)
	}
	if info.IsDir() {
		return nil, ErrIsDir
	}

	f, err := root.Open(rel)
	if err != nil {
		return nil, notFound(err)
	}

	return &Download{File: f, Name: path.Base(rel), MimeType: mimeType(rel)}, nil
}

func Upload(owner Owner, raw string, body io.Reader, overwrite bool) (*Entry, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if rel == "." {
		return nil, ErrRoot
	}

	parent := path.Dir(rel)
	if err := root.MkdirAll(parent, dirMode); err != nil {
		return nil, mkdirError(err)
	}
	if info, err := root.Stat(rel); err == nil {
		if info.IsDir() {
			return nil, ErrIsDir
		}
		if !overwrite {
			return nil, ErrExists
		}
	}

	part := path.Join(parent, partPrefix+randomHex(partRandom)+partSuffix)
	f, err := root.OpenFile(part, os.O_WRONLY|os.O_CREATE|os.O_EXCL, fileMode)
	if err != nil {
		return nil, err
	}
	_, copyErr := io.Copy(f, body)
	closeErr := f.Close()
	if err := errors.Join(copyErr, closeErr); err != nil {
		root.Remove(part)
		return nil, err
	}

	if err := place(root, part, rel, overwrite); err != nil {
		root.Remove(part)
		return nil, err
	}

	return stat(root, rel)
}

func place(root *os.Root, part, rel string, overwrite bool) error {
	if overwrite {
		return root.Rename(part, rel)
	}

	err := root.Link(part, rel)
	if err == nil {
		root.Remove(part)
		return nil
	}
	if errors.Is(err, fs.ErrExist) {
		return ErrExists
	}
	if _, statErr := root.Lstat(rel); statErr == nil {
		return ErrExists
	}

	return root.Rename(part, rel)
}

func Mkdir(owner Owner, raw string) (*Entry, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if rel == "." {
		return nil, ErrRoot
	}

	if _, err := root.Lstat(rel); err == nil {
		return nil, ErrExists
	}
	if err := root.MkdirAll(rel, dirMode); err != nil {
		return nil, mkdirError(err)
	}

	return stat(root, rel)
}

func Move(owner Owner, rawFrom, rawTo string, overwrite bool) (*Entry, error) {
	root, from, err := open(owner, rawFrom)
	if err != nil {
		return nil, err
	}
	defer root.Close()

	to, err := clean(rawTo)
	if err != nil {
		return nil, err
	}
	if from == "." || to == "." {
		return nil, ErrRoot
	}

	source, err := root.Lstat(from)
	if err != nil {
		return nil, notFound(err)
	}
	if from == to {
		return stat(root, to)
	}
	if source.IsDir() && strings.HasPrefix(to, from+"/") {
		return nil, ErrIntoItself
	}

	if target, err := root.Lstat(to); err == nil {
		if target.IsDir() {
			return nil, ErrIsDir
		}
		if !overwrite || source.IsDir() {
			return nil, ErrExists
		}
	}

	if err := root.MkdirAll(path.Dir(to), dirMode); err != nil {
		return nil, mkdirError(err)
	}
	if err := root.Rename(from, to); err != nil {
		return nil, err
	}

	return stat(root, to)
}

func Delete(owner Owner, raw string) (*ArchiveItem, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if rel == "." {
		return nil, ErrRoot
	}

	return moveToArchive(root, owner, rel)
}

func Zip(owner Owner, raw string) (string, func(io.Writer) error, error) {
	root, rel, err := open(owner, raw)
	if err != nil {
		return "", nil, err
	}

	info, err := root.Stat(rel)
	if err != nil {
		root.Close()
		return "", nil, notFound(err)
	}
	if !info.IsDir() {
		root.Close()
		return "", nil, ErrNotDir
	}

	name := path.Base(rel)
	if rel == "." {
		name = Folder(owner)
	}

	write := func(w io.Writer) error {
		defer root.Close()
		return writeZip(root, rel, name, w)
	}

	return name + zipSuffix, write, nil
}

func UsageOf(owner Owner) (*Usage, error) {
	root, _, err := open(owner, "/")
	if err != nil {
		return nil, err
	}
	defer root.Close()

	usage := &Usage{Folder: Folder(owner)}
	err = fs.WalkDir(root.FS(), ".", func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if isInternal(d.Name()) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if info, err := d.Info(); err == nil && info.Mode().IsRegular() {
			usage.Used += info.Size()
			usage.Files++
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if usage.Archived, usage.ArchivedItems, err = store.ArchivedBytes(db.DB, owner.ID); err != nil {
		return nil, err
	}

	var stats syscall.Statfs_t
	if err := syscall.Statfs(dir, &stats); err == nil {
		usage.Free = stats.Bavail * uint64(stats.Bsize)
		usage.Total = stats.Blocks * uint64(stats.Bsize)
	}

	return usage, nil
}

func ArchiveUser(userID int64) error {
	if base == nil {
		return ErrUnavailable
	}

	name, err := authstore.UserNameByID(db.DB, userID)
	if err != nil {
		return err
	}

	folder := Folder(Owner{ID: userID, Name: name})
	if _, err := base.Lstat(folder); errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	target := folder + deletedInfix + time.Now().UTC().Format(deletedLayout)
	candidate := target
	for i := 2; ; i++ {
		if _, err := base.Lstat(candidate); errors.Is(err, fs.ErrNotExist) {
			break
		}
		candidate = fmt.Sprintf("%s-%d", target, i)
	}

	return base.Rename(folder, candidate)
}

func open(owner Owner, raw string) (*os.Root, string, error) {
	if base == nil {
		return nil, "", ErrUnavailable
	}

	rel, err := clean(raw)
	if err != nil {
		return nil, "", err
	}

	folder := Folder(owner)
	if err := base.MkdirAll(folder, dirMode); err != nil {
		return nil, "", fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	root, err := base.OpenRoot(folder)
	if err != nil {
		return nil, "", fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	return root, rel, nil
}

func clean(raw string) (string, error) {
	if len(raw) > maxPath || strings.ContainsRune(raw, 0) || !utf8.ValidString(raw) {
		return "", ErrInvalidPath
	}

	rel := strings.TrimPrefix(path.Clean("/"+raw), "/")
	if rel == "" {
		return ".", nil
	}
	for _, segment := range strings.Split(rel, "/") {
		if len(segment) > maxSegment || isInternal(segment) {
			return "", ErrInvalidPath
		}
	}

	return rel, nil
}

func display(rel string) string {
	if rel == "." {
		return "/"
	}

	return "/" + rel
}

func stat(root *os.Root, rel string) (*Entry, error) {
	info, err := root.Stat(rel)
	if err != nil {
		return nil, notFound(err)
	}

	entry, ok := entryOf(rel, info)
	if !ok {
		return nil, ErrNotFound
	}

	return &entry, nil
}

func entryOf(rel string, info fs.FileInfo) (Entry, bool) {
	entry := Entry{
		Name:     path.Base(rel),
		Path:     display(rel),
		Modified: info.ModTime().UTC().Format(time.RFC3339),
	}

	switch {
	case info.IsDir():
		entry.Type = typeDir
	case info.Mode().IsRegular():
		entry.Type = typeFile
		entry.Size = info.Size()
		entry.MimeType = mimeType(rel)
	default:
		return Entry{}, false
	}

	return entry, true
}

func writeZip(root *os.Root, rel, name string, w io.Writer) error {
	archive := zip.NewWriter(w)

	err := fs.WalkDir(root.FS(), rel, func(current string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if isInternal(d.Name()) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}

		inner := strings.TrimPrefix(strings.TrimPrefix(current, rel), "/")
		if rel == "." {
			inner = current
		}
		entryName := path.Join(name, inner)

		info, err := root.Stat(current)
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if current == rel {
				return nil
			}
			_, err := archive.CreateHeader(&zip.FileHeader{Name: entryName + "/", Modified: info.ModTime()})
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}

		method := zip.Store
		if compressible(mimeType(current)) {
			method = zip.Deflate
		}
		out, err := archive.CreateHeader(&zip.FileHeader{Name: entryName, Method: method, Modified: info.ModTime()})
		if err != nil {
			return err
		}

		f, err := root.Open(current)
		if err != nil {
			return nil
		}
		defer f.Close()

		_, err = io.Copy(out, f)
		return err
	})
	if err != nil {
		return err
	}

	return archive.Close()
}

func mimeType(rel string) string {
	value := mime.TypeByExtension(strings.ToLower(path.Ext(rel)))
	if value == "" {
		return defaultMime
	}

	media, _, err := mime.ParseMediaType(value)
	if err != nil {
		return defaultMime
	}

	return media
}

func compressible(mimetype string) bool {
	return strings.HasPrefix(mimetype, "text/") || slices.Contains(compressedTypes, mimetype)
}

func isInternal(name string) bool {
	return strings.HasPrefix(name, internalPrefix)
}

func randomHex(size int) string {
	raw := make([]byte, size)
	rand.Read(raw)
	return hex.EncodeToString(raw)
}

func notFound(err error) error {
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNotFound
	}

	return blocked(err)
}

func mkdirError(err error) error {
	if errors.Is(err, fs.ErrExist) {
		return ErrNotDir
	}

	return blocked(err)
}

func blocked(err error) error {
	var pathErr *fs.PathError
	if errors.As(err, &pathErr) && strings.Contains(pathErr.Err.Error(), "escapes") {
		return ErrInvalidPath
	}
	if errors.Is(err, syscall.ENOTDIR) {
		return ErrNotDir
	}

	return err
}
