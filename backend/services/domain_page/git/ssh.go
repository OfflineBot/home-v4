package git

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"database/sql"
	"encoding/pem"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"

	"golang.org/x/crypto/ssh"
)

const (
	sshAddrEnv     = "GIT_SSH_ADDR"
	sshDefaultAddr = ":2222"
	hostKeyFile    = "ssh_host_ed25519_key"
	hostKeyMode    = 0o600
	sshAuthTimeout = 20 * time.Second
	sshMaxCommand  = 4096
	maxSSHKeys     = 20
	maxSSHKeyName  = 60
)

var (
	ErrSSHDisabled = errors.New("ssh transport is not running")

	sshOnce     sync.Once
	sshListener net.Listener
)

// StartSSH serves git over ssh next to the http transport. Public keys identify
// the user, so the login name on the client side is ignored like it is on http.
func StartSSH() error {
	if err := ready(); err != nil {
		return err
	}

	signer, err := hostKey()
	if err != nil {
		return err
	}

	config := &ssh.ServerConfig{
		PublicKeyCallback: authorize,
		AuthLogCallback:   nil,
	}
	config.AddHostKey(signer)

	addr := os.Getenv(sshAddrEnv)
	if addr == "" {
		addr = sshDefaultAddr
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	sshListener = listener

	go accept(listener, config)
	return nil
}

func accept(listener net.Listener, config *ssh.ServerConfig) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		go serveConn(conn, config)
	}
}

// the host key has to survive restarts, otherwise every client reports a
// changed host identity and refuses to connect
func hostKey() (ssh.Signer, error) {
	path := filepath.Join(filepath.Dir(reposDir), hostKeyFile)

	if raw, err := os.ReadFile(path); err == nil {
		return ssh.ParsePrivateKey(raw)
	}

	_, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	block, err := ssh.MarshalPrivateKey(private, "")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, pem.EncodeToMemory(block), hostKeyMode); err != nil {
		return nil, err
	}

	return ssh.NewSignerFromKey(private)
}

func authorize(meta ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
	owner, err := store.GitSSHKeyOwnerByFingerprint(db.DB, ssh.FingerprintSHA256(key))
	if err != nil || !owner.Approved {
		return nil, fmt.Errorf("unauthorized key")
	}

	touchKey(owner)

	return &ssh.Permissions{
		Extensions: map[string]string{
			"owner-id":   fmt.Sprint(owner.OwnerID),
			"owner-name": owner.OwnerName,
		},
	}, nil
}

func touchKey(owner *store.GitTokenOwner) {
	now := time.Now().UTC()
	if owner.LastUsedAt != nil {
		if last, err := time.Parse(time.RFC3339, *owner.LastUsedAt); err == nil && now.Sub(last) < touchEvery {
			return
		}
	}

	store.TouchGitSSHKey(db.DB, owner.TokenID, now.Format(time.RFC3339))
}

func serveConn(raw net.Conn, config *ssh.ServerConfig) {
	raw.SetDeadline(time.Now().Add(sshAuthTimeout))

	conn, channels, requests, err := ssh.NewServerConn(raw, config)
	if err != nil {
		raw.Close()
		return
	}
	defer conn.Close()

	raw.SetDeadline(time.Time{})
	go ssh.DiscardRequests(requests)

	for channel := range channels {
		if channel.ChannelType() != "session" {
			channel.Reject(ssh.UnknownChannelType, "only session channels")
			continue
		}
		go serveSession(channel, conn.Permissions)
	}
}

func serveSession(incoming ssh.NewChannel, perms *ssh.Permissions) {
	channel, requests, err := incoming.Accept()
	if err != nil {
		return
	}
	defer channel.Close()

	for request := range requests {
		if request.Type != "exec" {
			request.Reply(false, nil)
			continue
		}

		request.Reply(true, nil)
		status := runExec(channel, perms, execPayload(request.Payload))
		channel.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{status}))
		return
	}
}

func execPayload(payload []byte) string {
	if len(payload) < 4 {
		return ""
	}

	length := int(payload[0])<<24 | int(payload[1])<<16 | int(payload[2])<<8 | int(payload[3])
	if length < 0 || length > sshMaxCommand || 4+length > len(payload) {
		return ""
	}

	return string(payload[4 : 4+length])
}

// runExec answers one `git-upload-pack <path>` or `git-receive-pack <path>`.
// Permissions mirror Serve: writing needs the owner, private repos stay hidden.
func runExec(channel ssh.Channel, perms *ssh.Permissions, command string) uint32 {
	service, path, ok := splitCommand(command)
	if !ok {
		fmt.Fprintln(channel.Stderr(), "only git-upload-pack and git-receive-pack are supported")
		return 1
	}

	project, name, ok := splitRepoPath(path)
	if !ok {
		fmt.Fprintln(channel.Stderr(), "expected a path like project/repo.git")
		return 1
	}

	repo, err := store.GitRepoByPath(db.DB, project, name)
	if err != nil {
		fmt.Fprintln(channel.Stderr(), "repository not found")
		return 1
	}

	write := service == receivePack
	owner := perms != nil && perms.Extensions["owner-id"] == fmt.Sprint(repo.OwnerID) && repo.Approved

	if (write || repo.Private) && !owner {
		fmt.Fprintln(channel.Stderr(), "repository not found")
		return 1
	}

	dir := repoDir(repo)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		fmt.Fprintln(channel.Stderr(), "repository not found")
		return 1
	}

	cmd := packCommand(service, dir)
	cmd.Stdin = channel
	cmd.Stdout = channel
	cmd.Stderr = channel.Stderr()

	if err := cmd.Run(); err != nil {
		return 1
	}

	return 0
}

func packCommand(service, dir string) *exec.Cmd {
	return command(context.Background(), "", strings.TrimPrefix(service, "git-"), dir)
}

func splitCommand(raw string) (string, string, bool) {
	fields := strings.Fields(strings.TrimSpace(raw))
	if len(fields) != 2 {
		return "", "", false
	}
	if fields[0] != uploadPack && fields[0] != receivePack {
		return "", "", false
	}

	return fields[0], strings.Trim(fields[1], "'\""), true
}

func splitRepoPath(path string) (string, string, bool) {
	trimmed := strings.Trim(path, "/")
	trimmed = strings.TrimSuffix(trimmed, RepoSuffix)

	project, name, ok := strings.Cut(trimmed, "/")
	if !ok || project == "" || name == "" || strings.Contains(name, "/") {
		return "", "", false
	}

	return project, name, true
}

func SSHKeys(owner Owner) ([]store.GitSSHKey, error) {
	return store.GitSSHKeysByOwner(db.DB, owner.ID)
}

func AddSSHKey(owner Owner, rawName, rawKey string) (*store.GitSSHKey, error) {
	name := strings.TrimSpace(rawName)
	if name == "" || utf8.RuneCountInString(name) > maxSSHKeyName {
		return nil, ErrInvalidInput
	}

	parsed, _, _, _, err := ssh.ParseAuthorizedKey([]byte(strings.TrimSpace(rawKey)))
	if err != nil {
		return nil, ErrInvalidInput
	}

	existing, err := store.GitSSHKeysByOwner(db.DB, owner.ID)
	if err != nil {
		return nil, err
	}
	if len(existing) >= maxSSHKeys {
		return nil, ErrTooManyTokens
	}

	// store the normalised form, not what the client pasted
	authorized := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(parsed)))

	key, err := store.CreateGitSSHKey(db.DB, owner.ID, name, ssh.FingerprintSHA256(parsed), authorized)
	if err != nil {
		return nil, ErrInvalidInput
	}

	return key, nil
}

func DeleteSSHKey(owner Owner, id int64) error {
	err := store.DeleteGitSSHKey(db.DB, owner.ID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrTokenNotFound
	}

	return err
}
