package moodle

import (
	"encoding/json"
	"net/url"
	"strconv"
)

type GradeItem struct {
	ID             int      `json:"id"`
	ItemName       string   `json:"itemname"`
	ItemType       string   `json:"itemtype"`
	ItemModule     string   `json:"itemmodule"`
	Grade          *float64 `json:"graderaw"`
	GradeMin       float64  `json:"grademin"`
	GradeMax       float64  `json:"grademax"`
	GradePassed    *bool    `json:"gradepassed"`
	Feedback       string   `json:"feedback"`
	GradeFormatted string   `json:"gradeformatted"`
}

func GetGrades(baseURL, token string, courseID, userID int) ([]GradeItem, error) {
	body, err := CallAPI(baseURL, token, "gradereport_user_get_grade_items", url.Values{
		"courseid": {strconv.Itoa(courseID)},
		"userid":   {strconv.Itoa(userID)},
	})
	if err != nil {
		return nil, err
	}

	var resp struct {
		UserGrades []struct {
			GradeItems []GradeItem `json:"gradeitems"`
		} `json:"usergrades"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if len(resp.UserGrades) == 0 {
		return []GradeItem{}, nil
	}

	return resp.UserGrades[0].GradeItems, nil
}
