// Package explore answers the one question a visitor without an account can
// ask: what on this server is open to everyone?
package explore

import (
	"home-v4/backend/services/db"
	"home-v4/backend/services/domain_page/git"
	"home-v4/backend/services/domain_page/pages"
	"home-v4/backend/services/domain_page/publicstore"
	store "home-v4/backend/store/domain_page"
)

type Repo struct {
	Project     string `json:"project"`
	Name        string `json:"name"`
	Owner       string `json:"owner"`
	Description string `json:"description"`
	ClonePath   string `json:"clone_path"`
	CreatedAt   string `json:"created_at"`
}

type Page struct {
	Name      string `json:"name"`
	Title     string `json:"title"`
	Owner     string `json:"owner"`
	Path      string `json:"path"`
	URL       string `json:"url,omitempty"`
	UpdatedAt string `json:"updated_at"`
}

type Listing struct {
	Repos []Repo             `json:"repos"`
	Pages []Page             `json:"pages"`
	Files []publicstore.File `json:"files"`
}

func Load() (*Listing, error) {
	repos, err := store.PublicGitRepos(db.DB)
	if err != nil {
		return nil, err
	}

	sites, err := store.PublicPages(db.DB)
	if err != nil {
		return nil, err
	}

	files, err := publicstore.List()
	if err != nil {
		return nil, err
	}

	listing := &Listing{
		Repos: make([]Repo, 0, len(repos)),
		Pages: make([]Page, 0, len(sites)),
		Files: files,
	}

	for i := range repos {
		listing.Repos = append(listing.Repos, Repo{
			Project:     repos[i].Project,
			Name:        repos[i].Name,
			Owner:       repos[i].OwnerName,
			Description: repos[i].Description,
			ClonePath:   "/" + repos[i].Project + "/" + repos[i].Name + git.RepoSuffix,
			CreatedAt:   repos[i].CreatedAt,
		})
	}

	for i := range sites {
		listing.Pages = append(listing.Pages, Page{
			Name:      sites[i].Name,
			Title:     sites[i].Title,
			Owner:     sites[i].OwnerName,
			Path:      "/" + sites[i].Name + "/",
			URL:       pages.URL(sites[i].Name),
			UpdatedAt: sites[i].UpdatedAt,
		})
	}

	return listing, nil
}
