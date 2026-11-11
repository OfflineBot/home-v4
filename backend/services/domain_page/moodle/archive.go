package moodle

import (
	"fmt"
	"path"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type ArchiveEntry struct {
	Name     string
	Path     string
	Content  []byte
	Modified time.Time
	Compress bool
}

const (
	linkType      = "url"
	maxNameRunes  = 120
	fallbackName  = "_"
	archiveSuffix = ".zip"
	linkSuffix    = ".url"
)

var compressibleTypes = []string{"json", "xml", "javascript", "csv", "svg", "ipynb", "x-c", "x-python", "x-java"}

func CourseArchive(userID, courseID int64) (string, []ArchiveEntry, error) {
	detail, err := CourseWithContents(userID, courseID)
	if err != nil {
		return "", nil, err
	}

	root := safeName(detail.Course.Fullname)
	used := map[string]int{}
	var entries []ArchiveEntry

	for i, section := range detail.Sections {
		sectionName := section.Name
		if sectionName == "" {
			sectionName = fmt.Sprintf("Abschnitt %d", section.Number)
		}
		sectionDir := fmt.Sprintf("%02d %s", i+1, safeName(sectionName))

		for _, module := range section.Modules {
			moduleDir := path.Join(root, sectionDir, safeName(module.Name))

			for _, file := range module.Files {
				switch file.Type {
				case fileType:
					stored := file
					if stored.Path == nil {
						fetched, err := FileByID(userID, file.ID)
						if err != nil {
							continue
						}
						stored = *fetched
					}

					entries = append(entries, ArchiveEntry{
						Name:     unique(used, path.Join(moduleDir, safeDir(file.Filepath), safeName(file.Filename))),
						Path:     *stored.Path,
						Modified: modified(file.TimeModified),
						Compress: compressible(file.Mimetype),
					})
				case linkType:
					if file.Link == "" {
						continue
					}
					entries = append(entries, ArchiveEntry{
						Name:     unique(used, path.Join(moduleDir, safeName(file.Filename)+linkSuffix)),
						Content:  []byte("[InternetShortcut]\r\nURL=" + file.Link + "\r\n"),
						Modified: time.Now(),
						Compress: true,
					})
				}
			}
		}
	}

	return root + archiveSuffix, entries, nil
}

func safeName(raw string) string {
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune(`/\:*?"<>|`, r) {
			return '_'
		}
		return r
	}, raw)
	cleaned = strings.Trim(strings.TrimSpace(cleaned), ".")

	if utf8.RuneCountInString(cleaned) > maxNameRunes {
		cleaned = string([]rune(cleaned)[:maxNameRunes])
	}
	if cleaned == "" {
		return fallbackName
	}

	return cleaned
}

func safeDir(filepath string) string {
	var parts []string
	for _, part := range strings.Split(filepath, "/") {
		if strings.TrimSpace(part) == "" {
			continue
		}
		parts = append(parts, safeName(part))
	}

	return path.Join(parts...)
}

func unique(used map[string]int, name string) string {
	key := strings.ToLower(name)
	used[key]++
	if used[key] == 1 {
		return name
	}

	ext := path.Ext(name)
	candidate := fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(name, ext), used[key], ext)
	used[strings.ToLower(candidate)]++
	return candidate
}

func modified(unix int64) time.Time {
	if unix <= 0 {
		return time.Now()
	}

	return time.Unix(unix, 0)
}

func compressible(mimetype string) bool {
	if strings.HasPrefix(mimetype, "text/") {
		return true
	}
	for _, kind := range compressibleTypes {
		if strings.Contains(mimetype, kind) {
			return true
		}
	}

	return false
}
