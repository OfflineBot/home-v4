package lights

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/shelly"
)

const (
	KindWLED   = "wled"
	KindShelly = "shelly"

	SceneAll   = "all"
	SceneOff   = "off"
	SceneLED   = "led"
	SceneNoLED = "no_led"
)

var (
	ErrUnknownScene = errors.New("unknown scene")
	ErrUnknownKind  = errors.New("unknown device kind")

	Scenes = []string{SceneAll, SceneOff, SceneLED, SceneNoLED}
	Kinds  = []string{KindWLED, KindShelly}

	shellyClient = shelly.New()
)

type Profile struct {
	LightID int64    `json:"light_id"`
	Kind    string   `json:"kind"`
	Scenes  []string `json:"scenes"`
}

type SceneResult struct {
	Scene   string  `json:"scene"`
	Changed int     `json:"changed"`
	Failed  []int64 `json:"failed"`
}

// Profiles reports the kind and scene membership of every light, filling in the
// default for lights the user never configured.
func Profiles(userID int64) ([]Profile, error) {
	list, err := List(userID)
	if err != nil {
		return nil, err
	}

	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	profiles := make([]Profile, 0, len(list))
	for _, light := range list {
		profiles = append(profiles, profileOf(light.ID, stored))
	}

	return profiles, nil
}

func SetProfile(userID, lightID int64, kind string, scenes []string) error {
	if !slices.Contains(Kinds, kind) {
		return ErrUnknownKind
	}
	for _, scene := range scenes {
		if !slices.Contains(Scenes, scene) {
			return ErrUnknownScene
		}
	}

	return store.SetLightProfile(db.DB, userID, lightID, kind, strings.Join(scenes, ","))
}

// Apply switches every light of the user to the state the scene asks for.
// Lights are driven in parallel because one unreachable device must not hold
// up the rest of the room.
func Apply(userID int64, scene string) (*SceneResult, error) {
	if !slices.Contains(Scenes, scene) {
		return nil, ErrUnknownScene
	}

	list, err := List(userID)
	if err != nil {
		return nil, err
	}

	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	result := &SceneResult{Scene: scene, Failed: []int64{}}
	var mutex sync.Mutex
	var group sync.WaitGroup

	for _, light := range list {
		profile := profileOf(light.ID, stored)
		on := wants(profile, scene)

		group.Add(1)
		go func(light Light, profile Profile, on bool) {
			defer group.Done()

			err := switchLight(light, profile.Kind, on)

			mutex.Lock()
			defer mutex.Unlock()
			if err != nil {
				result.Failed = append(result.Failed, light.ID)
				return
			}
			result.Changed++
		}(light, profile, on)
	}

	group.Wait()
	slices.Sort(result.Failed)

	return result, nil
}

func switchLight(light Light, kind string, on bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	if kind == KindShelly {
		return shellyClient.Set(ctx, light.URL, on)
	}

	_, err := client.Apply(ctx, light.URL, map[string]any{"on": on})
	return err
}

func profileOf(lightID int64, stored map[int64]store.LightProfile) Profile {
	profile := Profile{LightID: lightID, Kind: KindWLED}

	if row, ok := stored[lightID]; ok {
		profile.Kind = row.Kind
		if row.Scenes != "" {
			profile.Scenes = strings.Split(row.Scenes, ",")
		}
	}

	return profile
}

// An empty scene list means "behave like your kind": led covers wled devices,
// no_led covers the rest. Listing scenes explicitly overrides that.
func wants(profile Profile, scene string) bool {
	if len(profile.Scenes) > 0 {
		return slices.Contains(profile.Scenes, scene)
	}

	switch scene {
	case SceneAll:
		return true
	case SceneOff:
		return false
	case SceneLED:
		return profile.Kind == KindWLED
	case SceneNoLED:
		return profile.Kind != KindWLED
	}

	return false
}

func kindOf(userID, lightID int64) (string, error) {
	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return "", err
	}

	return profileOf(lightID, stored).Kind, nil
}

// Status is which scene the room is in right now, read from the devices
// themselves. Scene is empty when the lights match none of them.
type Status struct {
	Scene string  `json:"scene"`
	On    []int64 `json:"on"`
	Off   []int64 `json:"off"`
	// seconds until the lights switch themselves off, 0 when nothing is armed
	SleepIn int `json:"sleep_in"`
	// one entry per light that is running a countdown right now
	Timers []Timer `json:"timers"`
}

type Timer struct {
	LightID int64  `json:"light_id"`
	Name    string `json:"name"`
	SleepIn int    `json:"sleep_in"`
}

type reading struct {
	on    bool
	sleep int
}

// the broad scenes are checked first: with only wled devices "all" and "led"
// describe the same state, and "all" is what the user pressed
var sceneOrder = []string{SceneOff, SceneAll, SceneLED, SceneNoLED}

func Current(userID int64) (*Status, error) {
	list, err := List(userID)
	if err != nil {
		return nil, err
	}

	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	actual := readStates(list, stored)

	status := &Status{On: []int64{}, Off: []int64{}, Timers: []Timer{}}
	for _, light := range list {
		found, known := actual[light.ID]
		if !known {
			continue
		}
		if found.on {
			status.On = append(status.On, light.ID)
		} else {
			status.Off = append(status.Off, light.ID)
		}
		if found.sleep <= 0 {
			continue
		}
		if found.sleep > status.SleepIn {
			status.SleepIn = found.sleep
		}
		status.Timers = append(status.Timers, Timer{
			LightID: light.ID,
			Name:    light.Name,
			SleepIn: found.sleep,
		})
	}

	if len(actual) == len(list) && len(list) > 0 {
		status.Scene = matchScene(list, stored, actual)
	}

	return status, nil
}

// an unreachable light is left out of the map, so a scene is only reported
// when every light could be asked
func readStates(list []Light, stored map[int64]store.LightProfile) map[int64]reading {
	states := map[int64]reading{}

	var mutex sync.Mutex
	var group sync.WaitGroup

	for _, light := range list {
		group.Add(1)
		go func(light Light, kind string) {
			defer group.Done()

			found, err := readLight(light, kind)
			if err != nil {
				return
			}

			mutex.Lock()
			defer mutex.Unlock()
			states[light.ID] = found
		}(light, profileOf(light.ID, stored).Kind)
	}

	group.Wait()

	return states
}

func readLight(light Light, kind string) (reading, error) {
	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	if kind == KindShelly {
		state, err := shellyClient.State(ctx, light.URL)
		if err != nil {
			return reading{}, err
		}

		return reading{on: state.On, sleep: int(state.Remaining.Seconds())}, nil
	}

	state, err := client.State(ctx, light.URL)
	if err != nil {
		return reading{}, err
	}

	found := reading{on: state.On}
	if state.Nightlight.On && state.Nightlight.Remaining > 0 {
		found.sleep = state.Nightlight.Remaining
	}

	return found, nil
}

func matchScene(list []Light, stored map[int64]store.LightProfile, actual map[int64]reading) string {
	for _, scene := range sceneOrder {
		fits := true
		for _, light := range list {
			if wants(profileOf(light.ID, stored), scene) != actual[light.ID].on {
				fits = false
				break
			}
		}
		if fits {
			return scene
		}
	}

	return ""
}

const (
	minSleepMinutes = 1
	maxSleepMinutes = 255 // wled stores the nightlight duration in one byte

	nightlightInstant = 0
	nightlightFade    = 1
)

var ErrInvalidSleep = errors.New("invalid sleep duration")

// Sleep asks every light that is on to switch itself off after the delay. The
// countdown deliberately runs on the devices — wled has a nightlight, shelly a
// toggle timer — so a restart or a deploy here cannot leave the room lit.
type Sleep struct {
	Minutes int     `json:"minutes"`
	Fade    bool    `json:"fade"`
	Armed   int     `json:"armed"`
	Failed  []int64 `json:"failed"`
}

func StartSleep(userID int64, minutes int, fade bool) (*Sleep, error) {
	if minutes < minSleepMinutes || minutes > maxSleepMinutes {
		return nil, ErrInvalidSleep
	}

	list, err := List(userID)
	if err != nil {
		return nil, err
	}

	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	actual := readStates(list, stored)
	result := &Sleep{Minutes: minutes, Fade: fade, Failed: []int64{}}

	var mutex sync.Mutex
	var group sync.WaitGroup

	for _, light := range list {
		if found, known := actual[light.ID]; !known || !found.on {
			continue
		}

		group.Add(1)
		go func(light Light, kind string) {
			defer group.Done()

			err := armSleep(light, kind, minutes, fade)

			mutex.Lock()
			defer mutex.Unlock()
			if err != nil {
				result.Failed = append(result.Failed, light.ID)
				return
			}
			result.Armed++
		}(light, profileOf(light.ID, stored).Kind)
	}

	group.Wait()
	slices.Sort(result.Failed)

	return result, nil
}

// CancelSleep clears the countdown on every light, or on one when an id is
// given: starting a timer by accident must be undoable without going dark.
func CancelSleep(userID int64, only int64) (*Sleep, error) {
	list, err := List(userID)
	if err != nil {
		return nil, err
	}
	if only > 0 {
		light, err := byID(userID, only)
		if err != nil {
			return nil, err
		}
		list = []Light{*light}
	}

	stored, err := store.LightProfilesByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	result := &Sleep{Failed: []int64{}}

	var mutex sync.Mutex
	var group sync.WaitGroup

	for _, light := range list {
		group.Add(1)
		go func(light Light, kind string) {
			defer group.Done()

			err := clearSleep(light, kind)

			mutex.Lock()
			defer mutex.Unlock()
			if err != nil {
				result.Failed = append(result.Failed, light.ID)
				return
			}
			result.Armed++
		}(light, profileOf(light.ID, stored).Kind)
	}

	group.Wait()
	slices.Sort(result.Failed)

	return result, nil
}

func armSleep(light Light, kind string, minutes int, fade bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	if kind == KindShelly {
		// a relay has nothing to dim, so it simply drops out at the end
		return shellyClient.OffAfter(ctx, light.URL, time.Duration(minutes)*time.Minute)
	}

	mode := nightlightInstant
	if fade {
		mode = nightlightFade
	}

	return client.Send(ctx, light.URL, map[string]any{
		"nl": map[string]any{"on": true, "dur": minutes, "mode": mode, "tbri": 0},
	})
}

func clearSleep(light Light, kind string) error {
	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()

	if kind == KindShelly {
		return shellyClient.Set(ctx, light.URL, true)
	}

	return client.Send(ctx, light.URL, map[string]any{"nl": map[string]any{"on": false}})
}
