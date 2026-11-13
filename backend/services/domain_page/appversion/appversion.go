// Package appversion answers "is the installed app the current one" by
// looking at what was published: the newest apk in the public store is the
// release, so uploading one is all it takes to publish it.
package appversion

import (
	"regexp"
	"strconv"
	"strings"

	"home-v4/backend/services/domain_page/publicstore"
)

const (
	apkSuffix  = ".apk"
	pathPrefix = "/api/public/files/"
)

// home-v4-1.4.0.apk or home-v4-1.4.0+7.apk; the build after the plus is the
// versionCode android compares, the three numbers are what people read.
var versionPattern = regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?`)

type Release struct {
	Version   string `json:"version"`
	Build     int    `json:"build"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"created_at"`
}

// Latest is the highest version on offer, not the most recent upload: a
// re-uploaded old build must not look like an update.
func Latest() (*Release, error) {
	files, err := publicstore.List()
	if err != nil {
		return nil, err
	}

	var best *Release
	var bestParts [4]int

	for _, file := range files {
		if !strings.HasSuffix(strings.ToLower(file.Name), apkSuffix) {
			continue
		}

		parts, ok := parse(file.Name)
		if !ok {
			continue
		}
		if best != nil && !newer(parts, bestParts) {
			continue
		}

		bestParts = parts
		best = &Release{
			Version:   formatVersion(parts),
			Build:     parts[3],
			Name:      file.Name,
			Path:      pathPrefix + file.ID + "/" + file.Name,
			Size:      file.Size,
			CreatedAt: file.CreatedAt,
		}
	}

	return best, nil
}

func parse(name string) ([4]int, bool) {
	match := versionPattern.FindStringSubmatch(name)
	if match == nil {
		return [4]int{}, false
	}

	var parts [4]int
	for i := range parts {
		parts[i], _ = strconv.Atoi(match[i+1])
	}

	return parts, true
}

func newer(a, b [4]int) bool {
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}

	return false
}

func formatVersion(parts [4]int) string {
	return strconv.Itoa(parts[0]) + "." + strconv.Itoa(parts[1]) + "." + strconv.Itoa(parts[2])
}
