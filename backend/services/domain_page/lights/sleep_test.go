package lights

import "testing"

func TestSleepDurationIsBounded(t *testing.T) {
	for _, minutes := range []int{0, -5, 256, 1000} {
		if _, err := StartSleep(1, minutes, true); err != ErrInvalidSleep {
			t.Errorf("StartSleep(%d) = %v; want ErrInvalidSleep", minutes, err)
		}
	}
}
