package moodle

import (
	"bytes"
	"cmp"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"path"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	"home-v4/backend/services/storage"
	store "home-v4/backend/store/domain_page"
	moodlelib "home-v4/libs/moodle"
)

//go:embed schema.sql
var Schema string

type Course = store.MoodleCourse

type Section = store.MoodleSection

type File = store.MoodleFile

type Grade = store.MoodleGrade

type Asset = store.MoodleAsset

type CourseDetail struct {
	Course   *Course   `json:"course"`
	Sections []Section `json:"sections"`
	Grades   []Grade   `json:"grades"`
}

type Module = store.MoodleModule

type Placement = store.MoodlePlacement

type SemesterCourses struct {
	Semester int      `json:"semester"`
	Courses  []Course `json:"courses"`
}

type CourseGrades struct {
	ID       int64   `json:"id"`
	Fullname string  `json:"fullname"`
	Grades   []Grade `json:"grades"`
}

var (
	ErrNotFound         = errors.New("moodle item not found")
	ErrUnavailable      = errors.New("moodle file unavailable")
	ErrInvalidPlacement = errors.New("invalid course placement")
	errInvalidImage     = errors.New("invalid course image")
)

var tokens sync.Map

const (
	area            = "moodle"
	fileType        = "file"
	assetPrefix     = "asset-"
	coursePrefix    = "course-"
	downloadWorkers = 4
	keyBytes        = 16
	maxSemester     = 20
)

func Courses(userID int64) ([]Course, error) {
	return store.MoodleCourses(db.DB, userID)
}

func CourseWithContents(userID, courseID int64) (*CourseDetail, error) {
	course, err := store.MoodleCourseByID(db.DB, userID, courseID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	sections, err := store.MoodleContents(db.DB, userID, courseID)
	if err != nil {
		return nil, err
	}

	grades, err := store.MoodleGrades(db.DB, userID, &courseID)
	if err != nil {
		return nil, err
	}

	return &CourseDetail{Course: course, Sections: sections, Grades: grades}, nil
}

func Semesters(userID int64) ([]SemesterCourses, error) {
	courses, err := store.MoodleCourses(db.DB, userID)
	if err != nil {
		return nil, err
	}

	slices.SortStableFunc(courses, func(a, b Course) int {
		return cmp.Or(
			cmp.Compare(semesterRank(a.Placement.Semester), semesterRank(b.Placement.Semester)),
			customFirst(a.Placement.Custom, b.Placement.Custom),
			cmp.Compare(a.Placement.Position, b.Placement.Position),
			cmp.Compare(a.Position, b.Position),
		)
	})

	semesters := []SemesterCourses{}
	for _, c := range courses {
		last := len(semesters) - 1
		if last < 0 || semesters[last].Semester != c.Placement.Semester {
			semesters = append(semesters, SemesterCourses{Semester: c.Placement.Semester})
			last++
		}
		semesters[last].Courses = append(semesters[last].Courses, c)
	}

	return semesters, nil
}

func SetPlacements(userID int64, placements []Placement) error {
	courses, err := store.MoodleCourses(db.DB, userID)
	if err != nil {
		return err
	}

	known := make(map[int64]bool, len(courses))
	for _, c := range courses {
		known[c.ID] = true
	}

	for _, p := range placements {
		if !known[p.CourseID] {
			return ErrNotFound
		}
		if p.Semester < 0 || p.Semester > maxSemester || p.Position < 0 {
			return ErrInvalidPlacement
		}
	}

	return store.SetMoodlePlacements(db.DB, userID, placements)
}

func ResetPlacement(userID, courseID int64) error {
	return store.DeleteMoodlePlacement(db.DB, userID, courseID)
}

func ModuleByID(userID, moduleID int64) (*Module, error) {
	module, err := store.MoodleModuleByID(db.DB, userID, moduleID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}

	return module, err
}

func semesterRank(semester int) int {
	if semester == 0 {
		return maxSemester + 1
	}

	return semester
}

func customFirst(a, b bool) int {
	switch {
	case a == b:
		return 0
	case a:
		return -1
	default:
		return 1
	}
}

func GradesByCourse(userID int64) ([]CourseGrades, error) {
	courses, err := store.MoodleCourses(db.DB, userID)
	if err != nil {
		return nil, err
	}

	grades, err := store.MoodleGrades(db.DB, userID, nil)
	if err != nil {
		return nil, err
	}

	byCourse := map[int64][]Grade{}
	for _, g := range grades {
		byCourse[g.CourseID] = append(byCourse[g.CourseID], g)
	}

	result := []CourseGrades{}
	for _, c := range courses {
		if list := byCourse[c.ID]; len(list) > 0 {
			result = append(result, CourseGrades{ID: c.ID, Fullname: c.Fullname, Grades: list})
		}
	}

	return result, nil
}

func CourseImage(userID, courseID int64) (*Course, error) {
	course, err := store.MoodleCourseByID(db.DB, userID, courseID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && course.ImagePath == nil) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return course, nil
}

func FileByID(userID int64, id string) (*File, error) {
	file, err := store.MoodleFileByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if file.Path != nil {
		return file, nil
	}
	if file.Type != fileType {
		return nil, ErrNotFound
	}

	name := path.Join(storage.UserDir(userID, area), file.ID)
	if _, err := fetchLazily(userID, file.FileURL, name); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	if err := store.SetMoodleFilePath(db.DB, userID, file.ID, name); err != nil {
		return nil, err
	}

	file.Path = &name
	return file, nil
}

func AssetByID(userID int64, id string) (*Asset, error) {
	asset, err := store.MoodleAssetByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if asset.Path != nil {
		return asset, nil
	}

	name := path.Join(storage.UserDir(userID, area), assetPrefix+asset.ID)
	contentType, err := fetchLazily(userID, asset.URL, name)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	if err := store.SetMoodleAssetPath(db.DB, userID, asset.ID, name, contentType); err != nil {
		return nil, err
	}

	asset.Path, asset.Mimetype = &name, contentType
	return asset, nil
}

func cachedToken(userID int64) (string, error) {
	if _, err := connections.Login(userID, connections.Moodle); err != nil {
		tokens.Delete(userID)
		return "", err
	}
	if token, ok := tokens.Load(userID); ok {
		return token.(string), nil
	}

	return freshToken(userID)
}

func freshToken(userID int64) (string, error) {
	token, err := connections.MoodleToken(userID)
	if err != nil {
		tokens.Delete(userID)
		return "", err
	}

	tokens.Store(userID, token)
	return token, nil
}

func fetchLazily(userID int64, fileURL, name string) (string, error) {
	token, err := cachedToken(userID)
	if err != nil {
		return "", err
	}

	contentType, err := fetchTo(token, fileURL, name)
	if err == nil {
		return contentType, nil
	}

	token, retryErr := freshToken(userID)
	if retryErr != nil {
		return "", err
	}

	return fetchTo(token, fileURL, name)
}

func AssetName(asset *Asset) string {
	if u, err := url.Parse(asset.URL); err == nil {
		return path.Base(u.Path)
	}

	return asset.ID
}

func Sync(userID int64) error {
	token, err := freshToken(userID)
	if err != nil {
		return err
	}

	courses, err := moodlelib.GetCourses(connections.MoodleURL, token)
	if err != nil {
		return err
	}

	me, err := moodlelib.GetUserInfo(connections.MoodleURL, token)
	if err != nil {
		return err
	}

	oldFiles, err := store.MoodleFilesByOwner(db.DB, userID)
	if err != nil {
		return err
	}

	oldAssets, err := store.MoodleAssetsByOwner(db.DB, userID)
	if err != nil {
		return err
	}

	oldCourses, err := coursesByID(userID)
	if err != nil {
		return err
	}

	dir := storage.UserDir(userID, area)
	syncedAt := time.Now().UTC().Format(time.RFC3339)

	var snap store.MoodleSnapshot
	var sources []moduleSource
	var fileCourse []int64
	var pending, pendingContent []int

	for position, c := range courses {
		course := Course{
			ID:             int64(c.ID),
			Shortname:      c.Shortname,
			Fullname:       c.Fullname,
			Summary:        c.Summary,
			Category:       c.CategoryName,
			Semester:       c.Semester,
			SemesterNumber: c.SemesterNumber,
			IsCurrent:      c.IsCurrent,
			IsFavourite:    c.IsFavourite,
			StartDate:      c.StartDate,
			EndDate:        c.EndDate,
			ImageSource:    c.CourseImage,
			Position:       position,
			SyncedAt:       syncedAt,
		}
		syncImage(token, dir, &course, oldCourses[course.ID])
		snap.Courses = append(snap.Courses, course)

		sections, err := moodlelib.GetCourseContents(connections.MoodleURL, token, c.ID)
		if err != nil {
			return err
		}

		items, err := courseGrades(token, c.ID, me.UserID)
		if err != nil {
			return err
		}
		snap.Grades = append(snap.Grades, toGrades(course.ID, items)...)

		for sectionPosition, s := range sections {
			snap.Sections = append(snap.Sections, Section{
				ID:       int64(s.ID),
				CourseID: course.ID,
				Number:   s.Number,
				Name:     s.Name,
				Summary:  s.Summary,
				Position: sectionPosition,
			})

			for modulePosition, m := range s.Modules {
				snap.Modules = append(snap.Modules, store.MoodleModule{
					ID:           int64(m.ID),
					SectionID:    int64(s.ID),
					Name:         m.Name,
					Modname:      m.Modname,
					URL:          m.URL,
					Indent:       m.Indent,
					Description:  m.Description,
					Availability: m.AvailabilityInfo,
					Position:     modulePosition,
				})
				source := moduleSource{index: len(snap.Modules) - 1, courseID: course.ID, modname: m.Modname, contents: m.Contents}

				for filePosition, f := range m.Contents {
					if f.Type == structureType {
						continue
					}

					file := File{
						ID:           fileKey(m.ID, f.Fileurl),
						ModuleID:     int64(m.ID),
						Filename:     f.Filename,
						Filepath:     f.Filepath,
						Type:         f.Type,
						FileURL:      f.Fileurl,
						Mimetype:     f.Mimetype,
						Filesize:     int64(f.Filesize),
						TimeModified: f.TimeModified,
						Position:     filePosition,
					}

					old, known := oldFiles[file.ID]
					if known {
						file.Path = old.Path
					}
					fresh := known && old.Path != nil &&
						old.TimeModified == file.TimeModified && old.Filesize == file.Filesize

					snap.Files = append(snap.Files, file)
					fileCourse = append(fileCourse, course.ID)
					source.files = append(source.files, len(snap.Files)-1)
					switch {
					case file.Type != fileType || fresh:
					case (m.Modname == pageModule || m.Modname == bookModule) && file.Filename == indexFile:
						pendingContent = append(pendingContent, len(snap.Files)-1)
					default:
						pending = append(pending, len(snap.Files)-1)
					}
				}

				sources = append(sources, source)
			}
		}
	}

	parallel(len(pendingContent), func(k int) {
		downloadFile(token, dir, &snap.Files[pendingContent[k]])
	})

	collectors := make(map[int64]*collector, len(snap.Courses))
	for _, c := range snap.Courses {
		collectors[c.ID] = newCollector(c.ID, moodleHost(), oldAssets)
	}
	for i, f := range snap.Files {
		if f.Type == fileType {
			collectors[fileCourse[i]].addFile(f.FileURL, f.ID)
		}
	}

	for _, src := range sources {
		col := collectors[src.courseID]
		module := &snap.Modules[src.index]
		module.Content = buildContent(src, snap.Files, col)
		module.Description = col.rewrite(module.Description, nil)
		module.Availability = col.rewrite(module.Availability, nil)
	}
	for i := range snap.Sections {
		section := &snap.Sections[i]
		section.Summary = collectors[section.CourseID].rewrite(section.Summary, nil)
	}
	for i := range snap.Courses {
		course := &snap.Courses[i]
		course.Summary = collectors[course.ID].rewrite(course.Summary, nil)
	}

	assets := assetList(collectors)
	for _, asset := range assets {
		snap.Assets = append(snap.Assets, *asset)
	}

	if err := store.ReplaceMoodle(db.DB, userID, snap); err != nil {
		return err
	}

	parallel(len(pending), func(k int) {
		file := &snap.Files[pending[k]]
		if downloadFile(token, dir, file) {
			saveFilePath(userID, file)
		}
	})
	downloadAssets(userID, token, dir, assets)

	paths, err := store.MoodlePaths(db.DB, userID)
	if err != nil {
		return err
	}

	return storage.Prune(dir, paths)
}

func saveFilePath(userID int64, file *File) {
	if err := store.SetMoodleFilePath(db.DB, userID, file.ID, *file.Path); err != nil {
		slog.Warn("moodle: saving file path failed", "file", file.Filename, "err", err)
	}
}

func toGrades(courseID int64, items []moodlelib.GradeItem) []Grade {
	grades := make([]Grade, 0, len(items))
	for position, item := range items {
		grades = append(grades, Grade{
			ID:         int64(item.ID),
			CourseID:   courseID,
			Name:       item.ItemName,
			ItemType:   item.ItemType,
			ItemModule: item.ItemModule,
			Grade:      item.Grade,
			GradeMin:   item.GradeMin,
			GradeMax:   item.GradeMax,
			Passed:     item.GradePassed,
			Formatted:  item.GradeFormatted,
			Feedback:   item.Feedback,
			Position:   position,
		})
	}

	return grades
}

func courseGrades(token string, courseID, userID int) ([]moodlelib.GradeItem, error) {
	items, err := moodlelib.GetGrades(connections.MoodleURL, token, courseID, userID)
	if errors.Is(err, moodlelib.ErrAPI) {
		slog.Warn("moodle: grades unavailable", "course", courseID, "err", err)
		return nil, nil
	}

	return items, err
}

func coursesByID(userID int64) (map[int64]*Course, error) {
	courses, err := store.MoodleCourses(db.DB, userID)
	if err != nil {
		return nil, err
	}

	byID := make(map[int64]*Course, len(courses))
	for i := range courses {
		byID[courses[i].ID] = &courses[i]
	}

	return byID, nil
}

func moodleHost() string {
	u, err := url.Parse(connections.MoodleURL)
	if err != nil {
		return ""
	}

	return u.Host
}

func parallel(count int, fn func(int)) {
	queue := make(chan int)

	var wg sync.WaitGroup
	for range downloadWorkers {
		wg.Go(func() {
			for i := range queue {
				fn(i)
			}
		})
	}

	for i := range count {
		queue <- i
	}
	close(queue)
	wg.Wait()
}

func downloadFile(token, dir string, file *File) bool {
	name := path.Join(dir, file.ID)
	if _, err := fetchTo(token, file.FileURL, name); err != nil {
		slog.Warn("moodle: download failed", "file", file.Filename, "err", cause(err))
		return false
	}

	file.Path = &name
	return true
}

func assetList(collectors map[int64]*collector) []*Asset {
	var assets []*Asset
	for _, col := range collectors {
		for _, asset := range col.assets {
			assets = append(assets, asset)
		}
	}

	return assets
}

func downloadAssets(userID int64, token, dir string, assets []*Asset) {
	var pending []*Asset
	for _, asset := range assets {
		if asset.Path == nil {
			pending = append(pending, asset)
		}
	}

	parallel(len(pending), func(k int) {
		asset := pending[k]
		name := path.Join(dir, assetPrefix+asset.ID)

		contentType, err := fetchTo(token, asset.URL, name)
		if err != nil {
			slog.Warn("moodle: asset download failed", "asset", asset.ID, "err", cause(err))
			return
		}

		if err := store.SetMoodleAssetPath(db.DB, userID, asset.ID, name, contentType); err != nil {
			slog.Warn("moodle: saving asset path failed", "asset", asset.ID, "err", err)
		}
	})
}

func fetchTo(token, fileURL, name string) (string, error) {
	body, contentType, err := moodlelib.DownloadFile(token, fileURL)
	if err != nil {
		return "", err
	}
	defer body.Close()

	return contentType, storage.Write(name, body)
}

func syncImage(token, dir string, course *Course, old *Course) {
	if old != nil && old.ImagePath != nil {
		course.ImagePath, course.ImageType = old.ImagePath, old.ImageType
		if old.ImageSource == course.ImageSource {
			return
		}
	}
	if course.ImageSource == "" {
		course.ImagePath, course.ImageType = nil, ""
		return
	}

	data, imageType, err := imageBytes(token, course.ImageSource)
	if err != nil {
		slog.Warn("moodle: course image failed", "course", course.ID, "err", cause(err))
		return
	}

	name := path.Join(dir, coursePrefix+strconv.FormatInt(course.ID, 10))
	if err := storage.Write(name, bytes.NewReader(data)); err != nil {
		slog.Warn("moodle: course image write failed", "course", course.ID, "err", err)
		return
	}

	course.ImagePath, course.ImageType = &name, imageType
}

func imageBytes(token, source string) ([]byte, string, error) {
	rest, isData := strings.CutPrefix(source, "data:")
	if !isData {
		return moodlelib.FetchImageBytes(token, source)
	}

	meta, payload, ok := strings.Cut(rest, ",")
	if !ok {
		return nil, "", errInvalidImage
	}

	imageType, _, _ := strings.Cut(meta, ";")
	if strings.HasSuffix(meta, ";base64") {
		data, err := base64.StdEncoding.DecodeString(payload)
		return data, imageType, err
	}

	decoded, err := url.PathUnescape(payload)
	return []byte(decoded), imageType, err
}

func fileKey(moduleID int, fileURL string) string {
	sum := sha256.Sum256([]byte(strconv.Itoa(moduleID) + "\n" + fileURL))
	return hex.EncodeToString(sum[:keyBytes])
}

func cause(err error) error {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return urlErr.Err
	}

	return err
}
