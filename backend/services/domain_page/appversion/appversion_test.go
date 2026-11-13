package appversion

import "testing"

func TestNewerPrefersHigherVersion(t *testing.T) {
	cases := []struct {
		name  string
		parts [4]int
		ok    bool
	}{
		{"home-v4-1.4.0.apk", [4]int{1, 4, 0, 0}, true},
		{"home-v4-1.3.2+6.apk", [4]int{1, 3, 2, 6}, true},
		{"home-v4.apk", [4]int{}, false},
	}

	for _, c := range cases {
		parts, ok := parse(c.name)
		if ok != c.ok || parts != c.parts {
			t.Errorf("parse(%q) = %v, %v; want %v, %v", c.name, parts, ok, c.parts, c.ok)
		}
	}

	if !newer([4]int{1, 4, 0, 0}, [4]int{1, 3, 2, 6}) {
		t.Error("1.4.0 should beat 1.3.2+6")
	}
	if newer([4]int{1, 3, 2, 6}, [4]int{1, 3, 2, 6}) {
		t.Error("the same version is not newer")
	}
	if !newer([4]int{1, 3, 2, 7}, [4]int{1, 3, 2, 6}) {
		t.Error("a higher build should win")
	}
}
