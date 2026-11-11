package moodle

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func FetchImageBytes(token, rawURL string) ([]byte, string, error) {
	imageURL := strings.Replace(rawURL, "/pluginfile.php/", "/webservice/pluginfile.php/", 1)
	sep := "?"
	if strings.Contains(imageURL, "?") {
		sep = "&"
	}
	resp, err := downloadClient.Get(imageURL + sep + "token=" + token)
	if err != nil {
		return nil, "", fmt.Errorf("image fetch failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("image server returned %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	imgData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("image read failed: %w", err)
	}
	return imgData, ct, nil
}

func GetCourseImageURL(baseURL, token string, courseID int) (string, error) {
	info, err := GetUserInfo(baseURL, token)
	if err != nil {
		return "", err
	}
	data, err := CallAPI(baseURL, token, "core_enrol_get_users_courses", url.Values{
		"userid": {strconv.Itoa(info.UserID)},
	})
	if err != nil {
		return "", err
	}
	var courses []struct {
		ID            int `json:"id"`
		OverviewFiles []struct {
			FileURL string `json:"fileurl"`
		} `json:"overviewfiles"`
		CourseImage string `json:"courseimage"`
	}
	if err := json.Unmarshal(data, &courses); err != nil {
		return "", fmt.Errorf("course list parse failed: %w", err)
	}
	for _, c := range courses {
		if c.ID != courseID {
			continue
		}
		if len(c.OverviewFiles) > 0 && c.OverviewFiles[0].FileURL != "" {
			return c.OverviewFiles[0].FileURL, nil
		}
		if c.CourseImage != "" {
			return c.CourseImage, nil
		}
		return "", fmt.Errorf("no course image found")
	}
	return "", fmt.Errorf("course %d not found in enrollment list", courseID)
}

func GetCourseImage(baseURL, token string, courseID int) ([]byte, string, error) {
	imageURL, err := GetCourseImageURL(baseURL, token, courseID)
	if err != nil {
		return nil, "", err
	}
	return FetchImageBytes(token, imageURL)
}
