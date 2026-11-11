package machine

import (
	"bytes"
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/wol"
)

//go:embed schema.sql
var Schema string

type Machine = store.Machine

type Status struct {
	ID        int64  `json:"id"`
	Online    bool   `json:"online"`
	CheckedAt string `json:"checked_at"`
}

const (
	socketEnv    = "WOL_SOCKET"
	helperURL    = "http://wol/wake"
	helperWait   = 5 * time.Second
	probeTimeout = 2 * time.Second
	maxName      = 100
	maxUsername  = 64
)

var (
	ErrInvalidMachine = errors.New("invalid machine")
	ErrNotFound       = errors.New("machine not found")
	ErrDuplicate      = errors.New("machine name or mac already used")
	ErrWakeFailed     = errors.New("wake on lan failed")
)

type wakeRequest struct {
	MAC       string `json:"mac"`
	Broadcast string `json:"broadcast"`
	Port      int    `json:"port"`
}

func List(userID int64) ([]Machine, error) {
	return store.MachinesByOwner(db.DB, userID)
}

func Create(userID int64, m Machine) (*Machine, error) {
	clean, err := validate(m)
	if err != nil {
		return nil, err
	}
	clean.OwnerID = userID

	id, err := store.CreateMachine(db.DB, *clean)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return nil, ErrDuplicate
		}
		return nil, err
	}

	return store.MachineByID(db.DB, userID, id)
}

func Delete(userID, id int64) error {
	err := store.DeleteMachine(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}

	return err
}

func Wake(userID, id int64) error {
	m, err := byID(userID, id)
	if err != nil {
		return err
	}

	if socket := os.Getenv(socketEnv); socket != "" {
		err = wakeVia(socket, m)
	} else {
		err = wol.Send(m.MAC, m.Broadcast, int(m.WakeOnLanPort))
	}
	if err != nil {
		return fmt.Errorf("%w: %w", ErrWakeFailed, err)
	}

	return nil
}

func CheckOnline(userID, id int64) (*Status, error) {
	m, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(m.IP, strconv.Itoa(int(m.SSHPort))), probeTimeout)
	if err == nil {
		conn.Close()
	}

	return &Status{ID: m.ID, Online: err == nil, CheckedAt: time.Now().UTC().Format(time.RFC3339)}, nil
}

func byID(userID, id int64) (*Machine, error) {
	m, err := store.MachineByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}

	return m, err
}

func wakeVia(socket string, m *Machine) error {
	client := &http.Client{
		Timeout: helperWait,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var dialer net.Dialer
				return dialer.DialContext(ctx, "unix", socket)
			},
		},
	}

	body, err := json.Marshal(wakeRequest{MAC: m.MAC, Broadcast: m.Broadcast, Port: int(m.WakeOnLanPort)})
	if err != nil {
		return err
	}

	resp, err := client.Post(helperURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("wol helper returned status %d", resp.StatusCode)
	}

	return nil
}

func validate(m Machine) (*Machine, error) {
	name := strings.TrimSpace(m.Name)
	username := strings.TrimSpace(m.Username)
	if name == "" || utf8.RuneCountInString(name) > maxName || username == "" || utf8.RuneCountInString(username) > maxUsername {
		return nil, ErrInvalidMachine
	}

	mac, err := net.ParseMAC(strings.TrimSpace(m.MAC))
	if err != nil || len(mac) != 6 {
		return nil, ErrInvalidMachine
	}

	ip := net.ParseIP(strings.TrimSpace(m.IP)).To4()
	broadcast := net.ParseIP(strings.TrimSpace(m.Broadcast)).To4()
	if ip == nil || broadcast == nil || m.SSHPort == 0 || m.WakeOnLanPort == 0 {
		return nil, ErrInvalidMachine
	}

	return &Machine{
		Name:          name,
		MAC:           mac.String(),
		Username:      username,
		Broadcast:     broadcast.String(),
		IP:            ip.String(),
		SSHPort:       m.SSHPort,
		WakeOnLanPort: m.WakeOnLanPort,
	}, nil
}
