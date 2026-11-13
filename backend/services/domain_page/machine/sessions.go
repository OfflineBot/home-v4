package machine

import (
	"database/sql"
	"encoding/base64"
	"errors"
	"net"
	"strconv"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"

	"golang.org/x/crypto/ssh"
)

const (
	tmuxOK      = "ok"
	tmuxMissing = "missing"
	listWindow  = 20 * time.Second
)

var (
	ErrUnreachable    = errors.New("machine unreachable")
	ErrAuthFailed     = errors.New("login refused")
	ErrHostKeyChanged = errors.New("host key changed")
	ErrBusy           = errors.New("too many open sessions")
)

// SessionList answers "what is running over there". FirstTrust says the host
// key was unknown and has just been pinned, so the caller can show it once.
type SessionList struct {
	Tmux        string        `json:"tmux"`
	Sessions    []TmuxSession `json:"sessions"`
	Fingerprint string        `json:"fingerprint,omitempty"`
	FirstTrust  bool          `json:"first_trust,omitempty"`
}

// Sessions logs in with a password and reports the tmux sessions the machine
// has, for clients that cannot hold the terminal websocket open.
func Sessions(userID, machineID int64, password string) (*SessionList, error) {
	if password == "" {
		return nil, ErrAuthFailed
	}

	m, err := byID(userID, machineID)
	if err != nil {
		return nil, err
	}

	known, err := store.HostKeyByMachine(db.DB, userID, machineID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	if !acquire(userID) {
		return nil, ErrBusy
	}
	defer release(userID)

	addr := net.JoinHostPort(m.IP, strconv.Itoa(int(m.SSHPort)))

	conn, err := net.DialTimeout("tcp", addr, dialWait)
	if err != nil {
		return nil, ErrUnreachable
	}
	defer conn.Close()

	list := &SessionList{Tmux: tmuxOK, Sessions: []TmuxSession{}}

	config := &ssh.ClientConfig{
		User: m.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
			ssh.KeyboardInteractive(sameAnswer(password)),
		},
		HostKeyCallback: pinHost(userID, machineID, known, list),
	}
	if known != nil {
		config.HostKeyAlgorithms = hostKeyAlgorithms(known.Type)
	}

	conn.SetDeadline(time.Now().Add(listWindow))
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		return nil, listFailure(err)
	}

	client := ssh.NewClient(sshConn, chans, reqs)
	defer client.Close()

	conn.SetDeadline(time.Now().Add(listWindow))

	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	out, err := session.Output(tmuxListCommand)

	var exit *ssh.ExitError
	if errors.As(err, &exit) && exit.ExitStatus() == tmuxMissingCode {
		list.Tmux = tmuxMissing
		return list, nil
	}
	if err != nil {
		return nil, err
	}

	list.Sessions = parseSessions(string(out))

	return list, nil
}

func pinHost(userID, machineID int64, known *HostKey, list *SessionList) ssh.HostKeyCallback {
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		encoded := base64.StdEncoding.EncodeToString(key.Marshal())
		list.Fingerprint = ssh.FingerprintSHA256(key)

		if known != nil {
			if known.Key == encoded {
				return nil
			}
			list.Fingerprint = known.Fingerprint
			return errHostKeyChanged
		}

		list.FirstTrust = true

		return store.SaveHostKey(db.DB, store.MachineHostKey{
			MachineID:   machineID,
			OwnerID:     userID,
			Type:        key.Type(),
			Key:         encoded,
			Fingerprint: list.Fingerprint,
		})
	}
}

// sameAnswer covers servers that ask for the password over keyboard-interactive
// instead of the password method; anything else it is asked fails the login.
func sameAnswer(password string) ssh.KeyboardInteractiveChallenge {
	return func(_, _ string, questions []string, _ []bool) ([]string, error) {
		answers := make([]string, len(questions))
		for i := range answers {
			answers[i] = password
		}

		return answers, nil
	}
}

func listFailure(err error) error {
	switch {
	case errors.Is(err, errHostKeyChanged):
		return ErrHostKeyChanged
	case authRefused(err):
		return ErrAuthFailed
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrUnreachable
	}

	return err
}
