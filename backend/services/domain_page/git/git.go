package git

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
)

//go:embed schema.sql
var Schema string

type Owner struct {
	ID   int64
	Name string
}

type Repo struct {
	Project     string `json:"project"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Private     bool   `json:"private"`
	CreatedAt   string `json:"created_at"`
	ClonePath   string `json:"clone_path"`
}

type Project struct {
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	Repos     []Repo `json:"repos"`
}

type Availability struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

type RepoUpdate struct {
	Private     *bool   `json:"private"`
	Description *string `json:"description"`
}

type Ref struct {
	Name    string `json:"name"`
	Commit  string `json:"commit"`
	Updated string `json:"updated"`
}

type Commit struct {
	Hash    string `json:"hash"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Subject string `json:"subject"`
}

type Detail struct {
	Repo
	Owned         bool     `json:"owned"`
	Empty         bool     `json:"empty"`
	DefaultBranch string   `json:"default_branch"`
	Branches      []Ref    `json:"branches"`
	Tags          []Ref    `json:"tags"`
	Commits       []Commit `json:"commits"`
}

type Token = store.GitToken

type NewToken struct {
	Token
	Secret string `json:"token"`
}

const (
	dirEnv         = "GIT_REPOS_DIR"
	defaultDir     = "git"
	rootMode       = 0o700
	dirMode        = 0o755
	RepoSuffix     = ".git"
	deletedInfix   = ".deleted-"
	deletedLayout  = "20060102-150405"
	defaultBranch  = "main"
	tokenPrefix    = "hv4_"
	tokenBytes     = 32
	prefixLength   = 12
	maxTokens      = 20
	maxTokenName   = 64
	maxDescription = 300
	commitLimit    = 20
	commandWait    = 15 * time.Second
	touchEvery     = time.Minute
	uniqueFailure  = "UNIQUE constraint failed"
	fieldSeparator = "\x00"
	reasonInvalid  = "invalid"
	reasonReserved = "reserved"
	reasonTaken    = "taken"
)

var (
	namePattern      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	reservedProjects = []string{"api"}
)

var (
	ErrUnavailable    = errors.New("git storage unavailable")
	ErrInvalidName    = errors.New("invalid name")
	ErrReserved       = errors.New("reserved project name")
	ErrNameTaken      = errors.New("project name already taken")
	ErrExists         = errors.New("repository already exists")
	ErrNotFound       = errors.New("not found")
	ErrInvalidInput   = errors.New("invalid input")
	ErrTooManyTokens  = errors.New("too many tokens")
	ErrTokenNotFound  = errors.New("token not found")
	ErrProjectNotOwn  = errors.New("project belongs to another user")
	errGitUnavailable = errors.New("git binary not found")
)

var (
	reposDir string
	gitReady bool
)

func Setup() error {
	target := os.Getenv(dirEnv)
	if target == "" {
		dbPath := os.Getenv("DB_PATH")
		if dbPath == "" {
			return errors.New("no GIT_REPOS_DIR or DB_PATH set")
		}
		target = filepath.Join(filepath.Dir(dbPath), defaultDir)
	}

	if err := os.MkdirAll(target, rootMode); err != nil {
		return err
	}
	if err := os.Chmod(target, rootMode); err != nil {
		return err
	}
	reposDir = target

	if _, err := exec.LookPath("git"); err != nil {
		slog.Warn("git: binary not found, git hosting disabled", "err", err)
		return nil
	}
	gitReady = true

	return nil
}

func CheckProject(raw string) Availability {
	name := strings.TrimSpace(raw)
	result := Availability{Name: name}

	switch err := validateProject(name); {
	case errors.Is(err, ErrReserved):
		result.Reason = reasonReserved
	case err != nil:
		result.Reason = reasonInvalid
	default:
		if _, err := store.GitProjectByName(db.DB, name); err == nil {
			result.Reason = reasonTaken
		} else {
			result.Available = true
		}
	}

	return result
}

func CreateProject(owner Owner, raw string) (*Project, error) {
	if err := ready(); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(raw)
	if err := validateProject(name); err != nil {
		return nil, err
	}

	if _, err := store.CreateGitProject(db.DB, owner.ID, name); err != nil {
		if strings.Contains(err.Error(), uniqueFailure) {
			return nil, ErrNameTaken
		}
		return nil, err
	}

	project, err := store.GitProjectByName(db.DB, name)
	if err != nil {
		return nil, err
	}

	dir := filepath.Join(reposDir, project.Name)
	if _, err := os.Lstat(dir); err == nil {
		if err := archive(dir); err != nil {
			store.DeleteGitProject(db.DB, project.ID)
			return nil, err
		}
	}
	if err := os.Mkdir(dir, dirMode); err != nil {
		store.DeleteGitProject(db.DB, project.ID)
		return nil, err
	}

	return &Project{Name: project.Name, CreatedAt: project.CreatedAt, Repos: []Repo{}}, nil
}

func Projects(owner Owner) ([]Project, error) {
	projects, err := store.GitProjectsByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}
	repos, err := store.GitReposByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}

	out := make([]Project, 0, len(projects))
	for _, p := range projects {
		view := Project{Name: p.Name, CreatedAt: p.CreatedAt, Repos: []Repo{}}
		for _, r := range repos {
			if r.ProjectID == p.ID {
				view.Repos = append(view.Repos, repoView(&r))
			}
		}
		out = append(out, view)
	}

	return out, nil
}

func DeleteProject(owner Owner, name string) error {
	project, err := ownProject(owner, name)
	if err != nil {
		return err
	}

	if err := store.DeleteGitProject(db.DB, project.ID); err != nil {
		return err
	}

	return archive(filepath.Join(reposDir, project.Name))
}

func CreateRepo(owner Owner, projectName, raw, description string, private bool) (*Repo, error) {
	if err := ready(); err != nil {
		return nil, err
	}

	project, err := ownProject(owner, projectName)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSuffix(strings.TrimSpace(raw), RepoSuffix)
	if err := validateRepo(name); err != nil {
		return nil, err
	}
	description = strings.TrimSpace(description)
	if !validDescription(description) {
		return nil, ErrInvalidInput
	}

	id, err := store.CreateGitRepo(db.DB, project.ID, name, description, private)
	if err != nil {
		if strings.Contains(err.Error(), uniqueFailure) {
			return nil, ErrExists
		}
		return nil, err
	}

	repo, err := store.GitRepoByPath(db.DB, project.Name, name)
	if err != nil {
		return nil, err
	}

	dir := repoDir(repo)
	if _, err := os.Lstat(dir); err == nil {
		if err := archive(dir); err != nil {
			store.DeleteGitRepo(db.DB, id)
			return nil, err
		}
	}
	if err := initBare(dir, description); err != nil {
		store.DeleteGitRepo(db.DB, id)
		os.RemoveAll(dir)
		return nil, err
	}

	view := repoView(repo)
	return &view, nil
}

func UpdateRepo(owner Owner, project, name string, in RepoUpdate) (*Repo, error) {
	repo, err := ownRepo(owner, project, name)
	if err != nil {
		return nil, err
	}
	if in.Private == nil && in.Description == nil {
		return nil, ErrInvalidInput
	}

	if in.Private != nil {
		repo.Private = *in.Private
	}
	if in.Description != nil {
		description := strings.TrimSpace(*in.Description)
		if !validDescription(description) {
			return nil, ErrInvalidInput
		}
		repo.Description = description
		os.WriteFile(filepath.Join(repoDir(repo), "description"), []byte(description+"\n"), 0o644)
	}

	if err := store.UpdateGitRepo(db.DB, repo.ID, repo.Description, repo.Private); err != nil {
		return nil, err
	}

	view := repoView(repo)
	return &view, nil
}

func DeleteRepo(owner Owner, project, name string) error {
	repo, err := ownRepo(owner, project, name)
	if err != nil {
		return err
	}

	if err := store.DeleteGitRepo(db.DB, repo.ID); err != nil {
		return err
	}

	return archive(repoDir(repo))
}

func RepoDetail(viewer Owner, project, name string) (*Detail, error) {
	repo, err := readable(viewer, project, name)
	if err != nil {
		return nil, err
	}
	owned := repo.OwnerID == viewer.ID

	dir := repoDir(repo)
	detail := &Detail{Repo: repoView(repo), Owned: owned, Branches: []Ref{}, Tags: []Ref{}, Commits: []Commit{}}

	if head, err := run(dir, "symbolic-ref", "--short", "HEAD"); err == nil {
		detail.DefaultBranch = strings.TrimSpace(head)
	}

	refs, err := run(dir, "for-each-ref", "--format=%(refname)%00%(objectname)%00%(creatordate:iso-strict)", "refs/heads", "refs/tags")
	if err != nil {
		return nil, err
	}
	for _, line := range lines(refs) {
		parts := strings.Split(line, fieldSeparator)
		if len(parts) != 3 {
			continue
		}
		if branch, ok := strings.CutPrefix(parts[0], "refs/heads/"); ok {
			detail.Branches = append(detail.Branches, Ref{Name: branch, Commit: parts[1], Updated: parts[2]})
		} else if tag, ok := strings.CutPrefix(parts[0], "refs/tags/"); ok {
			detail.Tags = append(detail.Tags, Ref{Name: tag, Commit: parts[1], Updated: parts[2]})
		}
	}

	detail.Empty = len(detail.Branches) == 0
	if detail.Empty {
		return detail, nil
	}

	branch := detail.DefaultBranch
	if !slices.ContainsFunc(detail.Branches, func(r Ref) bool { return r.Name == branch }) {
		branch = detail.Branches[0].Name
	}

	log, err := run(dir, "log", "-n", fmt.Sprint(commitLimit), "--format=%H%x00%an%x00%aI%x00%s", "refs/heads/"+branch, "--")
	if err != nil {
		return nil, err
	}
	for _, line := range lines(log) {
		parts := strings.SplitN(line, fieldSeparator, 4)
		if len(parts) == 4 {
			detail.Commits = append(detail.Commits, Commit{Hash: parts[0], Author: parts[1], Date: parts[2], Subject: parts[3]})
		}
	}

	return detail, nil
}

func Tokens(owner Owner) ([]Token, error) {
	return store.GitTokensByOwner(db.DB, owner.ID)
}

func CreateToken(owner Owner, raw string) (*NewToken, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxTokenName {
		return nil, ErrInvalidInput
	}

	existing, err := store.GitTokensByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}
	if len(existing) >= maxTokens {
		return nil, ErrTooManyTokens
	}

	secretBytes := make([]byte, tokenBytes)
	rand.Read(secretBytes)
	secret := tokenPrefix + base64.RawURLEncoding.EncodeToString(secretBytes)

	token, err := store.CreateGitToken(db.DB, owner.ID, name, hashToken(secret), secret[:prefixLength])
	if err != nil {
		return nil, err
	}

	return &NewToken{Token: *token, Secret: secret}, nil
}

func DeleteToken(owner Owner, id int64) error {
	err := store.DeleteGitToken(db.DB, owner.ID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrTokenNotFound
	}

	return err
}

func ArchiveUser(userID int64) error {
	if reposDir == "" {
		return ErrUnavailable
	}

	projects, err := store.GitProjectsByOwner(db.DB, userID)
	if err != nil {
		return err
	}

	var failures []error
	for _, p := range projects {
		if err := archive(filepath.Join(reposDir, p.Name)); err != nil {
			failures = append(failures, err)
		}
	}

	return errors.Join(failures...)
}

func validateProject(name string) error {
	if err := validateName(name); err != nil {
		return err
	}
	if slices.Contains(reservedProjects, strings.ToLower(name)) {
		return ErrReserved
	}

	return nil
}

func validateRepo(name string) error {
	return validateName(name)
}

func validateName(name string) error {
	if !namePattern.MatchString(name) || strings.HasSuffix(strings.ToLower(name), RepoSuffix) || strings.Contains(name, deletedInfix) || strings.Contains(name, "..") {
		return ErrInvalidName
	}

	return nil
}

func validDescription(description string) bool {
	return utf8.ValidString(description) && utf8.RuneCountInString(description) <= maxDescription && !strings.ContainsAny(description, "\x00\n\r")
}

func ownProject(owner Owner, name string) (*store.GitProject, error) {
	project, err := store.GitProjectByName(db.DB, strings.TrimSpace(name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if project.OwnerID != owner.ID {
		return nil, ErrProjectNotOwn
	}

	return project, nil
}

func ownRepo(owner Owner, project, name string) (*store.GitRepo, error) {
	repo, err := store.GitRepoByPath(db.DB, strings.TrimSpace(project), strings.TrimSuffix(strings.TrimSpace(name), RepoSuffix))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if repo.OwnerID != owner.ID {
		return nil, ErrNotFound
	}

	return repo, nil
}

func repoView(r *store.GitRepo) Repo {
	return Repo{
		Project:     r.Project,
		Name:        r.Name,
		Description: r.Description,
		Private:     r.Private,
		CreatedAt:   r.CreatedAt,
		ClonePath:   "/" + r.Project + "/" + r.Name + RepoSuffix,
	}
}

func repoDir(r *store.GitRepo) string {
	return filepath.Join(reposDir, r.Project, r.Name+RepoSuffix)
}

func initBare(dir, description string) error {
	if _, err := command(context.Background(), "", "init", "--bare", "--quiet", "--template=", "--initial-branch="+defaultBranch, dir).CombinedOutput(); err != nil {
		return err
	}

	if description != "" {
		return os.WriteFile(filepath.Join(dir, "description"), []byte(description+"\n"), 0o644)
	}

	return nil
}

func run(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), commandWait)
	defer cancel()

	var out bytes.Buffer
	cmd := command(ctx, dir, args...)
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", err
	}

	return out.String(), nil
}

func command(ctx context.Context, dir string, args ...string) *exec.Cmd {
	if dir != "" {
		args = append([]string{"--git-dir=" + dir}, args...)
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = gitEnv()
	return cmd
}

func gitEnv() []string {
	return []string{
		"PATH=" + os.Getenv("PATH"),
		"HOME=" + reposDir,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_TERMINAL_PROMPT=0",
		"GIT_CONFIG_COUNT=3",
		"GIT_CONFIG_KEY_0=core.hooksPath",
		"GIT_CONFIG_VALUE_0=/dev/null",
		"GIT_CONFIG_KEY_1=receive.fsckObjects",
		"GIT_CONFIG_VALUE_1=true",
		"GIT_CONFIG_KEY_2=uploadpack.allowFilter",
		"GIT_CONFIG_VALUE_2=true",
	}
}

func lines(out string) []string {
	var result []string
	for _, line := range strings.Split(out, "\n") {
		if line != "" {
			result = append(result, line)
		}
	}

	return result
}

func archive(dir string) error {
	if _, err := os.Lstat(dir); errors.Is(err, os.ErrNotExist) {
		return nil
	}

	target := dir + deletedInfix + time.Now().UTC().Format(deletedLayout)
	candidate := target
	for i := 2; ; i++ {
		if _, err := os.Lstat(candidate); errors.Is(err, os.ErrNotExist) {
			break
		}
		candidate = fmt.Sprintf("%s-%d", target, i)
	}

	return os.Rename(dir, candidate)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func ready() error {
	if reposDir == "" {
		return ErrUnavailable
	}
	if !gitReady {
		return fmt.Errorf("%w: %w", ErrUnavailable, errGitUnavailable)
	}

	return nil
}
