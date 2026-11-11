package git

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"io"
	"strconv"
	"strings"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
)

type File struct {
	Hash string
	Size int64
	Body io.ReadCloser
}

const missingObject = " missing"

func OwnedRepoID(owner Owner, project, name string) (int64, error) {
	repo, err := ownRepo(owner, project, name)
	if err != nil {
		return 0, err
	}

	return repo.ID, nil
}

func ValidRef(ref string) bool {
	return ref == "" || refPattern.MatchString(ref) && !strings.Contains(ref, "..")
}

func OpenFile(repoID int64, ref, rel string) (*File, error) {
	if err := ready(); err != nil {
		return nil, err
	}

	repo, err := store.GitRepoByID(db.DB, repoID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if !repo.Approved {
		return nil, ErrNotFound
	}
	dir := repoDir(repo)

	if ref == "" {
		head, err := run(dir, "symbolic-ref", "--short", "HEAD")
		if err != nil {
			return nil, ErrRefNotFound
		}
		ref = strings.TrimSpace(head)
	}
	if !ValidRef(ref) {
		return nil, ErrRefNotFound
	}
	commit, err := run(dir, "rev-parse", "--verify", "--quiet", "--end-of-options", ref+"^{commit}")
	if err != nil {
		return nil, ErrRefNotFound
	}

	cmd := command(context.Background(), dir, "cat-file", "--batch")
	cmd.Stdin = strings.NewReader(strings.TrimSpace(commit) + ":" + rel + "\n")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	body := &processReader{cmd: cmd}

	reader := bufio.NewReader(stdout)
	header, err := reader.ReadString('\n')
	if err != nil {
		body.Close()
		return nil, ErrNotFound
	}
	header = strings.TrimSuffix(header, "\n")
	if strings.HasSuffix(header, missingObject) {
		body.Close()
		return nil, ErrNotFound
	}

	fields := strings.Fields(header)
	if len(fields) != 3 {
		body.Close()
		return nil, ErrNotFound
	}
	if fields[1] != typeBlob {
		body.Close()
		return nil, ErrNotABlob
	}
	size, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil {
		body.Close()
		return nil, ErrNotFound
	}

	body.Reader = io.LimitReader(reader, size)
	return &File{Hash: fields[0], Size: size, Body: body}, nil
}
