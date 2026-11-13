package domainpage

import (
	"errors"
	"log/slog"
	"mime"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/git"

	"github.com/gofiber/fiber/v3"
)

type gitRepoBody struct {
	Project     string `json:"project"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Private     *bool  `json:"private"`
}

type gitRepoUpdate struct {
	Project string `json:"project"`
	Name    string `json:"name"`
	git.RepoUpdate
}

type gitNameBody struct {
	Name string `json:"name"`
}

type gitTokenTarget struct {
	ID int64 `json:"id"`
}

func GitRouter(r fiber.Router) {
	r.
		Get("/list", listGitRepos).
		Post("/create", createNewRepo).
		Get("/repo", gitRepoDetail).
		Get("/tree", gitTree).
		Get("/blob", gitBlob).
		Get("/commits", gitCommits).
		Get("/commit", gitCommit).
		Get("/branches", gitBranches).
		Post("/update", updateGitRepo).
		Post("/delete", deleteGitRepo).
		Get("/projects/check", checkGitProject).
		Post("/projects/new", newGitProject).
		Post("/projects/delete", deleteGitProject).
		Get("/tokens", listGitTokens).
		Post("/tokens/new", newGitToken).
		Post("/tokens/delete", deleteGitToken).
		Get("/keys", listGitKeys).
		Post("/keys/new", newGitKey).
		Post("/keys/delete", deleteGitKey)
}

func gitOwner(c fiber.Ctx) git.Owner {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return git.Owner{ID: user.ID, Name: user.Name}
}

func gitError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func gitResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, git.ErrInvalidName):
		return gitError(c, fiber.StatusBadRequest, "invalid_name")
	case errors.Is(err, git.ErrReserved):
		return gitError(c, fiber.StatusBadRequest, "reserved")
	case errors.Is(err, git.ErrInvalidInput):
		return gitError(c, fiber.StatusBadRequest, "invalid_input")
	case errors.Is(err, git.ErrProjectNotOwn):
		return gitError(c, fiber.StatusForbidden, "not_owner")
	case errors.Is(err, git.ErrNotFound), errors.Is(err, git.ErrTokenNotFound):
		return gitError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, git.ErrRefNotFound):
		return gitError(c, fiber.StatusNotFound, "ref_not_found")
	case errors.Is(err, git.ErrNotATree):
		return gitError(c, fiber.StatusConflict, "not_a_folder")
	case errors.Is(err, git.ErrNotABlob):
		return gitError(c, fiber.StatusConflict, "not_a_file")
	case errors.Is(err, git.ErrNameTaken):
		return gitError(c, fiber.StatusConflict, "name_taken")
	case errors.Is(err, git.ErrExists):
		return gitError(c, fiber.StatusConflict, "exists")
	case errors.Is(err, git.ErrTooManyTokens):
		return gitError(c, fiber.StatusConflict, "too_many_tokens")
	case errors.Is(err, git.ErrUnavailable):
		return gitError(c, fiber.StatusServiceUnavailable, "unavailable")
	}

	slog.Warn("git: request failed", "err", err)
	return gitError(c, fiber.StatusInternalServerError, "internal")
}

func listGitRepos(c fiber.Ctx) error {
	projects, err := git.Projects(gitOwner(c))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(fiber.Map{"projects": projects})
}

func createNewRepo(c fiber.Ctx) error {
	var body gitRepoBody
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	private := body.Private == nil || *body.Private
	repo, err := git.CreateRepo(gitOwner(c), body.Project, body.Name, body.Description, private)
	if err != nil {
		return gitResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(repo)
}

func gitRepoDetail(c fiber.Ctx) error {
	detail, err := git.RepoDetail(gitOwner(c), c.Query("project"), c.Query("name"))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(detail)
}

func updateGitRepo(c fiber.Ctx) error {
	var body gitRepoUpdate
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	repo, err := git.UpdateRepo(gitOwner(c), body.Project, body.Name, body.RepoUpdate)
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(repo)
}

func deleteGitRepo(c fiber.Ctx) error {
	var body gitRepoBody
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := git.DeleteRepo(gitOwner(c), body.Project, body.Name); err != nil {
		return gitResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func checkGitProject(c fiber.Ctx) error {
	return c.JSON(git.CheckProject(c.Query("name")))
}

func newGitProject(c fiber.Ctx) error {
	var body gitNameBody
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	project, err := git.CreateProject(gitOwner(c), body.Name)
	if err != nil {
		return gitResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(project)
}

func deleteGitProject(c fiber.Ctx) error {
	var body gitNameBody
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := git.DeleteProject(gitOwner(c), body.Name); err != nil {
		return gitResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func listGitTokens(c fiber.Ctx) error {
	tokens, err := git.Tokens(gitOwner(c))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(fiber.Map{"tokens": tokens})
}

func newGitToken(c fiber.Ctx) error {
	var body gitNameBody
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	token, err := git.CreateToken(gitOwner(c), body.Name)
	if err != nil {
		return gitResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(token)
}

func deleteGitToken(c fiber.Ctx) error {
	var body gitTokenTarget
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := git.DeleteToken(gitOwner(c), body.ID); err != nil {
		return gitResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func listGitKeys(c fiber.Ctx) error {
	keys, err := git.SSHKeys(gitOwner(c))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(fiber.Map{"keys": keys})
}

func newGitKey(c fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
		Key  string `json:"key"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	key, err := git.AddSSHKey(gitOwner(c), body.Name, body.Key)
	if err != nil {
		return gitResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(key)
}

func deleteGitKey(c fiber.Ctx) error {
	var body gitTokenTarget
	if err := c.Bind().JSON(&body); err != nil {
		return gitError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := git.DeleteSSHKey(gitOwner(c), body.ID); err != nil {
		return gitResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func gitTree(c fiber.Ctx) error {
	tree, err := git.ReadTree(gitOwner(c), c.Query("project"), c.Query("name"), c.Query("ref"), c.Query("path"))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(tree)
}

func gitBlob(c fiber.Ctx) error {
	blob, err := git.ReadBlob(gitOwner(c), c.Query("project"), c.Query("name"), c.Query("ref"), c.Query("path"))
	if err != nil {
		return gitResult(c, err)
	}

	etag := `"` + blob.Hash + `"`
	if c.Get(fiber.HeaderIfNoneMatch) == etag {
		blob.Body.Close()
		return c.SendStatus(fiber.StatusNotModified)
	}

	disposition := "inline"
	if header := mime.FormatMediaType(disposition, map[string]string{"filename": blob.Name}); header != "" {
		disposition = header
	}
	c.Set(fiber.HeaderContentType, blob.MimeType)
	c.Set(fiber.HeaderContentDisposition, disposition)
	c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
	c.Set(fiber.HeaderContentSecurityPolicy, "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'")
	c.Set(fiber.HeaderETag, etag)
	c.Set(fiber.HeaderCacheControl, "private, no-cache")

	return c.SendStream(blob.Body, int(blob.Size))
}

func gitCommits(c fiber.Ctx) error {
	page := fiber.Query[int](c, "page", 1)
	perPage := fiber.Query[int](c, "per_page", git.DefaultPerPage)

	commits, err := git.ListCommits(gitOwner(c), c.Query("project"), c.Query("name"), c.Query("ref"), c.Query("path"), page, perPage)
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(commits)
}

func gitCommit(c fiber.Ctx) error {
	commit, err := git.ReadCommit(gitOwner(c), c.Query("project"), c.Query("name"), c.Query("hash"))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(commit)
}

func gitBranches(c fiber.Ctx) error {
	branches, err := git.ListBranches(gitOwner(c), c.Query("project"), c.Query("name"))
	if err != nil {
		return gitResult(c, err)
	}

	return c.JSON(branches)
}
