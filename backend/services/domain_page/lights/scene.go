package lights

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"

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
