package dualis

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var dhbw100Scale = []struct {
	minPercent float64
	grade      float64
}{
	{98.5, 1.0},
	{97.0, 1.1},
	{95.5, 1.2},
	{93.5, 1.3},
	{92.0, 1.4},
	{90.5, 1.5},
	{88.5, 1.6},
	{87.0, 1.7},
	{85.5, 1.8},
	{83.5, 1.9},
	{82.0, 2.0},
	{80.5, 2.1},
	{78.5, 2.2},
	{77.0, 2.3},
	{75.5, 2.4},
	{73.5, 2.5},
	{72.0, 2.6},
	{70.5, 2.7},
	{68.5, 2.8},
	{67.0, 2.9},
	{65.5, 3.0},
	{63.5, 3.1},
	{62.0, 3.2},
	{60.5, 3.3},
	{58.5, 3.4},
	{57.0, 3.5},
	{55.5, 3.6},
	{53.5, 3.7},
	{52.0, 3.8},
	{50.5, 3.9},
	{50.0, 4.0},
	{47.0, 4.1},
	{45.5, 4.2},
	{43.5, 4.3},
	{42.0, 4.4},
	{40.5, 4.5},
	{38.5, 4.6},
	{37.0, 4.7},
	{35.5, 4.8},
	{33.5, 4.9},
	{0.0, 5.0},
}

func PercentToGrade(percent float64) float64 {
	if percent < 0 {
		percent = 0
	}
	for _, step := range dhbw100Scale {
		if percent >= step.minPercent {
			return step.grade
		}
	}
	return 5.0
}

var reComponentPoints = regexp.MustCompile(`(?i)\b(\d+(?:[.,]\d+)?)\s*P\b`)

func componentPoints(name string) float64 {
	m := reComponentPoints.FindStringSubmatch(name)
	if len(m) < 2 {
		return 0
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64)
	if err != nil {
		return 0
	}
	return v
}

func componentScore(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" {
		return 0, false
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(s, ",", "."), 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func ComponentsPreliminaryGrade(components []ExamComponent) (grade, percent, totalMax, achieved float64, ok bool) {
	for _, c := range components {
		w := componentPoints(c.Name)
		if w <= 0 {
			continue
		}
		s, hasScore := componentScore(c.Score)
		if !hasScore {
			continue
		}
		totalMax += w
		achieved += s
	}
	if totalMax <= 0 {
		return 0, 0, 0, 0, false
	}
	percent = achieved / totalMax * 100
	grade = PercentToGrade(percent)
	return grade, percent, totalMax, achieved, true
}

func FormatGrade(g float64) string {
	return strings.Replace(fmt.Sprintf("%.1f", g), ".", ",", 1)
}
