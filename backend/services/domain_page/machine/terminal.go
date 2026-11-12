package machine

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"

	"golang.org/x/crypto/ssh"
)

type HostKey = store.MachineHostKey

type Ticket struct {
	Ticket    string `json:"ticket"`
	ExpiresAt string `json:"expires_at"`
}

type Size struct {
	Cols int
	Rows int
}

type Stream interface {
	ReadMessage() (int, []byte, error)
	WriteMessage(int, []byte) error
	Close() error
}

const (
	TextMessage   = 1
	BinaryMessage = 2
	closeMessage  = 8
	pingMessage   = 9

	ticketBytes     = 32
	ticketTTL       = 30 * time.Second
	maxTickets      = 1000
	maxSessions     = 4
	dialWait        = 5 * time.Second
	handshakeWindow = 5 * time.Minute
	answerWait      = 2 * time.Minute
	pingEvery       = 30 * time.Second
	maxPrompts      = 6
	maxAnswer       = 1024
	maxDimension    = 1000
	outputChunk     = 32 * 1024
	controlBuffer   = 8
	terminalType    = "xterm-256color"
	passwordPrompt  = "Password:"
	hostKeyMismatch = "no common algorithm for host key"
	authUnable      = "unable to authenticate"
	authFailures    = "too many authentication failures"
	DefaultCols     = 80
	DefaultRows     = 24

	maxTmuxList     = 50
	tmuxSettle      = 2 * time.Second
	maxSessionName  = 64
	tmuxMissingCode = 7
	tmuxListCommand = "command -v tmux >/dev/null 2>&1 || exit 7; " +
		"tmux list-sessions -F " +
		"'#{session_name}\t#{session_windows}\t#{session_attached}" +
		"\t#{session_created}\t#{session_activity}' 2>/dev/null; exit 0"
)

var normalClosure = []byte{0x03, 0xe8}

var (
	ErrInvalidTicket   = errors.New("invalid terminal ticket")
	ErrTooManyTickets  = errors.New("too many pending terminal tickets")
	errHostKeyChanged  = errors.New("host key changed")
	errHostKeyRejected = errors.New("host key rejected")
	errCancelled       = errors.New("login cancelled")
	errClosed          = errors.New("terminal closed")
	errTimeout         = errors.New("answer timeout")
	errTooManyPrompts  = errors.New("too many login prompts")
	errBadAnswer       = errors.New("invalid login answer")
)

type ticketEntry struct {
	userID    int64
	machineID int64
	expires   time.Time
}

var (
	ticketMu  sync.Mutex
	tickets   = map[string]ticketEntry{}
	sessionMu sync.Mutex
	sessions  = map[int64]int{}
)

type prompt struct {
	Text string `json:"text"`
	Echo bool   `json:"echo"`
}

type TmuxSession struct {
	Name     string `json:"name"`
	Windows  int    `json:"windows"`
	Attached bool   `json:"attached"`
	Created  int64  `json:"created"`
	Activity int64  `json:"activity"`
}

type event struct {
	Type        string   `json:"type"`
	Error       string   `json:"error,omitempty"`
	Kind        string   `json:"kind,omitempty"`
	Name        string   `json:"name,omitempty"`
	Instruction string   `json:"instruction,omitempty"`
	Prompts     []prompt `json:"prompts,omitempty"`
	Attempt     int      `json:"attempt,omitempty"`
	KeyType     string   `json:"key_type,omitempty"`
	Fingerprint string   `json:"fingerprint,omitempty"`
	Expected    string   `json:"expected,omitempty"`
	Code        *int     `json:"code,omitempty"`

	Tmux     string        `json:"tmux,omitempty"`
	Sessions []TmuxSession `json:"sessions,omitempty"`
}

type control struct {
	Type    string   `json:"type"`
	Accept  bool     `json:"accept"`
	Answers []string `json:"answers"`
	Cols    int      `json:"cols"`
	Rows    int      `json:"rows"`
}

type terminal struct {
	stream    Stream
	writeMu   sync.Mutex
	controls  chan control
	done      chan struct{}
	closeOnce sync.Once

	stateMu sync.Mutex
	size    Size
	session *ssh.Session
	stdin   io.Writer

	prompts   int
	cancelled bool
}

func IssueTicket(userID, machineID int64) (*Ticket, error) {
	if _, err := byID(userID, machineID); err != nil {
		return nil, err
	}

	raw := make([]byte, ticketBytes)
	rand.Read(raw)
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := time.Now().Add(ticketTTL)

	ticketMu.Lock()
	defer ticketMu.Unlock()

	now := time.Now()
	for key, entry := range tickets {
		if now.After(entry.expires) {
			delete(tickets, key)
		}
	}
	if len(tickets) >= maxTickets {
		return nil, ErrTooManyTickets
	}
	tickets[ticketKey(token)] = ticketEntry{userID: userID, machineID: machineID, expires: expires}

	return &Ticket{Ticket: token, ExpiresAt: expires.UTC().Format(time.RFC3339)}, nil
}

func Redeem(token string) (int64, int64, error) {
	key := ticketKey(token)

	ticketMu.Lock()
	entry, ok := tickets[key]
	delete(tickets, key)
	ticketMu.Unlock()

	if !ok || time.Now().After(entry.expires) {
		return 0, 0, ErrInvalidTicket
	}

	return entry.userID, entry.machineID, nil
}

func KnownHostKey(userID, machineID int64) (*HostKey, error) {
	if _, err := byID(userID, machineID); err != nil {
		return nil, err
	}

	key, err := store.HostKeyByMachine(db.DB, userID, machineID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}

	return key, err
}

func ForgetHostKey(userID, machineID int64) error {
	if _, err := byID(userID, machineID); err != nil {
		return err
	}

	err := store.DeleteHostKey(db.DB, userID, machineID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}

	return err
}

func ParseSize(cols, rows string) Size {
	size := Size{Cols: DefaultCols, Rows: DefaultRows}
	if n, err := strconv.Atoi(cols); err == nil && validDimension(n) {
		size.Cols = n
	}
	if n, err := strconv.Atoi(rows); err == nil && validDimension(n) {
		size.Rows = n
	}

	return size
}

func RunTerminal(stream Stream, userID, machineID int64, size Size) {
	t := &terminal{
		stream:   stream,
		controls: make(chan control, controlBuffer),
		done:     make(chan struct{}),
		size:     size,
	}
	defer t.finish()

	if !acquire(userID) {
		t.fail("too_many_sessions")
		return
	}
	defer release(userID)

	m, err := byID(userID, machineID)
	if err != nil {
		t.fail("not_found")
		return
	}

	go t.readLoop()
	t.run(userID, m)
}

func (t *terminal) run(userID int64, m *Machine) {
	addr := net.JoinHostPort(m.IP, strconv.Itoa(int(m.SSHPort)))

	conn, err := net.DialTimeout("tcp", addr, dialWait)
	if err != nil {
		t.fail("unreachable")
		return
	}
	defer conn.Close()

	go func() {
		<-t.done
		conn.Close()
	}()

	known, err := store.HostKeyByMachine(db.DB, userID, m.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.fail("internal")
		return
	}

	config := &ssh.ClientConfig{
		User:            m.Username,
		HostKeyCallback: t.verifyHost(userID, m.ID, known),
		Auth: []ssh.AuthMethod{
			ssh.RetryableAuthMethod(ssh.PasswordCallback(t.password), maxPrompts),
			ssh.RetryableAuthMethod(ssh.KeyboardInteractive(t.keyboard), maxPrompts),
		},
	}
	if known != nil {
		config.HostKeyAlgorithms = hostKeyAlgorithms(known.Type)
	}

	conn.SetDeadline(time.Now().Add(handshakeWindow))
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		t.fail(loginError(err))
		return
	}
	conn.SetDeadline(time.Time{})

	client := ssh.NewClient(sshConn, chans, reqs)
	defer client.Close()

	if err := t.shell(client); err != nil {
		t.fail("shell_failed")
	}
}

func (t *terminal) shell(client *ssh.Client) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return err
	}

	size := t.currentSize()
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := session.RequestPty(terminalType, size.Rows, size.Cols, modes); err != nil {
		return err
	}
	if err := session.Shell(); err != nil {
		return err
	}

	t.attach(session, stdin)
	t.send(event{Type: "connected"})

	stopPing := make(chan struct{})
	defer close(stopPing)
	go t.keepAlive(stopPing)
	go t.watchControls(client, stopPing)
	go t.pollSessions(client)

	var pumps sync.WaitGroup
	pumps.Add(2)
	go t.pump(stdout, &pumps)
	go t.pump(stderr, &pumps)
	pumps.Wait()

	code := 0
	var exit *ssh.ExitError
	if err := session.Wait(); errors.As(err, &exit) {
		code = exit.ExitStatus()
	} else if err != nil {
		code = -1
	}
	t.send(event{Type: "exit", Code: &code})

	return nil
}

func (t *terminal) verifyHost(userID, machineID int64, known *HostKey) ssh.HostKeyCallback {
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		encoded := base64.StdEncoding.EncodeToString(key.Marshal())
		fingerprint := ssh.FingerprintSHA256(key)

		if known != nil {
			if known.Key == encoded {
				return nil
			}
			t.send(event{Type: "error", Error: "host_key_changed", KeyType: key.Type(), Fingerprint: fingerprint, Expected: known.Fingerprint})
			return errHostKeyChanged
		}

		t.drain()
		t.send(event{Type: "hostkey", KeyType: key.Type(), Fingerprint: fingerprint})
		answer, err := t.await("hostkey")
		if err != nil {
			return err
		}
		if !answer.Accept {
			return errHostKeyRejected
		}

		return store.SaveHostKey(db.DB, store.MachineHostKey{
			MachineID:   machineID,
			OwnerID:     userID,
			Type:        key.Type(),
			Key:         encoded,
			Fingerprint: fingerprint,
		})
	}
}

func (t *terminal) password() (string, error) {
	answers, err := t.ask("password", "", "", []prompt{{Text: passwordPrompt}})
	if err != nil {
		return "", err
	}

	return answers[0], nil
}

func (t *terminal) keyboard(name, instruction string, questions []string, echos []bool) ([]string, error) {
	if len(questions) == 0 {
		return []string{}, nil
	}

	prompts := make([]prompt, len(questions))
	for i, question := range questions {
		prompts[i] = prompt{Text: question, Echo: i < len(echos) && echos[i]}
	}

	return t.ask("keyboard-interactive", name, instruction, prompts)
}

func (t *terminal) ask(kind, name, instruction string, prompts []prompt) ([]string, error) {
	if t.cancelled {
		return nil, errCancelled
	}
	if t.prompts >= maxPrompts {
		return nil, errTooManyPrompts
	}
	t.prompts++

	t.drain()
	t.send(event{Type: "prompt", Kind: kind, Name: name, Instruction: instruction, Prompts: prompts, Attempt: t.prompts})

	answer, err := t.await("answer")
	if err != nil {
		return nil, err
	}
	if len(answer.Answers) != len(prompts) {
		return nil, errBadAnswer
	}
	for _, a := range answer.Answers {
		if len(a) > maxAnswer {
			return nil, errBadAnswer
		}
	}

	return answer.Answers, nil
}

func (t *terminal) await(kinds ...string) (control, error) {
	timer := time.NewTimer(answerWait)
	defer timer.Stop()

	for {
		select {
		case msg := <-t.controls:
			if msg.Type == "cancel" {
				t.cancelled = true
				return control{}, errCancelled
			}
			if slices.Contains(kinds, msg.Type) {
				return msg, nil
			}
		case <-t.done:
			return control{}, errClosed
		case <-timer.C:
			return control{}, errTimeout
		}
	}
}

func (t *terminal) drain() {
	for {
		select {
		case <-t.controls:
		default:
			return
		}
	}
}

func (t *terminal) readLoop() {
	defer t.closeOnce.Do(func() { close(t.done) })

	for {
		kind, data, err := t.stream.ReadMessage()
		if err != nil {
			return
		}

		switch kind {
		case BinaryMessage:
			if stdin := t.input(); stdin != nil {
				if _, err := stdin.Write(data); err != nil {
					return
				}
			}
		case TextMessage:
			var msg control
			if json.Unmarshal(data, &msg) != nil {
				continue
			}
			if msg.Type == "resize" {
				t.resize(msg.Cols, msg.Rows)
				continue
			}
			select {
			case t.controls <- msg:
			default:
			}
		}
	}
}

func (t *terminal) pump(r io.Reader, wg *sync.WaitGroup) {
	defer wg.Done()

	buf := make([]byte, outputChunk)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			t.write(BinaryMessage, buf[:n])
		}
		if err != nil {
			return
		}
	}
}

func (t *terminal) watchControls(client *ssh.Client, stop chan struct{}) {
	for {
		select {
		case msg := <-t.controls:
			if msg.Type == "tmux" {
				t.listSessions(client)
			}
		case <-stop:
			return
		case <-t.done:
			return
		}
	}
}

func (t *terminal) pollSessions(client *ssh.Client) {
	t.listSessions(client)

	select {
	case <-time.After(tmuxSettle):
	case <-t.done:
		return
	}

	t.listSessions(client)
}

func (t *terminal) listSessions(client *ssh.Client) {
	session, err := client.NewSession()
	if err != nil {
		return
	}
	defer session.Close()

	out, err := session.Output(tmuxListCommand)

	var exit *ssh.ExitError
	if errors.As(err, &exit) && exit.ExitStatus() == tmuxMissingCode {
		t.send(event{Type: "tmux", Tmux: "missing"})
		return
	}
	if err != nil {
		return
	}

	t.send(event{Type: "tmux", Tmux: "ok", Sessions: parseSessions(string(out))})
}

func parseSessions(out string) []TmuxSession {
	list := []TmuxSession{}

	for _, line := range strings.Split(out, "\n") {
		fields := strings.Split(strings.TrimRight(line, "\r"), "\t")
		if len(fields) < 5 || fields[0] == "" || len(fields[0]) > maxSessionName {
			continue
		}

		windows, _ := strconv.Atoi(fields[1])
		created, _ := strconv.ParseInt(fields[3], 10, 64)
		activity, _ := strconv.ParseInt(fields[4], 10, 64)

		list = append(list, TmuxSession{
			Name:     fields[0],
			Windows:  windows,
			Attached: fields[2] != "0",
			Created:  created,
			Activity: activity,
		})
		if len(list) >= maxTmuxList {
			break
		}
	}

	return list
}

func (t *terminal) keepAlive(stop chan struct{}) {
	ticker := time.NewTicker(pingEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if t.write(pingMessage, nil) != nil {
				return
			}
		case <-stop:
			return
		case <-t.done:
			return
		}
	}
}

func (t *terminal) attach(session *ssh.Session, stdin io.Writer) {
	t.stateMu.Lock()
	defer t.stateMu.Unlock()

	t.session = session
	t.stdin = stdin
}

func (t *terminal) input() io.Writer {
	t.stateMu.Lock()
	defer t.stateMu.Unlock()

	return t.stdin
}

func (t *terminal) currentSize() Size {
	t.stateMu.Lock()
	defer t.stateMu.Unlock()

	return t.size
}

func (t *terminal) resize(cols, rows int) {
	if !validDimension(cols) || !validDimension(rows) {
		return
	}

	t.stateMu.Lock()
	defer t.stateMu.Unlock()

	t.size = Size{Cols: cols, Rows: rows}
	if t.session != nil {
		t.session.WindowChange(rows, cols)
	}
}

func (t *terminal) send(e event) {
	raw, err := json.Marshal(e)
	if err == nil {
		t.write(TextMessage, raw)
	}
}

func (t *terminal) write(kind int, data []byte) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()

	return t.stream.WriteMessage(kind, data)
}

func (t *terminal) fail(code string) {
	if code != "" {
		t.send(event{Type: "error", Error: code})
	}
}

func (t *terminal) finish() {
	t.write(closeMessage, normalClosure)
	t.stream.Close()
}

func loginError(err error) string {
	switch {
	case errors.Is(err, errHostKeyChanged), errors.Is(err, errClosed):
		return ""
	case errors.Is(err, errHostKeyRejected):
		return "host_key_rejected"
	case strings.Contains(err.Error(), hostKeyMismatch):
		return "host_key_changed"
	case errors.Is(err, errCancelled):
		return "cancelled"
	case errors.Is(err, errTimeout):
		return "timeout"
	case errors.Is(err, errTooManyPrompts), errors.Is(err, errBadAnswer), authRefused(err):
		return "auth_failed"
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}

	return "ssh_failed"
}

func authRefused(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, authUnable) || strings.Contains(message, authFailures)
}

func hostKeyAlgorithms(keyType string) []string {
	if keyType == ssh.KeyAlgoRSA {
		return []string{ssh.KeyAlgoRSASHA512, ssh.KeyAlgoRSASHA256, ssh.KeyAlgoRSA}
	}

	return []string{keyType}
}

func validDimension(n int) bool {
	return n > 0 && n <= maxDimension
}

func ticketKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func acquire(userID int64) bool {
	sessionMu.Lock()
	defer sessionMu.Unlock()

	if sessions[userID] >= maxSessions {
		return false
	}
	sessions[userID]++
	return true
}

func release(userID int64) {
	sessionMu.Lock()
	defer sessionMu.Unlock()

	sessions[userID]--
	if sessions[userID] <= 0 {
		delete(sessions, userID)
	}
}
