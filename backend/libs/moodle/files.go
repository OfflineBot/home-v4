package moodle

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var ErrAuthFailed = errors.New("Moodle token invalid")

var ErrAPI = errors.New("moodle API error")

type Course struct {
	ID             int      `json:"id"`
	Shortname      string   `json:"shortname"`
	Fullname       string   `json:"fullname"`
	Summary        string   `json:"summary"`
	CategoryName   string   `json:"categoryname"`
	CategoryID     int      `json:"category"`
	StartDate      int64    `json:"startdate"`
	EndDate        int64    `json:"enddate"`
	TimeModified   int64    `json:"timemodified"`
	Hidden         bool     `json:"hidden"`
	IsFavourite    bool     `json:"isfavourite"`
	Visible        int      `json:"visible"`
	Progress       *float64 `json:"progress"`
	Completed      *bool    `json:"completed"`
	LastAccess     *int64   `json:"lastaccess"`
	CourseImage    string   `json:"courseimage"`
	Semester       string   `json:"semester"`
	SemesterNumber int      `json:"semester_number"`
	IsCurrent      bool     `json:"is_current"`
}

type File struct {
	Filename     string `json:"filename"`
	Filepath     string `json:"filepath"`
	Fileurl      string `json:"fileurl"`
	Filesize     int    `json:"filesize"`
	Mimetype     string `json:"mimetype"`
	TimeCreated  int64  `json:"timecreated"`
	TimeModified int64  `json:"timemodified"`
	Type         string `json:"type"`
	Content      string `json:"content"`
}

type Section struct {
	ID      int      `json:"id"`
	Number  int      `json:"section"`
	Name    string   `json:"name"`
	Summary string   `json:"summary"`
	Modules []Module `json:"modules"`
}

type Module struct {
	ID               int    `json:"id"`
	URL              string `json:"url"`
	Name             string `json:"name"`
	Modname          string `json:"modname"`
	Indent           int    `json:"indent"`
	Description      string `json:"description"`
	AvailabilityInfo string `json:"availabilityinfo"`
	Contents         []File `json:"contents"`
}

func DeriveSemester(startDate int64) string {
	if startDate == 0 {
		return ""
	}
	t := time.Unix(startDate, 0)
	month, year := t.Month(), t.Year()
	if month >= 10 {
		return fmt.Sprintf("WiSe %d/%d", year, year+1)
	}
	if month <= 3 {
		return fmt.Sprintf("WiSe %d/%d", year-1, year)
	}
	return fmt.Sprintf("SoSe %d", year)
}

func DeriveSemesterNumber(categoryName string, startDate int64) int {

	if re := regexp.MustCompile(`(\d+)\.\s*Studienjahr`); re.MatchString(categoryName) {
		m := re.FindStringSubmatch(categoryName)
		year, _ := strconv.Atoi(m[1])
		if year < 1 || year > 3 {
			return 0
		}

		if startDate != 0 {
			month := time.Unix(startDate, 0).Month()
			if month >= 10 || month <= 3 {
				return 2*(year-1) + 1
			}
			return 2 * year
		}
		return 2*(year-1) + 1
	}

	re := regexp.MustCompile(`(\d+)\.\s*[Ss]emester|[Ss]emester\s*(\d+)`)
	m := re.FindStringSubmatch(categoryName)
	if len(m) < 2 {
		return 0
	}
	for _, g := range m[1:] {
		if g != "" {
			n, _ := strconv.Atoi(g)
			if n >= 1 && n <= 6 {
				return n
			}
		}
	}
	return 0
}

func fetchCategoryNames(baseURL, token string, catIDs map[int]struct{}) map[int]string {
	result := map[int]string{}
	if len(catIDs) == 0 {
		return result
	}
	params := url.Values{}
	i := 0
	for id := range catIDs {
		params.Set(fmt.Sprintf("criteria[%d][key]", i), "id")
		params.Set(fmt.Sprintf("criteria[%d][value]", i), strconv.Itoa(id))
		i++
	}
	data, err := CallAPI(baseURL, token, "core_course_get_categories", params)
	if err != nil {
		return result
	}
	var cats []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	if json.Unmarshal(data, &cats) != nil {
		return result
	}
	for _, c := range cats {
		result[c.ID] = c.Name
	}
	return result
}

func DocTypeFromMime(mime string) string {
	switch {
	case strings.Contains(mime, "pdf"):
		return "pdf"
	case strings.Contains(mime, "presentation") || strings.Contains(mime, "powerpoint"):
		return "pptx"
	case strings.Contains(mime, "word") || strings.Contains(mime, "document"):
		return "docx"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.Contains(mime, "zip") || strings.Contains(mime, "compressed"):
		return "archive"
	default:
		return "other"
	}
}

var apiClient = &http.Client{Timeout: 60 * time.Second}

var downloadClient = &http.Client{Timeout: 10 * time.Minute}

func CallAPI(baseURL, token, function string, params url.Values) ([]byte, error) {
	params.Set("wstoken", token)
	params.Set("wsfunction", function)
	params.Set("moodlewsrestformat", "json")

	resp, err := apiClient.PostForm(baseURL+"/webservice/rest/server.php", params)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %w", err)
	}

	var apiErr struct {
		Exception string `json:"exception"`
		ErrorCode string `json:"errorcode"`
		Message   string `json:"message"`
	}
	if json.Unmarshal(body, &apiErr) == nil && apiErr.Exception != "" {
		if apiErr.ErrorCode == "invalidtoken" || apiErr.ErrorCode == "accessdenied" {
			return nil, fmt.Errorf("moodle token invalid: %w", ErrAuthFailed)
		}
		return nil, fmt.Errorf("%w (%s): %s", ErrAPI, apiErr.ErrorCode, apiErr.Message)
	}

	return body, nil
}

type UserInfo struct {
	UserID    int    `json:"userid"`
	FullName  string `json:"fullname"`
	FirstName string `json:"firstname"`
	LastName  string `json:"lastname"`
}

func GetUserInfo(baseURL, token string) (*UserInfo, error) {
	body, err := CallAPI(baseURL, token, "core_webservice_get_site_info", url.Values{})
	if err != nil {
		return nil, err
	}
	var info UserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("userinfo parse failed: %w", err)
	}
	return &info, nil
}

func GetCourses(baseURL, token string) ([]Course, error) {
	info, err := GetUserInfo(baseURL, token)
	if err != nil {
		return nil, err
	}

	body, err := CallAPI(baseURL, token, "core_enrol_get_users_courses", url.Values{
		"userid": {strconv.Itoa(info.UserID)},
	})
	if err != nil {
		return nil, err
	}

	var courses []Course
	if err := json.Unmarshal(body, &courses); err != nil {
		return nil, fmt.Errorf("course parse failed: %w", err)
	}

	catIDs := map[int]struct{}{}
	for _, c := range courses {
		if c.CategoryID != 0 {
			catIDs[c.CategoryID] = struct{}{}
		}
	}
	catNames := fetchCategoryNames(baseURL, token, catIDs)

	now := time.Now().Unix()
	for i := range courses {
		if courses[i].CategoryName == "" {
			courses[i].CategoryName = catNames[courses[i].CategoryID]
		}
		courses[i].Semester = DeriveSemester(courses[i].StartDate)
		courses[i].SemesterNumber = DeriveSemesterNumber(catNames[courses[i].CategoryID], courses[i].StartDate)
		courses[i].IsCurrent = courses[i].EndDate == 0 || courses[i].EndDate > now
	}
	return courses, nil
}

func GetCourseContents(baseURL, token string, courseID int) ([]Section, error) {
	body, err := CallAPI(baseURL, token, "core_course_get_contents", url.Values{
		"courseid": {strconv.Itoa(courseID)},
	})
	if err != nil {
		return nil, err
	}

	var sections []Section
	if err := json.Unmarshal(body, &sections); err != nil {
		return nil, fmt.Errorf("content parse failed: %w", err)
	}
	return sections, nil
}

func GetCourseFiles(baseURL, token string, courseID int) ([]File, error) {
	sections, err := GetCourseContents(baseURL, token, courseID)
	if err != nil {
		return nil, err
	}

	var files []File
	for _, section := range sections {
		for _, mod := range section.Modules {
			for _, f := range mod.Contents {
				if f.Fileurl != "" {
					files = append(files, f)
				}
			}
		}
	}
	return files, nil
}

func DownloadFile(token, fileURL string) (io.ReadCloser, string, error) {

	sep := "?"
	for _, c := range fileURL {
		if c == '?' {
			sep = "&"
			break
		}
	}
	fullURL := fileURL + sep + "token=" + token

	resp, err := downloadClient.Get(fullURL)
	if err != nil {
		return nil, "", fmt.Errorf("download failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, "", fmt.Errorf("server responds with status %d", resp.StatusCode)
	}
	return resp.Body, resp.Header.Get("Content-Type"), nil
}
