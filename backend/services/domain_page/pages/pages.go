package pages

import (
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	"home-v4/backend/services/domain_page/files"
	"home-v4/backend/services/domain_page/git"
	store "home-v4/backend/store/domain_page"
)

//go:embed schema.sql
var Schema string

type Owner struct {
	ID   int64
	Name string
}

type Input struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Source  string `json:"source"`
	Project string `json:"project"`
	Repo    string `json:"repo"`
	Ref     string `json:"ref"`
	Folder  string `json:"folder"`
	SPA     bool   `json:"spa"`
}

type Update struct {
	Title   *string `json:"title"`
	Source  *string `json:"source"`
	Project *string `json:"project"`
	Repo    *string `json:"repo"`
	Ref     *string `json:"ref"`
	Folder  *string `json:"folder"`
	SPA     *bool   `json:"spa"`
	Enabled *bool   `json:"enabled"`
}

type View struct {
	Name      string `json:"name"`
	Title     string `json:"title"`
	Source    string `json:"source"`
	Project   string `json:"project,omitempty"`
	Repo      string `json:"repo,omitempty"`
	Ref       string `json:"ref"`
	Folder    string `json:"folder"`
	SPA       bool   `json:"spa"`
	Enabled   bool   `json:"enabled"`
	Status    string `json:"status"`
	Path      string `json:"path"`
	URL       string `json:"url,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Availability struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

type Asset struct {
	Status      int
	ContentType string
	Size        int64
	ETag        string
	Modified    time.Time
	Body        io.ReadCloser
	Redirect    string
}

const (
	SourceGit      = "git"
	SourceFiles    = "files"
	baseURLEnv     = "PAGES_BASE_URL"
	maxTitle       = 100
	maxFolder      = 1024
	indexFile      = "index.html"
	notFoundFile   = "404.html"
	statusOK       = "ok"
	statusMissing  = "source_missing"
	statusDisabled = "disabled"
	uniqueFailure  = "UNIQUE constraint failed"
	defaultType    = "application/octet-stream"
)

var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

var (
	ErrInvalidName    = errors.New("invalid page name")
	ErrInvalidInput   = errors.New("invalid page input")
	ErrNameTaken      = errors.New("page name already taken")
	ErrNotFound       = errors.New("page not found")
	ErrSourceNotFound = errors.New("page source not found")
)

func Check(raw string) Availability {
	name := strings.TrimSpace(raw)
	result := Availability{Name: name}

	switch {
	case !validName(name):
		result.Reason = "invalid"
	default:
		if _, err := store.PageByName(db.DB, name); err == nil {
			result.Reason = "taken"
		} else {
			result.Available = true
		}
	}

	return result
}

func List(owner Owner) ([]View, error) {
	pages, err := store.PagesByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}

	views := make([]View, 0, len(pages))
	for i := range pages {
		views = append(views, view(&pages[i]))
	}

	return views, nil
}

func Create(owner Owner, in Input) (*View, error) {
	name := strings.TrimSpace(in.Name)
	if !validName(name) {
		return nil, ErrInvalidName
	}

	page := store.Page{OwnerID: owner.ID, Name: name, Enabled: true, SPA: in.SPA}
	if err := applySource(owner, &page, in.Source, in.Project, in.Repo, in.Ref, in.Folder); err != nil {
		return nil, err
	}
	title, err := cleanTitle(in.Title)
	if err != nil {
		return nil, err
	}
	page.Title = title

	if err := store.CreatePage(db.DB, page); err != nil {
		if strings.Contains(err.Error(), uniqueFailure) {
			return nil, ErrNameTaken
		}
		return nil, err
	}

	return byName(owner, name)
}

func Edit(owner Owner, name string, in Update) (*View, error) {
	page, err := ownPage(owner, name)
	if err != nil {
		return nil, err
	}

	if in.Title != nil {
		if page.Title, err = cleanTitle(*in.Title); err != nil {
			return nil, err
		}
	}
	if in.SPA != nil {
		page.SPA = *in.SPA
	}
	if in.Enabled != nil {
		page.Enabled = *in.Enabled
	}

	if in.Source != nil || in.Project != nil || in.Repo != nil || in.Ref != nil || in.Folder != nil {
		source := page.Source
		project, repo := deref(page.Project), deref(page.Repo)
		ref, folder := page.Ref, page.Folder
		if in.Source != nil {
			source = *in.Source
		}
		if in.Project != nil {
			project = *in.Project
		}
		if in.Repo != nil {
			repo = *in.Repo
		}
		if in.Ref != nil {
			ref = *in.Ref
		}
		if in.Folder != nil {
			folder = *in.Folder
		}
		if err := applySource(owner, page, source, project, repo, ref, folder); err != nil {
			return nil, err
		}
	}

	if err := store.UpdatePage(db.DB, *page); err != nil {
		return nil, err
	}

	return byName(owner, page.Name)
}

func Delete(owner Owner, name string) error {
	page, err := ownPage(owner, name)
	if err != nil {
		return err
	}

	return store.DeletePage(db.DB, owner.ID, page.ID)
}

func Resolve(name, rest string) (*Asset, error) {
	page, err := store.PageByName(db.DB, name)
	if err != nil || !page.Enabled {
		return nil, ErrNotFound
	}

	rel := strings.TrimPrefix(path.Clean("/"+rest), "/")
	wantsDir := rest == "" || strings.HasSuffix(rest, "/")

	target := rel
	if wantsDir {
		target = path.Join(rel, indexFile)
	}

	asset, err := open(page, target)
	switch {
	case err == nil:
		return asset, nil
	case errors.Is(err, errIsDir) && !wantsDir:
		return &Asset{Redirect: "/" + page.Name + "/" + rel + "/"}, nil
	case !errors.Is(err, ErrNotFound) && !errors.Is(err, errIsDir):
		return nil, err
	}

	if page.SPA {
		if asset, err := open(page, indexFile); err == nil {
			return asset, nil
		}
	}
	if asset, err := open(page, notFoundFile); err == nil {
		asset.Status = 404
		return asset, nil
	}

	return nil, ErrNotFound
}

var errIsDir = errors.New("is a directory")

func open(page *store.Page, rel string) (*Asset, error) {
	full := strings.TrimPrefix(path.Join(page.Folder, rel), "/")

	switch page.Source {
	case SourceGit:
		if page.RepoID == nil {
			return nil, ErrNotFound
		}
		file, err := git.OpenFile(*page.RepoID, page.Ref, full)
		switch {
		case errors.Is(err, git.ErrNotABlob):
			return nil, errIsDir
		case errors.Is(err, git.ErrNotFound), errors.Is(err, git.ErrRefNotFound):
			return nil, ErrNotFound
		case err != nil:
			return nil, err
		}
		return &Asset{Status: 200, ContentType: contentType(full), Size: file.Size, ETag: `"` + file.Hash + `"`, Body: file.Body}, nil

	case SourceFiles:
		download, err := files.Open(files.Owner{ID: page.OwnerID, Name: page.OwnerName}, "/"+full)
		switch {
		case errors.Is(err, files.ErrIsDir):
			return nil, errIsDir
		case errors.Is(err, files.ErrNotFound), errors.Is(err, files.ErrInvalidPath), errors.Is(err, files.ErrNotDir):
			return nil, ErrNotFound
		case err != nil:
			return nil, err
		}
		info, err := download.File.Stat()
		if err != nil {
			download.File.Close()
			return nil, err
		}
		return &Asset{
			Status:      200,
			ContentType: contentType(full),
			Size:        info.Size(),
			ETag:        fmt.Sprintf(`"%x-%x"`, info.ModTime().UnixNano(), info.Size()),
			Modified:    info.ModTime(),
			Body:        download.File,
		}, nil
	}

	return nil, ErrNotFound
}

func applySource(owner Owner, page *store.Page, source, project, repo, ref, folder string) error {
	folder, err := cleanFolder(folder)
	if err != nil {
		return err
	}
	ref = strings.TrimSpace(ref)

	switch source {
	case SourceGit:
		if !git.ValidRef(ref) {
			return ErrInvalidInput
		}
		repoID, err := git.OwnedRepoID(git.Owner{ID: owner.ID, Name: owner.Name}, project, repo)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrSourceNotFound, err)
		}
		page.RepoID = &repoID
		page.Ref = ref
	case SourceFiles:
		if _, err := files.List(files.Owner{ID: owner.ID, Name: owner.Name}, "/"+folder); err != nil {
			return fmt.Errorf("%w: %w", ErrSourceNotFound, err)
		}
		page.RepoID = nil
		page.Ref = ""
	default:
		return ErrInvalidInput
	}

	page.Source = source
	page.Folder = folder
	return nil
}

func ownPage(owner Owner, name string) (*store.Page, error) {
	page, err := store.PageByName(db.DB, strings.TrimSpace(name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if page.OwnerID != owner.ID {
		return nil, ErrNotFound
	}

	return page, nil
}

func byName(owner Owner, name string) (*View, error) {
	page, err := ownPage(owner, name)
	if err != nil {
		return nil, err
	}

	v := view(page)
	return &v, nil
}

func view(p *store.Page) View {
	v := View{
		Name:      p.Name,
		Title:     p.Title,
		Source:    p.Source,
		Project:   deref(p.Project),
		Repo:      deref(p.Repo),
		Ref:       p.Ref,
		Folder:    p.Folder,
		SPA:       p.SPA,
		Enabled:   p.Enabled,
		Status:    statusOK,
		Path:      "/" + p.Name + "/",
		CreatedAt: p.CreatedAt,
		UpdatedAt: p.UpdatedAt,
	}
	if p.Source == SourceGit && p.RepoID == nil {
		v.Status = statusMissing
	}
	if !p.Enabled {
		v.Status = statusDisabled
	}
	v.URL = URL(p.Name)

	return v
}

// URL is where a page is served, empty while no public base is configured.
func URL(name string) string {
	base := strings.TrimRight(os.Getenv(baseURLEnv), "/")
	if base == "" {
		return ""
	}

	return base + "/" + name + "/"
}

func validName(name string) bool {
	return namePattern.MatchString(name) && !strings.Contains(name, "..")
}

func cleanTitle(raw string) (string, error) {
	title := strings.TrimSpace(raw)
	if !utf8.ValidString(title) || utf8.RuneCountInString(title) > maxTitle || strings.ContainsAny(title, "\x00\n\r") {
		return "", ErrInvalidInput
	}

	return title, nil
}

func cleanFolder(raw string) (string, error) {
	if len(raw) > maxFolder || !utf8.ValidString(raw) || strings.ContainsAny(raw, "\x00\n\r") {
		return "", ErrInvalidInput
	}

	return strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(raw)), "/"), nil
}

func contentType(rel string) string {
	if value := mime.TypeByExtension(strings.ToLower(path.Ext(rel))); value != "" {
		return value
	}

	return defaultType
}

func deref(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
