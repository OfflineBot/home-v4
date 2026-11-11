package dualis

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const requestTimeout = 30 * time.Second

var ErrAuthFailed = errors.New("Dualis authentication failed")

var reRefreshURL = regexp.MustCompile(`(?i)URL=(\S+)`)

var BaseURL = "https://dualis.dhbw.de/scripts/mgrqispi.dll"

var reToken = regexp.MustCompile(`-N(\d{15,})`)

type Session struct {
	client *http.Client
	Token  string
}

func Login(username, password string) (*Session, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Jar: jar, Timeout: requestTimeout}

	form := url.Values{
		"usrname":   {username},
		"pass":      {password},
		"APPNAME":   {"CampusNet"},
		"PRGNAME":   {"LOGINCHECK"},
		"ARGUMENTS": {"clino,usrname,pass,menuno,menu_type,browser,platform"},
		"clino":     {"000000000000001"},
		"menuno":    {"000324"},
		"menu_type": {"classic"},
		"browser":   {""},
		"platform":  {""},
	}

	resp, err := client.PostForm(BaseURL, form)
	if err != nil {
		return nil, fmt.Errorf("login request failed: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("login failed — status %d (check credentials)", resp.StatusCode)
	}

	refresh := resp.Header.Get("Refresh")
	if refresh == "" {
		return nil, fmt.Errorf("credentials incorrect: %w", ErrAuthFailed)
	}
	m := reRefreshURL.FindStringSubmatch(refresh)
	if len(m) < 2 {
		return nil, fmt.Errorf("login failed — cannot parse Refresh URL: %s", refresh)
	}
	refreshURL := m[1]
	token := extractToken(refreshURL)
	if token == "" {
		return nil, fmt.Errorf("login failed — no session token in Refresh URL: %s", refreshURL)
	}

	if !strings.HasPrefix(refreshURL, "http") {
		if base, err := url.Parse(BaseURL); err == nil {
			refreshURL = base.Scheme + "://" + base.Host + refreshURL
		}
	}
	finalResp, err := client.Get(refreshURL)
	if err == nil {
		finalResp.Body.Close()
	}

	return &Session{client: client, Token: token}, nil
}

func (s *Session) buildURL(prgname string, extraArgs ...string) string {
	args := "-N" + s.Token + ",-N000307,"
	if len(extraArgs) > 0 {
		args = strings.Join(extraArgs, ",")
	}
	return fmt.Sprintf("%s?APPNAME=CampusNet&PRGNAME=%s&ARGUMENTS=%s", BaseURL, prgname, args)
}

func (s *Session) get(rawURL string) (*http.Response, error) {
	resp, err := s.client.Get(rawURL)
	if err != nil {
		return nil, fmt.Errorf("request to %s failed: %w", rawURL, err)
	}
	return resp, nil
}

func extractToken(s string) string {
	m := reToken.FindStringSubmatch(s)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}
