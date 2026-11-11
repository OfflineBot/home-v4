package git

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"mime"
	"net/http"
	"os/exec"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
)

type CommitRef struct {
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Author  string `json:"author"`
	Date    string `json:"date"`
}

type TreeEntry struct {
	Name       string     `json:"name"`
	Path       string     `json:"path"`
	Type       string     `json:"type"`
	Mode       string     `json:"mode"`
	Size       *int64     `json:"size"`
	LastCommit *CommitRef `json:"last_commit,omitempty"`
}

type Tree struct {
	Ref     string      `json:"ref"`
	Commit  string      `json:"commit"`
	Path    string      `json:"path"`
	Entries []TreeEntry `json:"entries"`
}

type CommitInfo struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Email   string   `json:"email"`
	Date    string   `json:"date"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

type CommitPage struct {
	Ref      string       `json:"ref"`
	Commits  []CommitInfo `json:"commits"`
	NextPage *int         `json:"next_page"`
}

type FileChange struct {
	Path      string `json:"path"`
	OldPath   string `json:"old_path,omitempty"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Binary    bool   `json:"binary"`
	Patch     string `json:"patch"`
	Truncated bool   `json:"truncated"`
}

type CommitDetail struct {
	CommitInfo
	Additions      int          `json:"additions"`
	Deletions      int          `json:"deletions"`
	Files          []FileChange `json:"files"`
	FilesTruncated bool         `json:"files_truncated"`
}

type Branch struct {
	Name    string `json:"name"`
	Commit  string `json:"commit"`
	Updated string `json:"updated"`
	Subject string `json:"subject"`
	Default bool   `json:"default"`
	Ahead   *int   `json:"ahead"`
	Behind  *int   `json:"behind"`
}

type Branches struct {
	DefaultBranch string   `json:"default_branch"`
	Branches      []Branch `json:"branches"`
}

type Blob struct {
	Name     string
	Hash     string
	Size     int64
	MimeType string
	Body     io.ReadCloser
}

const (
	recordSeparator = "\x01"
	unitSeparator   = "\x02"
	nul             = "\x00"
	typeTree        = "tree"
	typeBlob        = "blob"
	DefaultPerPage  = 30
	maxPerPage      = 100
	lastCommitScan  = 2000
	maxFiles        = 1000
	maxFilePatch    = 64 * 1024
	maxTotalPatch   = 2 * 1024 * 1024
	maxAheadBehind  = 100
	maxRepoPath     = 4096
	sniffBytes      = 512
	plainText       = "text/plain; charset=utf-8"
	binaryType      = "application/octet-stream"
	commitFormat    = "%H" + unitSeparator + "%P" + unitSeparator + "%an" + unitSeparator + "%ae" + unitSeparator + "%aI" + unitSeparator + "%s" + unitSeparator + "%b"
)

var (
	refPattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/@-]{0,199}$`)
	hashPattern = regexp.MustCompile(`^[0-9a-fA-F]{4,64}$`)
	passthrough = []string{"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif", "application/pdf", "audio/mpeg", "audio/ogg", "audio/wav", "video/mp4", "video/webm"}
	statusNames = map[byte]string{'A': "added", 'M': "modified", 'D': "deleted", 'R': "renamed", 'C': "copied", 'T': "type_changed"}
)

var (
	ErrRefNotFound = errors.New("ref not found")
	ErrNotATree    = errors.New("path is not a folder")
	ErrNotABlob    = errors.New("path is not a file")
)

func ReadTree(viewer Owner, project, name, ref, rawPath string) (*Tree, error) {
	dir, refName, commit, err := locate(viewer, project, name, ref)
	if err != nil {
		return nil, err
	}
	rel, err := repoPath(rawPath)
	if err != nil {
		return nil, err
	}

	if rel != "" {
		kind, err := objectType(dir, commit+":"+rel)
		if err != nil {
			return nil, ErrNotFound
		}
		if kind != typeTree {
			return nil, ErrNotATree
		}
	}

	out, err := run(dir, "ls-tree", "-z", "--long", "--end-of-options", commit+":"+rel)
	if err != nil {
		return nil, err
	}

	entries := []TreeEntry{}
	for _, record := range strings.Split(out, nul) {
		meta, entryName, ok := strings.Cut(record, "\t")
		if !ok {
			continue
		}
		fields := strings.Fields(meta)
		if len(fields) != 4 {
			continue
		}
		entry := TreeEntry{Name: entryName, Path: path.Join(rel, entryName), Type: fields[1], Mode: fields[0]}
		if size, err := strconv.ParseInt(fields[3], 10, 64); err == nil {
			entry.Size = &size
		}
		entries = append(entries, entry)
	}
	slices.SortFunc(entries, func(a, b TreeEntry) int {
		if (a.Type == typeTree) != (b.Type == typeTree) {
			if a.Type == typeTree {
				return -1
			}
			return 1
		}
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	attachLastCommits(dir, commit, rel, entries)

	return &Tree{Ref: refName, Commit: commit, Path: rel, Entries: entries}, nil
}

func ReadBlob(viewer Owner, project, name, ref, rawPath string) (*Blob, error) {
	dir, _, commit, err := locate(viewer, project, name, ref)
	if err != nil {
		return nil, err
	}
	rel, err := repoPath(rawPath)
	if err != nil {
		return nil, err
	}
	if rel == "" {
		return nil, ErrNotABlob
	}

	object := commit + ":" + rel
	kind, err := objectType(dir, object)
	if err != nil {
		return nil, ErrNotFound
	}
	if kind != typeBlob {
		return nil, ErrNotABlob
	}

	hash, err := run(dir, "rev-parse", "--verify", "--end-of-options", object)
	if err != nil {
		return nil, ErrNotFound
	}
	sizeOut, err := run(dir, "cat-file", "-s", strings.TrimSpace(hash))
	if err != nil {
		return nil, err
	}
	size, err := strconv.ParseInt(strings.TrimSpace(sizeOut), 10, 64)
	if err != nil {
		return nil, err
	}

	cmd := command(context.Background(), dir, "cat-file", "blob", strings.TrimSpace(hash))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	reader := bufio.NewReaderSize(stdout, sniffBytes)
	head, _ := reader.Peek(sniffBytes)

	return &Blob{
		Name:     path.Base(rel),
		Hash:     strings.TrimSpace(hash),
		Size:     size,
		MimeType: blobType(rel, head),
		Body:     &processReader{Reader: reader, cmd: cmd},
	}, nil
}

func ListCommits(viewer Owner, project, name, ref, rawPath string, page, perPage int) (*CommitPage, error) {
	dir, refName, commit, err := locate(viewer, project, name, ref)
	if err != nil {
		return nil, err
	}
	rel, err := repoPath(rawPath)
	if err != nil {
		return nil, err
	}
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > maxPerPage {
		perPage = DefaultPerPage
	}

	args := []string{"log", "--format=" + recordSeparator + commitFormat, "--skip=" + strconv.Itoa((page-1)*perPage), "--max-count=" + strconv.Itoa(perPage+1), "--end-of-options", commit, "--"}
	if rel != "" {
		args = append(args, rel)
	}
	out, err := run(dir, args...)
	if err != nil {
		return nil, err
	}

	commits := parseCommits(out)
	result := &CommitPage{Ref: refName, Commits: commits}
	if len(commits) > perPage {
		result.Commits = commits[:perPage]
		next := page + 1
		result.NextPage = &next
	}

	return result, nil
}

func ReadCommit(viewer Owner, project, name, hash string) (*CommitDetail, error) {
	if !hashPattern.MatchString(hash) {
		return nil, ErrRefNotFound
	}
	dir, _, commit, err := locate(viewer, project, name, hash)
	if err != nil {
		return nil, err
	}

	out, err := run(dir, "show", "-s", "--format="+recordSeparator+commitFormat, commit)
	if err != nil {
		return nil, err
	}
	infos := parseCommits(out)
	if len(infos) != 1 {
		return nil, ErrRefNotFound
	}
	detail := &CommitDetail{CommitInfo: infos[0], Files: []FileChange{}}

	trees := []string{"--root", commit}
	if len(detail.Parents) > 0 {
		trees = []string{detail.Parents[0], commit}
	}
	diffArgs := func(extra ...string) []string {
		return append(append([]string{"diff-tree", "-r", "-M", "--no-commit-id", "--no-color", "--no-ext-diff"}, extra...), trees...)
	}

	statusOut, err := run(dir, diffArgs("-z", "--name-status")...)
	if err != nil {
		return nil, err
	}
	numstatOut, err := run(dir, diffArgs("-z", "--numstat")...)
	if err != nil {
		return nil, err
	}

	detail.Files = parseStatus(statusOut)
	applyNumstat(detail.Files, numstatOut)
	if len(detail.Files) > maxFiles {
		detail.Files = detail.Files[:maxFiles]
		detail.FilesTruncated = true
	}
	for _, f := range detail.Files {
		detail.Additions += f.Additions
		detail.Deletions += f.Deletions
	}

	if err := attachPatches(dir, diffArgs("-p"), detail.Files); err != nil {
		return nil, err
	}

	return detail, nil
}

func ListBranches(viewer Owner, project, name string) (*Branches, error) {
	repo, err := readable(viewer, project, name)
	if err != nil {
		return nil, err
	}
	dir := repoDir(repo)

	result := &Branches{Branches: []Branch{}}
	if head, err := run(dir, "symbolic-ref", "--short", "HEAD"); err == nil {
		result.DefaultBranch = strings.TrimSpace(head)
	}

	out, err := run(dir, "for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(contents:subject)", "refs/heads")
	if err != nil {
		return nil, err
	}

	for _, line := range lines(out) {
		parts := strings.SplitN(line, nul, 4)
		if len(parts) != 4 {
			continue
		}
		branch := Branch{Name: parts[0], Commit: parts[1], Updated: parts[2], Subject: parts[3], Default: parts[0] == result.DefaultBranch}
		if !branch.Default && result.DefaultBranch != "" && len(result.Branches) < maxAheadBehind {
			counts, err := run(dir, "rev-list", "--left-right", "--count", "refs/heads/"+result.DefaultBranch+"...refs/heads/"+branch.Name)
			if fields := strings.Fields(counts); err == nil && len(fields) == 2 {
				behind, _ := strconv.Atoi(fields[0])
				ahead, _ := strconv.Atoi(fields[1])
				branch.Ahead, branch.Behind = &ahead, &behind
			}
		}
		result.Branches = append(result.Branches, branch)
	}

	return result, nil
}

func readable(viewer Owner, project, name string) (*store.GitRepo, error) {
	if err := ready(); err != nil {
		return nil, err
	}

	repo, err := store.GitRepoByPath(db.DB, strings.TrimSpace(project), strings.TrimSuffix(strings.TrimSpace(name), RepoSuffix))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if repo.Private && repo.OwnerID != viewer.ID {
		return nil, ErrNotFound
	}

	return repo, nil
}

func locate(viewer Owner, project, name, ref string) (string, string, string, error) {
	repo, err := readable(viewer, project, name)
	if err != nil {
		return "", "", "", err
	}
	dir := repoDir(repo)

	if ref == "" {
		head, err := run(dir, "symbolic-ref", "--short", "HEAD")
		if err != nil {
			return "", "", "", ErrRefNotFound
		}
		ref = strings.TrimSpace(head)
	}
	if !refPattern.MatchString(ref) || strings.Contains(ref, "..") {
		return "", "", "", ErrRefNotFound
	}

	commit, err := run(dir, "rev-parse", "--verify", "--quiet", "--end-of-options", ref+"^{commit}")
	if err != nil {
		return "", "", "", ErrRefNotFound
	}

	return dir, ref, strings.TrimSpace(commit), nil
}

func repoPath(raw string) (string, error) {
	if len(raw) > maxRepoPath || !utf8.ValidString(raw) || strings.ContainsAny(raw, "\x00\n\r") {
		return "", ErrInvalidInput
	}

	rel := strings.TrimPrefix(path.Clean("/"+raw), "/")
	return rel, nil
}

func objectType(dir, object string) (string, error) {
	out, err := run(dir, "cat-file", "-t", "--end-of-options", object)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(out), nil
}

func attachLastCommits(dir, commit, rel string, entries []TreeEntry) {
	if len(entries) == 0 {
		return
	}

	index := make(map[string]int, len(entries))
	for i, e := range entries {
		index[e.Name] = i
	}
	remaining := len(entries)

	ctx, cancel := context.WithTimeout(context.Background(), commandWait)
	defer cancel()

	args := []string{"log", "-z", "--name-only", "--max-count=" + strconv.Itoa(lastCommitScan),
		"--format=" + recordSeparator + "%H" + unitSeparator + "%an" + unitSeparator + "%aI" + unitSeparator + "%s", "--end-of-options", commit, "--"}
	prefix := ""
	if rel != "" {
		prefix = rel + "/"
		args = append(args, rel)
	}

	cmd := command(ctx, dir, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	if err := cmd.Start(); err != nil {
		return
	}
	defer func() {
		cancel()
		cmd.Wait()
	}()

	reader := bufio.NewReader(stdout)
	for remaining > 0 {
		chunk, err := reader.ReadString(recordSeparator[0])
		chunk = strings.TrimSuffix(chunk, recordSeparator)
		if header, names, ok := strings.Cut(chunk, nul); ok {
			fields := strings.SplitN(header, unitSeparator, 4)
			if len(fields) == 4 {
				ref := CommitRef{Hash: fields[0], Author: fields[1], Date: fields[2], Subject: fields[3]}
				for _, changed := range strings.Split(strings.TrimPrefix(names, "\n"), nul) {
					child, _, _ := strings.Cut(strings.TrimPrefix(changed, prefix), "/")
					if i, ok := index[child]; ok && entries[i].LastCommit == nil && strings.HasPrefix(changed, prefix) {
						entry := ref
						entries[i].LastCommit = &entry
						remaining--
					}
				}
			}
		}
		if err != nil {
			return
		}
	}
}

func parseCommits(out string) []CommitInfo {
	commits := []CommitInfo{}
	for _, record := range strings.Split(out, recordSeparator) {
		if record == "" {
			continue
		}
		fields := strings.SplitN(record, unitSeparator, 7)
		if len(fields) != 7 {
			continue
		}
		parents := strings.Fields(fields[1])
		if parents == nil {
			parents = []string{}
		}
		commits = append(commits, CommitInfo{
			Hash:    fields[0],
			Parents: parents,
			Author:  fields[2],
			Email:   fields[3],
			Date:    fields[4],
			Subject: fields[5],
			Body:    strings.TrimSpace(fields[6]),
		})
	}

	return commits
}

func parseStatus(out string) []FileChange {
	parts := strings.Split(strings.TrimSuffix(out, nul), nul)
	files := []FileChange{}

	for i := 0; i < len(parts); i++ {
		code := parts[i]
		if code == "" {
			continue
		}
		status, ok := statusNames[code[0]]
		if !ok {
			status = "modified"
		}
		change := FileChange{Status: status}
		if code[0] == 'R' || code[0] == 'C' {
			if i+2 >= len(parts) {
				break
			}
			change.OldPath, change.Path = parts[i+1], parts[i+2]
			i += 2
		} else {
			if i+1 >= len(parts) {
				break
			}
			change.Path = parts[i+1]
			i++
		}
		files = append(files, change)
	}

	return files
}

func applyNumstat(files []FileChange, out string) {
	parts := strings.Split(strings.TrimSuffix(out, nul), nul)
	position := 0

	for i := 0; i < len(parts) && position < len(files); i++ {
		fields := strings.SplitN(parts[i], "\t", 3)
		if len(fields) != 3 {
			continue
		}
		if fields[2] == "" {
			i += 2
		}

		file := &files[position]
		if fields[0] == "-" && fields[1] == "-" {
			file.Binary = true
		} else {
			file.Additions, _ = strconv.Atoi(fields[0])
			file.Deletions, _ = strconv.Atoi(fields[1])
		}
		position++
	}
}

func attachPatches(dir string, args []string, files []FileChange) error {
	ctx, cancel := context.WithTimeout(context.Background(), commandWait)
	defer cancel()

	cmd := command(ctx, dir, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	defer func() {
		cancel()
		cmd.Wait()
	}()

	reader := bufio.NewReader(stdout)
	current := -1
	inHunks := false
	total := 0
	var patch bytes.Buffer

	flush := func() {
		if current >= 0 && current < len(files) {
			files[current].Patch = patch.String()
		}
		patch.Reset()
	}

	for {
		line, err := reader.ReadString('\n')
		if strings.HasPrefix(line, "diff --git ") {
			flush()
			current++
			inHunks = false
			if current >= len(files) {
				return nil
			}
		} else if current >= 0 && current < len(files) {
			file := &files[current]
			switch {
			case strings.HasPrefix(line, "Binary files ") || strings.HasPrefix(line, "GIT binary patch"):
				file.Binary = true
			case strings.HasPrefix(line, "@@"):
				inHunks = true
			}
			if inHunks && !file.Binary && !file.Truncated {
				if patch.Len()+len(line) > maxFilePatch || total+len(line) > maxTotalPatch {
					file.Truncated = true
				} else {
					patch.WriteString(line)
					total += len(line)
				}
			}
		}

		if err != nil {
			flush()
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

func blobType(rel string, head []byte) string {
	byExtension := mime.TypeByExtension(strings.ToLower(path.Ext(rel)))
	if media, _, err := mime.ParseMediaType(byExtension); err == nil && slices.Contains(passthrough, media) {
		return media
	}

	sniffed, _, _ := mime.ParseMediaType(http.DetectContentType(head))
	if slices.Contains(passthrough, sniffed) && sniffed != "image/svg+xml" {
		return sniffed
	}
	if strings.HasPrefix(sniffed, "text/") || utf8.Valid(head) && !bytes.Contains(head, []byte{0}) {
		return plainText
	}

	return binaryType
}

type processReader struct {
	io.Reader
	cmd *exec.Cmd
}

func (p *processReader) Close() error {
	p.cmd.Process.Kill()
	p.cmd.Wait()
	return nil
}
