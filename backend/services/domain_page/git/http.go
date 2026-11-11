package git

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
)

const Challenge = `Basic realm="home-v4 git", charset="UTF-8"`

const (
	uploadPack   = "git-upload-pack"
	receivePack  = "git-receive-pack"
	infoRefs     = "/info/refs"
	basicScheme  = "basic "
	maxStderr    = 4096
	statusHeader = "Status"
)

var (
	ErrChallenge   = errors.New("git authentication required")
	ErrForbidden   = errors.New("git push not allowed")
	ErrUnsupported = errors.New("unsupported git request")
)

type Request struct {
	Project         string
	Repo            string
	Rest            string
	Method          string
	Query           string
	Authorization   string
	ContentType     string
	ContentEncoding string
	Protocol        string
	RemoteAddr      string
	ContentLength   int64
	Body            io.Reader
}

type Response struct {
	Status int
	Header textproto.MIMEHeader
	Body   io.Reader

	cmd      *exec.Cmd
	copyDone chan error
	stderr   *limitedBuffer
	once     sync.Once
	err      error
}

type limitedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if room := maxStderr - b.buf.Len(); room > 0 {
		b.buf.Write(p[:min(len(p), room)])
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

func Serve(req Request) (*Response, error) {
	if err := ready(); err != nil {
		return nil, err
	}

	write, err := classify(req.Method, req.Rest, req.Query)
	if err != nil {
		return nil, err
	}

	user, authErr := authenticate(req.Authorization)

	repo, err := store.GitRepoByPath(db.DB, req.Project, req.Repo)
	if errors.Is(err, sql.ErrNoRows) {
		if user == nil {
			return nil, ErrChallenge
		}
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if authErr != nil {
		return nil, ErrChallenge
	}

	owner := user != nil && user.OwnerID == repo.OwnerID && repo.Approved
	switch {
	case write && user == nil:
		return nil, ErrChallenge
	case write && !owner:
		return nil, ErrForbidden
	case repo.Private && user == nil:
		return nil, ErrChallenge
	case repo.Private && !owner:
		return nil, ErrNotFound
	}

	if info, err := os.Stat(repoDir(repo)); err != nil || !info.IsDir() {
		return nil, ErrNotFound
	}

	remoteUser := ""
	if owner {
		remoteUser = user.OwnerName
		touch(user)
	}

	return start(repo, req, remoteUser)
}

func (r *Response) Finish(abort bool) error {
	r.once.Do(func() {
		if abort {
			r.cmd.Process.Kill()
		}
		copyErr := <-r.copyDone
		waitErr := r.cmd.Wait()
		if waitErr != nil && !abort {
			slog.Warn("git: http-backend failed", "err", waitErr, "stderr", r.stderr.String())
		}
		r.err = errors.Join(copyErr, waitErr)
	})

	return r.err
}

func classify(method, rest, query string) (bool, error) {
	switch {
	case method == http.MethodGet && rest == infoRefs:
		values, err := url.ParseQuery(query)
		if err != nil {
			return false, ErrUnsupported
		}
		switch values.Get("service") {
		case uploadPack:
			return false, nil
		case receivePack:
			return true, nil
		}
	case method == http.MethodPost && rest == "/"+uploadPack:
		return false, nil
	case method == http.MethodPost && rest == "/"+receivePack:
		return true, nil
	}

	return false, ErrUnsupported
}

func authenticate(header string) (*store.GitTokenOwner, error) {
	if header == "" {
		return nil, nil
	}
	if len(header) < len(basicScheme) || !strings.EqualFold(header[:len(basicScheme)], basicScheme) {
		return nil, ErrChallenge
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(header[len(basicScheme):]))
	if err != nil {
		return nil, ErrChallenge
	}
	_, secret, ok := strings.Cut(string(decoded), ":")
	if !ok || !strings.HasPrefix(secret, tokenPrefix) {
		return nil, ErrChallenge
	}

	owner, err := store.GitTokenOwnerByHash(db.DB, hashToken(secret))
	if err != nil || !owner.Approved {
		return nil, ErrChallenge
	}

	return owner, nil
}

func touch(owner *store.GitTokenOwner) {
	now := time.Now().UTC()
	if owner.LastUsedAt != nil {
		if last, err := time.Parse(time.RFC3339, *owner.LastUsedAt); err == nil && now.Sub(last) < touchEvery {
			return
		}
	}

	store.TouchGitToken(db.DB, owner.TokenID, now.Format(time.RFC3339))
}

func start(repo *store.GitRepo, req Request, remoteUser string) (*Response, error) {
	cmd := command(context.Background(), "", "http-backend")
	cmd.Env = append(cmd.Env,
		"GIT_PROJECT_ROOT="+reposDir,
		"GIT_HTTP_EXPORT_ALL=1",
		"PATH_INFO=/"+repo.Project+"/"+repo.Name+RepoSuffix+req.Rest,
		"REQUEST_METHOD="+req.Method,
		"QUERY_STRING="+req.Query,
		"CONTENT_TYPE="+req.ContentType,
		"REMOTE_ADDR="+req.RemoteAddr,
	)
	if req.Method == http.MethodPost && req.ContentLength >= 0 {
		cmd.Env = append(cmd.Env, "CONTENT_LENGTH="+strconv.FormatInt(req.ContentLength, 10))
	}
	if req.ContentEncoding != "" {
		cmd.Env = append(cmd.Env, "HTTP_CONTENT_ENCODING="+req.ContentEncoding)
	}
	if req.Protocol != "" {
		cmd.Env = append(cmd.Env, "GIT_PROTOCOL="+req.Protocol)
	}
	if remoteUser != "" {
		cmd.Env = append(cmd.Env, "REMOTE_USER="+remoteUser)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr := &limitedBuffer{}
	cmd.Stderr = stderr

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	copyDone := make(chan error, 1)
	go func() {
		var err error
		if req.Body != nil {
			_, err = io.Copy(stdin, req.Body)
		}
		stdin.Close()
		copyDone <- err
	}()

	resp := &Response{cmd: cmd, copyDone: copyDone, stderr: stderr, Status: http.StatusOK}

	reader := bufio.NewReader(stdout)
	header, err := textproto.NewReader(reader).ReadMIMEHeader()
	if err != nil {
		resp.Finish(true)
		return nil, err
	}

	if status := header.Get(statusHeader); status != "" {
		code, _, _ := strings.Cut(status, " ")
		if n, err := strconv.Atoi(code); err == nil {
			resp.Status = n
		}
	}
	header.Del(statusHeader)

	resp.Header = header
	resp.Body = reader
	return resp, nil
}
