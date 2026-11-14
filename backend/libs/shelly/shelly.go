// Package shelly talks to Shelly relays. Gen2+ devices answer on /rpc, Gen1 on
// /relay/0; both accept GET, so one request shape covers the whole range.
package shelly

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultTimeout = 5 * time.Second
	dialTimeout    = 3 * time.Second
	maxBody        = 1 << 20

	gen2Set    = "/rpc/Switch.Set"
	gen2Status = "/rpc/Switch.GetStatus"
	gen1Set    = "/relay/0"
	gen1Status = "/status"
)

var (
	ErrBlockedAddress = errors.New("address not allowed")
	ErrUnreachable    = errors.New("device unreachable")
	ErrUnexpected     = errors.New("unexpected device answer")
)

type Client struct {
	HTTP *http.Client
}

func New() *Client {
	dialer := &net.Dialer{Timeout: dialTimeout, Control: guard}

	return &Client{HTTP: &http.Client{
		Timeout: defaultTimeout,
		Transport: &http.Transport{
			DialContext:         dialer.DialContext,
			TLSHandshakeTimeout: dialTimeout,
			MaxIdleConnsPerHost: 2,
			IdleConnTimeout:     30 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}}
}

// Set switches the relay. Gen2 is tried first; a Gen1 device answers that path
// with 404, which is the signal to fall back rather than an error to report.
func (c *Client) Set(ctx context.Context, base string, on bool) error {
	query := url.Values{"id": {"0"}, "on": {boolText(on)}}

	err := c.call(ctx, base, gen2Set, query, nil)
	if err == nil {
		return nil
	}
	if !errors.Is(err, errNotFound) {
		return err
	}

	turn := "off"
	if on {
		turn = "on"
	}

	return c.call(ctx, base, gen1Set, url.Values{"turn": {turn}}, nil)
}

// OffAfter leaves the relay on and lets the device switch itself off after
// the delay. The countdown runs on the plug, so it still fires if this server
// restarts in the meantime.
func (c *Client) OffAfter(ctx context.Context, base string, after time.Duration) error {
	seconds := strconv.Itoa(int(after.Round(time.Second).Seconds()))

	query := url.Values{"id": {"0"}, "on": {boolText(true)}, "toggle_after": {seconds}}

	err := c.call(ctx, base, gen2Set, query, nil)
	if err == nil {
		return nil
	}
	if !errors.Is(err, errNotFound) {
		return err
	}

	return c.call(ctx, base, gen1Set, url.Values{"turn": {"on"}, "timer": {seconds}}, nil)
}

func (c *Client) Status(ctx context.Context, base string) (bool, error) {
	state, err := c.State(ctx, base)
	return state.On, err
}

// State is the relay plus whatever countdown it is running, so a timer armed
// on the device can be shown and taken back.
type State struct {
	On        bool
	Remaining time.Duration
}

func (c *Client) State(ctx context.Context, base string) (State, error) {
	var gen2 struct {
		Output        *bool    `json:"output"`
		TimerDuration *float64 `json:"timer_duration"`
		TimerStarted  *float64 `json:"timer_started_at"`
	}
	err := c.call(ctx, base, gen2Status, url.Values{"id": {"0"}}, &gen2)
	if err == nil {
		if gen2.Output == nil {
			return State{}, ErrUnexpected
		}

		return State{On: *gen2.Output, Remaining: remaining(gen2.TimerStarted, gen2.TimerDuration)}, nil
	}
	if !errors.Is(err, errNotFound) {
		return State{}, err
	}

	var gen1 struct {
		Relays []struct {
			IsOn           bool `json:"ison"`
			TimerRemaining *int `json:"timer_remaining"`
		} `json:"relays"`
	}
	if err := c.call(ctx, base, gen1Status, nil, &gen1); err != nil {
		return State{}, err
	}
	if len(gen1.Relays) == 0 {
		return State{}, ErrUnexpected
	}

	state := State{On: gen1.Relays[0].IsOn}
	if left := gen1.Relays[0].TimerRemaining; left != nil && *left > 0 {
		state.Remaining = time.Duration(*left) * time.Second
	}

	return state, nil
}

// the device reports when the countdown started and how long it runs; what is
// left has to be worked out against its clock, which is unix time
func remaining(startedAt, duration *float64) time.Duration {
	if startedAt == nil || duration == nil || *duration <= 0 {
		return 0
	}

	ends := time.Unix(int64(*startedAt), 0).Add(time.Duration(*duration * float64(time.Second)))
	left := time.Until(ends)
	if left < 0 {
		return 0
	}

	return left
}

var errNotFound = errors.New("path not found")

func (c *Client) call(ctx context.Context, base, path string, query url.Values, out any) error {
	target := strings.TrimRight(base, "/") + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrUnreachable, err)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return errNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return ErrUnexpected
	}
	if out == nil {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return ErrUnexpected
	}

	return nil
}

func boolText(on bool) string {
	if on {
		return "true"
	}
	return "false"
}

func guard(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return ErrBlockedAddress
	}

	ip := net.ParseIP(host)
	if ip == nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() {
		return ErrBlockedAddress
	}

	return nil
}
