package mail

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/email"
)

type Suggestion struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Source   string `json:"source"`
	Sent     int    `json:"sent"`
	Received int    `json:"received"`
}

const (
	sourceHistory     = "history"
	sourceDirectory   = "directory"
	DefaultSuggest    = 8
	MaxSuggest        = 50
	rankPool          = 200
	minDirectoryQuery = 3
	directoryTTL      = 10 * time.Minute
	maxDirectoryCache = 1000
	sentRole          = "sentitems"
	outboxRole        = "outbox"
	junkRole          = "junkemail"
)

var ErrQueryTooShort = errors.New("directory query too short")

var folding = strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss")

var likeEscaper = strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)

type directoryEntry struct {
	found []Suggestion
	at    time.Time
}

var (
	directoryMu    sync.Mutex
	directoryCache = map[string]directoryEntry{}
)

type contactBook map[string]*store.MailContact

func rebuildContacts(userID int64) error {
	sources, err := store.MailContactSources(db.DB, userID, []string{sentRole, outboxRole}, []string{draftsRole, junkRole})
	if err != nil {
		return err
	}

	book := contactBook{}
	for _, s := range sources {
		book.add(s.Name, s.Email, s.Sent, s.At)
	}

	return store.ReplaceMailContacts(db.DB, userID, book.list())
}

func (b contactBook) add(name, address string, sent bool, at string) {
	address = strings.ToLower(strings.TrimSpace(address))
	if !strings.Contains(address, "@") {
		return
	}

	c, ok := b[address]
	if !ok {
		c = &store.MailContact{Email: address}
		b[address] = c
	}
	if name = strings.TrimSpace(name); name != "" && (c.Name == "" || at > c.LastAt) {
		c.Name = name
	}
	if sent {
		c.Sent++
	} else {
		c.Received++
	}
	if at > c.LastAt {
		c.LastAt = at
	}
}

func (b contactBook) list() []store.MailContact {
	contacts := make([]store.MailContact, 0, len(b))
	for _, c := range b {
		c.Search = fold(c.Name + " " + c.Email)
		contacts = append(contacts, *c)
	}

	return contacts
}

func Suggest(userID int64, query string, limit int) ([]Suggestion, error) {
	if limit <= 0 || limit > MaxSuggest {
		limit = DefaultSuggest
	}

	needle := fold(strings.TrimSpace(query))
	pool, err := store.MailContactsMatching(db.DB, userID, "%"+likeEscaper.Replace(needle)+"%", rankPool)
	if err != nil {
		return nil, err
	}

	slices.SortStableFunc(pool, func(a, b store.MailContact) int {
		return rank(a.Search, needle) - rank(b.Search, needle)
	})

	suggestions := make([]Suggestion, 0, min(limit, len(pool)))
	for _, c := range pool[:min(limit, len(pool))] {
		suggestions = append(suggestions, Suggestion{Name: c.Name, Email: c.Email, Source: sourceHistory, Sent: c.Sent, Received: c.Received})
	}

	return suggestions, nil
}

func Directory(userID int64, query string) ([]Suggestion, error) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) < minDirectoryQuery {
		return nil, ErrQueryTooShort
	}

	key := fmt.Sprintf("%d\n%s", userID, fold(query))
	directoryMu.Lock()
	entry, ok := directoryCache[key]
	directoryMu.Unlock()
	if ok && time.Since(entry.at) < directoryTTL {
		return entry.found, nil
	}

	creds, err := connections.Login(userID, connections.Mail)
	if err != nil {
		return nil, err
	}

	found, err := email.ResolveNames(connections.MailServer, creds.Username, creds.Password, query)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	suggestions := make([]Suggestion, 0, len(found))
	for _, c := range found {
		suggestions = append(suggestions, Suggestion{Name: c.Name, Email: strings.ToLower(c.Email), Source: sourceDirectory})
	}

	directoryMu.Lock()
	if len(directoryCache) >= maxDirectoryCache {
		directoryCache = map[string]directoryEntry{}
	}
	directoryCache[key] = directoryEntry{found: suggestions, at: time.Now()}
	directoryMu.Unlock()

	return suggestions, nil
}

func rank(search, needle string) int {
	if needle == "" {
		return 0
	}

	for _, word := range strings.FieldsFunc(search, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if strings.HasPrefix(word, needle) {
			return 0
		}
	}
	if strings.HasPrefix(search, needle) {
		return 0
	}

	return 1
}

func fold(value string) string {
	return folding.Replace(strings.ToLower(value))
}
