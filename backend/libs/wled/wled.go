package wled

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultTimeout = 5 * time.Second
	dialTimeout    = 3 * time.Second
	maxResponse    = 1 << 20
	maxURL         = 255
	statePath      = "/json/state"
	infoPath       = "/json/info"
	devicePath     = "/json"
	presetsPath    = "/presets.json"
)

var (
	ErrInvalidAddress = errors.New("wled: invalid address")
	ErrBlockedAddress = errors.New("wled: address not allowed")
	ErrUnexpected     = errors.New("wled: unexpected response")
)

type Client struct {
	HTTP *http.Client
}

type Info struct {
	Name    string `json:"name"`
	Version string `json:"ver"`
	MAC     string `json:"mac"`
	Product string `json:"product"`
	LEDs    struct {
		Count int  `json:"count"`
		RGBW  bool `json:"rgbw"`
	} `json:"leds"`
}

type Color struct {
	R, G, B, W int
}

type Segment struct {
	ID        int     `json:"id"`
	Colors    []Color `json:"col"`
	Effect    int     `json:"fx"`
	Speed     int     `json:"sx"`
	Intensity int     `json:"ix"`
	Palette   int     `json:"pal"`
}

type Segments []Segment

type State struct {
	On          bool       `json:"on"`
	Brightness  int        `json:"bri"`
	Preset      int        `json:"ps"`
	Playlist    int        `json:"pl"`
	MainSegment int        `json:"mainseg"`
	Segments    Segments   `json:"seg"`
	Nightlight  Nightlight `json:"nl"`
}

// Nightlight is wled's own sleep timer. Remaining counts down on the device,
// so the fade keeps running even when nothing is talking to it.
type Nightlight struct {
	On        bool `json:"on"`
	Duration  int  `json:"dur"`
	Mode      int  `json:"mode"`
	Target    int  `json:"tbri"`
	Remaining int  `json:"rem"`
}

type Preset struct {
	ID          int
	Name        string
	QuickLabel  string
	Playlist    bool
	On          *bool
	Brightness  *int
	MainSegment int
	Segments    Segments
}

type Device struct {
	Info     Info     `json:"info"`
	Effects  []string `json:"effects"`
	Palettes []string `json:"palettes"`
}

type presetEntry struct {
	Name     string          `json:"n"`
	QL       string          `json:"ql"`
	Playlist json.RawMessage `json:"playlist"`
	On       json.RawMessage `json:"on"`
	Bri      json.RawMessage `json:"bri"`
	MainSeg  json.RawMessage `json:"mainseg"`
	Seg      json.RawMessage `json:"seg"`
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

func ParseBase(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxURL {
		return "", ErrInvalidAddress
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}

	u, err := url.Parse(raw)
	if err != nil || u.Opaque != "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.ForceQuery {
		return "", ErrInvalidAddress
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", ErrInvalidAddress
	}

	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", ErrInvalidAddress
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return "", ErrBlockedAddress
	}
	if ip := net.ParseIP(host); ip != nil && blocked(ip) {
		return "", ErrBlockedAddress
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return "", ErrInvalidAddress
		}
	}

	u.Host = strings.ToLower(u.Host)
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""

	return u.String(), nil
}

func ParseHex(raw string) (Color, error) {
	raw = strings.TrimPrefix(strings.TrimSpace(raw), "#")
	if len(raw) != 6 && len(raw) != 8 {
		return Color{}, ErrUnexpected
	}

	value, err := strconv.ParseUint(raw, 16, 32)
	if err != nil {
		return Color{}, ErrUnexpected
	}
	if len(raw) == 6 {
		value <<= 8
	}

	return Color{R: int(value >> 24 & 0xff), G: int(value >> 16 & 0xff), B: int(value >> 8 & 0xff), W: int(value & 0xff)}, nil
}

func (c Color) Hex() string {
	return fmt.Sprintf("#%02x%02x%02x", c.R&0xff, c.G&0xff, c.B&0xff)
}

func (c *Color) UnmarshalJSON(raw []byte) error {
	var parts []int
	if err := json.Unmarshal(raw, &parts); err == nil {
		values := [4]int{}
		copy(values[:], parts)
		*c = Color{R: values[0], G: values[1], B: values[2], W: values[3]}
		return nil
	}

	var hex string
	if err := json.Unmarshal(raw, &hex); err != nil {
		return err
	}

	parsed, err := ParseHex(hex)
	if err != nil {
		return err
	}
	*c = parsed
	return nil
}

func (c Color) MarshalJSON() ([]byte, error) {
	return json.Marshal([]int{c.R, c.G, c.B})
}

func (s *Segments) UnmarshalJSON(raw []byte) error {
	raw = bytes.TrimSpace(raw)
	if len(raw) > 0 && raw[0] == '{' {
		var one Segment
		if err := json.Unmarshal(raw, &one); err != nil {
			return err
		}
		*s = Segments{one}
		return nil
	}

	var many []Segment
	if err := json.Unmarshal(raw, &many); err != nil {
		return err
	}
	*s = many
	return nil
}

func (s Segments) Main(id int) (Segment, bool) {
	for _, segment := range s {
		if segment.ID == id {
			return segment, true
		}
	}
	if len(s) > 0 {
		return s[0], true
	}

	return Segment{}, false
}

func (c *Client) Info(ctx context.Context, base string) (*Info, error) {
	var info Info
	if err := c.do(ctx, http.MethodGet, base, infoPath, nil, &info); err != nil {
		return nil, err
	}
	if info.Version == "" {
		return nil, ErrUnexpected
	}

	return &info, nil
}

func (c *Client) Device(ctx context.Context, base string) (*Device, error) {
	var device Device
	if err := c.do(ctx, http.MethodGet, base, devicePath, nil, &device); err != nil {
		return nil, err
	}
	if device.Info.Version == "" {
		return nil, ErrUnexpected
	}

	return &device, nil
}

func (c *Client) State(ctx context.Context, base string) (*State, error) {
	var state State
	if err := c.do(ctx, http.MethodGet, base, statePath, nil, &state); err != nil {
		return nil, err
	}

	return &state, nil
}

func (c *Client) Apply(ctx context.Context, base string, change map[string]any) (*State, error) {
	body := make(map[string]any, len(change)+1)
	for key, value := range change {
		body[key] = value
	}
	body["v"] = true

	var state State
	if err := c.do(ctx, http.MethodPost, base, statePath, body, &state); err != nil {
		return nil, err
	}

	return &state, nil
}

func (c *Client) Send(ctx context.Context, base string, command map[string]any) error {
	var ignored json.RawMessage
	return c.do(ctx, http.MethodPost, base, statePath, command, &ignored)
}

func (c *Client) Presets(ctx context.Context, base string) ([]Preset, error) {
	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodGet, base, presetsPath, nil, &raw); err != nil {
		return nil, err
	}

	presets := []Preset{}
	for key, value := range raw {
		id, err := strconv.Atoi(key)
		if err != nil || id <= 0 {
			continue
		}
		presets = append(presets, preset(id, value))
	}
	sort.Slice(presets, func(i, j int) bool { return presets[i].ID < presets[j].ID })

	return presets, nil
}

func preset(id int, raw json.RawMessage) Preset {
	p := Preset{ID: id}

	var entry presetEntry
	if err := json.Unmarshal(raw, &entry); err == nil {
		p.Name = entry.Name
		p.QuickLabel = entry.QL
		p.Playlist = len(entry.Playlist) > 0 && string(entry.Playlist) != "null"

		var on bool
		if json.Unmarshal(entry.On, &on) == nil {
			p.On = &on
		}
		var bri int
		if json.Unmarshal(entry.Bri, &bri) == nil {
			p.Brightness = &bri
		}
		var main int
		if json.Unmarshal(entry.MainSeg, &main) == nil {
			p.MainSegment = main
		}
		var segments Segments
		if json.Unmarshal(entry.Seg, &segments) == nil {
			p.Segments = segments
		}
	}

	if p.Name == "" {
		p.Name = "Preset " + strconv.Itoa(id)
	}

	return p
}

func (c *Client) do(ctx context.Context, method, base, path string, in, out any) error {
	normalized, err := ParseBase(base)
	if err != nil {
		return err
	}

	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, normalized+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", ErrUnexpected, resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponse)).Decode(out); err != nil {
		return fmt.Errorf("%w: %w", ErrUnexpected, err)
	}

	return nil
}

func guard(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return ErrBlockedAddress
	}

	ip := net.ParseIP(host)
	if ip == nil || blocked(ip) {
		return ErrBlockedAddress
	}

	return nil
}

func blocked(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() || ip.IsMulticast()
}
