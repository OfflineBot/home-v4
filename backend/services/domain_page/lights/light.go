package lights

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/wled"
)

//go:embed schema.sql
var Schema string

type Light = store.Light

type Input struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type Update struct {
	Name *string `json:"name"`
	URL  *string `json:"url"`
}

type State struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	On         bool     `json:"on"`
	Brightness int      `json:"brightness"`
	Preset     int      `json:"preset"`
	Playlist   int      `json:"playlist"`
	Color      string   `json:"color"`
	Colors     []string `json:"colors"`
	Effect     int      `json:"effect"`
	Speed      int      `json:"speed"`
	Intensity  int      `json:"intensity"`
	Palette    int      `json:"palette"`
}

type Change struct {
	On         *bool    `json:"on"`
	Toggle     bool     `json:"toggle"`
	Brightness *int     `json:"brightness"`
	Preset     *int     `json:"preset"`
	Color      *string  `json:"color"`
	Colors     []string `json:"colors"`
	Effect     *int     `json:"effect"`
	Speed      *int     `json:"speed"`
	Intensity  *int     `json:"intensity"`
	Palette    *int     `json:"palette"`
}

type Preset struct {
	ID         int      `json:"id"`
	Name       string   `json:"name"`
	QuickLabel string   `json:"quick_label"`
	Playlist   bool     `json:"playlist"`
	On         *bool    `json:"on"`
	Brightness *int     `json:"brightness"`
	Colors     []string `json:"colors"`
	Effect     *int     `json:"effect"`
}

type PresetSave struct {
	Slot              *int    `json:"preset"`
	Name              string  `json:"name"`
	QuickLabel        string  `json:"quick_label"`
	Overwrite         bool    `json:"overwrite"`
	IncludeBrightness *bool   `json:"include_brightness"`
	State             *Change `json:"state"`
}

type Option struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type Device struct {
	ID       int64    `json:"id"`
	Name     string   `json:"name"`
	Device   string   `json:"device_name"`
	Version  string   `json:"version"`
	LEDs     int      `json:"leds"`
	RGBW     bool     `json:"rgbw"`
	Effects  []Option `json:"effects"`
	Palettes []Option `json:"palettes"`
}

type device interface {
	Info(ctx context.Context, base string) (*wled.Info, error)
	Device(ctx context.Context, base string) (*wled.Device, error)
	State(ctx context.Context, base string) (*wled.State, error)
	Apply(ctx context.Context, base string, change map[string]any) (*wled.State, error)
	Send(ctx context.Context, base string, command map[string]any) error
	Presets(ctx context.Context, base string) ([]wled.Preset, error)
}

const (
	maxName        = 100
	maxPresetName  = 32
	maxQuickLabel  = 8
	maxColors      = 3
	callTimeout    = 8 * time.Second
	maxPreset      = 250
	maxByte        = 255
	solidEffect    = 0
	hexColorDigits = 6
	uniqueFailure  = "UNIQUE constraint failed"
)

var reservedEffects = []string{"", "-", "RSVD"}

var (
	ErrInvalidLight   = errors.New("invalid light")
	ErrInvalidURL     = errors.New("invalid light url")
	ErrInvalidChange  = errors.New("invalid light change")
	ErrInvalidPreset  = errors.New("invalid preset")
	ErrNotFound       = errors.New("light not found")
	ErrPresetNotFound = errors.New("preset not found")
	ErrPresetExists   = errors.New("preset slot already used")
	ErrPresetsFull    = errors.New("no free preset slot")
	ErrDuplicate      = errors.New("light name or url already used")
	ErrUnreachable    = errors.New("light not reachable")
	ErrNotWLED        = errors.New("no wled device at url")
)

var client device = wled.New()

func List(userID int64) ([]Light, error) {
	return store.LightsByOwner(db.DB, userID)
}

func Create(userID int64, in Input) (*Light, error) {
	name, err := lightName(in.Name)
	if err != nil {
		return nil, err
	}
	base, err := checkedURL(in.URL)
	if err != nil {
		return nil, err
	}

	id, err := store.CreateLight(db.DB, Light{OwnerID: userID, Name: name, URL: base})
	if err != nil {
		return nil, storeError(err)
	}

	return store.LightByID(db.DB, userID, id)
}

func Edit(userID, id int64, in Update) (*Light, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}
	if in.Name == nil && in.URL == nil {
		return nil, ErrInvalidLight
	}

	if in.Name != nil {
		if light.Name, err = lightName(*in.Name); err != nil {
			return nil, err
		}
	}
	if in.URL != nil {
		base, err := wled.ParseBase(*in.URL)
		if err != nil {
			return nil, ErrInvalidURL
		}
		if base != light.URL {
			if base, err = checkedURL(base); err != nil {
				return nil, err
			}
			light.URL = base
		}
	}

	if err := store.UpdateLight(db.DB, *light); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, storeError(err)
	}

	return light, nil
}

func Delete(userID, id int64) error {
	err := store.DeleteLight(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}

	return err
}

func CurrentState(userID, id int64) (*State, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	state, err := client.State(ctx, light.URL)
	if err != nil {
		return nil, unreachable(err)
	}

	return view(light, state), nil
}

func SetState(userID, id int64, change Change) (*State, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	body, err := statePayload(change)
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, ErrInvalidChange
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	state, err := client.Apply(ctx, light.URL, body)
	if err != nil {
		return nil, unreachable(err)
	}

	return view(light, state), nil
}

func Presets(userID, id int64) ([]Preset, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	raw, err := client.Presets(ctx, light.URL)
	if err != nil {
		return nil, unreachable(err)
	}

	presets := make([]Preset, 0, len(raw))
	for _, p := range raw {
		presets = append(presets, presetView(p))
	}

	return presets, nil
}

func SavePreset(userID, id int64, in PresetSave) (*Preset, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(in.Name)
	label := strings.TrimSpace(in.QuickLabel)
	if name == "" || len(name) > maxPresetName || !utf8.ValidString(name) || len(label) > maxQuickLabel || !utf8.ValidString(label) {
		return nil, ErrInvalidPreset
	}
	if in.Slot != nil && (*in.Slot < 1 || *in.Slot > maxPreset) {
		return nil, ErrInvalidPreset
	}

	body := map[string]any{}
	if in.State != nil {
		if in.State.Preset != nil || in.State.Toggle {
			return nil, ErrInvalidChange
		}
		if body, err = statePayload(*in.State); err != nil {
			return nil, err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	existing, err := client.Presets(ctx, light.URL)
	if err != nil {
		return nil, unreachable(err)
	}

	slot, err := presetSlot(existing, in.Slot, in.Overwrite)
	if err != nil {
		return nil, err
	}

	includeBrightness := in.IncludeBrightness == nil || *in.IncludeBrightness
	body["psave"] = slot
	body["n"] = name
	body["ib"] = includeBrightness
	body["sb"] = true
	if label != "" {
		body["ql"] = label
	}

	if err := client.Send(ctx, light.URL, body); err != nil {
		return nil, unreachable(err)
	}

	return &Preset{ID: slot, Name: name, QuickLabel: label, Colors: []string{}}, nil
}

func DeletePreset(userID, id int64, slot int) error {
	light, err := byID(userID, id)
	if err != nil {
		return err
	}
	if slot < 1 || slot > maxPreset {
		return ErrInvalidPreset
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	existing, err := client.Presets(ctx, light.URL)
	if err != nil {
		return unreachable(err)
	}
	if !slices.ContainsFunc(existing, func(p wled.Preset) bool { return p.ID == slot }) {
		return ErrPresetNotFound
	}

	if err := client.Send(ctx, light.URL, map[string]any{"pdel": slot}); err != nil {
		return unreachable(err)
	}

	return nil
}

func DeviceInfo(userID, id int64) (*Device, error) {
	light, err := byID(userID, id)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	raw, err := client.Device(ctx, light.URL)
	if err != nil {
		return nil, unreachable(err)
	}

	return &Device{
		ID:       light.ID,
		Name:     light.Name,
		Device:   raw.Info.Name,
		Version:  raw.Info.Version,
		LEDs:     raw.Info.LEDs.Count,
		RGBW:     raw.Info.LEDs.RGBW,
		Effects:  options(raw.Effects),
		Palettes: options(raw.Palettes),
	}, nil
}

func lightName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxName {
		return "", ErrInvalidLight
	}

	return name, nil
}

func checkedURL(raw string) (string, error) {
	base, err := wled.ParseBase(raw)
	if err != nil {
		return "", ErrInvalidURL
	}

	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	if _, err := client.Info(ctx, base); err != nil {
		if errors.Is(err, wled.ErrUnexpected) {
			return "", fmt.Errorf("%w: %w", ErrNotWLED, err)
		}
		return "", unreachable(err)
	}

	return base, nil
}

func storeError(err error) error {
	if strings.Contains(err.Error(), uniqueFailure) {
		return ErrDuplicate
	}

	return err
}

func unreachable(err error) error {
	return fmt.Errorf("%w: %w", ErrUnreachable, err)
}

func byID(userID, id int64) (*Light, error) {
	light, err := store.LightByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}

	return light, err
}

func statePayload(change Change) (map[string]any, error) {
	body := map[string]any{}

	if change.Toggle && change.On != nil {
		return nil, ErrInvalidChange
	}
	if change.Toggle {
		body["on"] = "t"
	}
	if change.On != nil {
		body["on"] = *change.On
	}
	if change.Brightness != nil {
		if *change.Brightness < 1 || *change.Brightness > 100 {
			return nil, ErrInvalidChange
		}
		body["bri"] = toDevice(*change.Brightness)
	}

	segment, err := segmentPayload(change)
	if err != nil {
		return nil, err
	}

	if change.Preset != nil {
		if *change.Preset < 1 || *change.Preset > maxPreset || len(segment) > 0 {
			return nil, ErrInvalidChange
		}
		body["ps"] = *change.Preset
	}
	if len(segment) > 0 {
		body["seg"] = segment
	}

	return body, nil
}

func segmentPayload(change Change) (map[string]any, error) {
	segment := map[string]any{}

	if change.Color != nil && len(change.Colors) > 0 {
		return nil, ErrInvalidChange
	}
	colors := change.Colors
	if change.Color != nil {
		colors = []string{*change.Color}
	}
	if len(colors) > maxColors {
		return nil, ErrInvalidChange
	}
	if len(colors) > 0 {
		parsed := make([]wled.Color, 0, len(colors))
		for _, raw := range colors {
			color, err := parseColor(raw)
			if err != nil {
				return nil, err
			}
			parsed = append(parsed, color)
		}
		segment["col"] = parsed
		if change.Effect == nil {
			segment["fx"] = solidEffect
		}
	}

	for key, value := range map[string]*int{"fx": change.Effect, "sx": change.Speed, "ix": change.Intensity, "pal": change.Palette} {
		if value == nil {
			continue
		}
		if *value < 0 || *value > maxByte {
			return nil, ErrInvalidChange
		}
		segment[key] = *value
	}

	return segment, nil
}

func parseColor(raw string) (wled.Color, error) {
	if len(strings.TrimPrefix(strings.TrimSpace(raw), "#")) != hexColorDigits {
		return wled.Color{}, ErrInvalidChange
	}

	color, err := wled.ParseHex(raw)
	if err != nil {
		return wled.Color{}, ErrInvalidChange
	}

	return color, nil
}

func presetSlot(existing []wled.Preset, requested *int, overwrite bool) (int, error) {
	used := make(map[int]bool, len(existing))
	for _, p := range existing {
		used[p.ID] = true
	}

	if requested != nil {
		if used[*requested] && !overwrite {
			return 0, ErrPresetExists
		}
		return *requested, nil
	}

	for slot := 1; slot <= maxPreset; slot++ {
		if !used[slot] {
			return slot, nil
		}
	}

	return 0, ErrPresetsFull
}

func view(light *Light, state *wled.State) *State {
	out := &State{
		ID:         light.ID,
		Name:       light.Name,
		On:         state.On,
		Brightness: toPercent(state.Brightness),
		Preset:     state.Preset,
		Playlist:   state.Playlist,
		Colors:     []string{},
	}

	if segment, ok := state.Segments.Main(state.MainSegment); ok {
		out.Colors = hexColors(segment.Colors)
		if len(out.Colors) > 0 {
			out.Color = out.Colors[0]
		}
		out.Effect = segment.Effect
		out.Speed = segment.Speed
		out.Intensity = segment.Intensity
		out.Palette = segment.Palette
	}

	return out
}

func presetView(p wled.Preset) Preset {
	out := Preset{ID: p.ID, Name: p.Name, QuickLabel: p.QuickLabel, Playlist: p.Playlist, On: p.On, Colors: []string{}}
	if p.Brightness != nil {
		percent := toPercent(*p.Brightness)
		out.Brightness = &percent
	}
	if segment, ok := p.Segments.Main(p.MainSegment); ok {
		out.Colors = hexColors(segment.Colors)
		effect := segment.Effect
		out.Effect = &effect
	}

	return out
}

func hexColors(colors []wled.Color) []string {
	out := make([]string, 0, len(colors))
	for _, c := range colors {
		out = append(out, c.Hex())
	}

	return out
}

func options(names []string) []Option {
	out := make([]Option, 0, len(names))
	for id, name := range names {
		if slices.Contains(reservedEffects, strings.TrimSpace(name)) {
			continue
		}
		out = append(out, Option{ID: id, Name: name})
	}

	return out
}

func toDevice(percent int) int {
	return max(1, min(maxByte, int(math.Round(float64(percent)*maxByte/100))))
}

func toPercent(bri int) int {
	return max(0, min(100, int(math.Round(float64(bri)*100/maxByte))))
}
