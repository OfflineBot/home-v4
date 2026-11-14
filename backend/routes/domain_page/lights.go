package domainpage

import (
	"errors"
	"strconv"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/lights"

	"github.com/gofiber/fiber/v3"
)

func LightRouter(r fiber.Router) {
	r.
		Get("/list", listLights).
		Post("/new", newLight).
		Post("/update", updateLight).
		Post("/delete", deleteLight).
		Get("/device", lightDevice).
		Get("/state", lightState).
		Post("/state", setLightState).
		Get("/presets", lightPresets).
		Post("/presets/save", saveLightPreset).
		Post("/presets/delete", deleteLightPreset).
		Get("/profiles", lightProfiles).
		Post("/profile", setLightProfile).
		Get("/scene", currentLightScene).
		Post("/scene", applyLightScene).
		Post("/sleep", startLightSleep).
		Post("/sleep/cancel", cancelLightSleep)
}

type lightTarget struct {
	ID int64 `json:"id"`
}

type lightUpdate struct {
	ID int64 `json:"id"`
	lights.Update
}

type lightChange struct {
	ID int64 `json:"id"`
	lights.Change
}

type lightPresetSave struct {
	ID int64 `json:"id"`
	lights.PresetSave
}

type lightPresetTarget struct {
	ID     int64 `json:"id"`
	Preset int   `json:"preset"`
}

func lightError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func lightResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, lights.ErrInvalidSleep):
		return lightError(c, fiber.StatusBadRequest, "invalid_sleep")
	case errors.Is(err, lights.ErrUnknownScene):
		return lightError(c, fiber.StatusBadRequest, "unknown_scene")
	case errors.Is(err, lights.ErrUnknownKind):
		return lightError(c, fiber.StatusBadRequest, "unknown_kind")
	case errors.Is(err, lights.ErrInvalidLight):
		return lightError(c, fiber.StatusBadRequest, "invalid_light")
	case errors.Is(err, lights.ErrInvalidURL):
		return lightError(c, fiber.StatusBadRequest, "invalid_url")
	case errors.Is(err, lights.ErrInvalidChange):
		return lightError(c, fiber.StatusBadRequest, "invalid_change")
	case errors.Is(err, lights.ErrInvalidPreset):
		return lightError(c, fiber.StatusBadRequest, "invalid_preset")
	case errors.Is(err, lights.ErrNotFound):
		return lightError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, lights.ErrPresetNotFound):
		return lightError(c, fiber.StatusNotFound, "preset_not_found")
	case errors.Is(err, lights.ErrDuplicate):
		return lightError(c, fiber.StatusConflict, "duplicate")
	case errors.Is(err, lights.ErrPresetExists):
		return lightError(c, fiber.StatusConflict, "preset_exists")
	case errors.Is(err, lights.ErrPresetsFull):
		return lightError(c, fiber.StatusConflict, "presets_full")
	case errors.Is(err, lights.ErrNotWLED):
		return lightError(c, fiber.StatusUnprocessableEntity, "not_wled")
	case errors.Is(err, lights.ErrNotShelly):
		return lightError(c, fiber.StatusUnprocessableEntity, "not_shelly")
	case errors.Is(err, lights.ErrUnreachable):
		return lightError(c, fiber.StatusBadGateway, "unreachable")
	}

	return lightError(c, fiber.StatusInternalServerError, "internal")
}

func lightUser(c fiber.Ctx) int64 {
	return fiber.Locals[*auth.User](c, auth.ContextKey).ID
}

func queryLight(c fiber.Ctx) (int64, bool) {
	id, err := strconv.ParseInt(c.Query("id"), 10, 64)
	return id, err == nil && id > 0
}

func listLights(c fiber.Ctx) error {
	list, err := lights.List(lightUser(c))
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(fiber.Map{"lights": list})
}

func newLight(c fiber.Ctx) error {
	var body lights.Input
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	created, err := lights.Create(lightUser(c), body)
	if err != nil {
		return lightResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(created)
}

func updateLight(c fiber.Ctx) error {
	var body lightUpdate
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	updated, err := lights.Edit(lightUser(c), body.ID, body.Update)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(updated)
}

func deleteLight(c fiber.Ctx) error {
	var body lightTarget
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := lights.Delete(lightUser(c), body.ID); err != nil {
		return lightResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func lightDevice(c fiber.Ctx) error {
	id, ok := queryLight(c)
	if !ok {
		return lightError(c, fiber.StatusBadRequest, "invalid_id")
	}

	device, err := lights.DeviceInfo(lightUser(c), id)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(device)
}

func lightState(c fiber.Ctx) error {
	id, ok := queryLight(c)
	if !ok {
		return lightError(c, fiber.StatusBadRequest, "invalid_id")
	}

	state, err := lights.CurrentState(lightUser(c), id)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(state)
}

func setLightState(c fiber.Ctx) error {
	var body lightChange
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	state, err := lights.SetState(lightUser(c), body.ID, body.Change)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(state)
}

func lightPresets(c fiber.Ctx) error {
	id, ok := queryLight(c)
	if !ok {
		return lightError(c, fiber.StatusBadRequest, "invalid_id")
	}

	presets, err := lights.Presets(lightUser(c), id)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(fiber.Map{"presets": presets})
}

func saveLightPreset(c fiber.Ctx) error {
	var body lightPresetSave
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	preset, err := lights.SavePreset(lightUser(c), body.ID, body.PresetSave)
	if err != nil {
		return lightResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(preset)
}

func deleteLightPreset(c fiber.Ctx) error {
	var body lightPresetTarget
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := lights.DeletePreset(lightUser(c), body.ID, body.Preset); err != nil {
		return lightResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func lightProfiles(c fiber.Ctx) error {
	profiles, err := lights.Profiles(lightUser(c))
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(fiber.Map{"profiles": profiles, "scenes": lights.Scenes, "kinds": lights.Kinds})
}

func setLightProfile(c fiber.Ctx) error {
	var body struct {
		ID     int64    `json:"id"`
		Kind   string   `json:"kind"`
		Scenes []string `json:"scenes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := lights.SetProfile(lightUser(c), body.ID, body.Kind, body.Scenes); err != nil {
		return lightResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func currentLightScene(c fiber.Ctx) error {
	status, err := lights.Current(lightUser(c))
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(status)
}

func startLightSleep(c fiber.Ctx) error {
	var body struct {
		Minutes int  `json:"minutes"`
		Fade    bool `json:"fade"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	result, err := lights.StartSleep(lightUser(c), body.Minutes, body.Fade)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(result)
}

func cancelLightSleep(c fiber.Ctx) error {
	var body struct {
		ID int64 `json:"id"`
	}
	_ = c.Bind().JSON(&body)

	result, err := lights.CancelSleep(lightUser(c), body.ID)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(result)
}

func applyLightScene(c fiber.Ctx) error {
	var body struct {
		Scene string `json:"scene"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return lightError(c, fiber.StatusBadRequest, "invalid_body")
	}

	result, err := lights.Apply(lightUser(c), body.Scene)
	if err != nil {
		return lightResult(c, err)
	}

	return c.JSON(result)
}
