package moodle

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/url"
	"path"
	"slices"
	"strconv"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"home-v4/backend/services/storage"
	store "home-v4/backend/store/domain_page"
	moodlelib "home-v4/libs/moodle"
)

const (
	FilesRoute     = "/api/moodle/files/"
	AssetsRoute    = "/api/moodle/assets/"
	pluginfilePath = "/pluginfile.php/"
	webservicePath = "/webservice/pluginfile.php/"
	indexFile      = "index.html"
	pageModule     = "page"
	bookModule     = "book"
	structureType  = "content"
	maxHTMLBytes   = 8 << 20
	itemSegment    = 3
	maxHeading     = 6
	baseHeading    = 2
)

var urlAttributes = []string{"src", "href", "data", "poster"}

type collector struct {
	courseID  int64
	host      string
	files     map[string]string
	loose     map[string]string
	ambiguous map[string]bool
	assets    map[string]*store.MoodleAsset
	old       map[string]store.MoodleAsset
}

type moduleSource struct {
	index    int
	courseID int64
	modname  string
	files    []int
	contents []moodlelib.File
}

type chapter struct {
	Title    string    `json:"title"`
	Href     string    `json:"href"`
	Level    int       `json:"level"`
	Subitems []chapter `json:"subitems"`
}

func newCollector(courseID int64, host string, old map[string]store.MoodleAsset) *collector {
	return &collector{
		courseID:  courseID,
		host:      host,
		files:     map[string]string{},
		loose:     map[string]string{},
		ambiguous: map[string]bool{},
		assets:    map[string]*store.MoodleAsset{},
		old:       old,
	}
}

func (c *collector) addFile(fileURL, id string) {
	u, err := url.Parse(fileURL)
	if err != nil {
		return
	}

	c.files[normalize(u)] = id

	key := looseKey(u)
	if existing, ok := c.loose[key]; ok && existing != id {
		c.ambiguous[key] = true
		return
	}
	c.loose[key] = id
}

func (c *collector) lookup(u *url.URL) (string, bool) {
	if id, ok := c.files[normalize(u)]; ok {
		return id, true
	}

	key := looseKey(u)
	if id, ok := c.loose[key]; ok && !c.ambiguous[key] {
		return id, true
	}

	return "", false
}

func (c *collector) rewrite(fragment string, base *url.URL) string {
	if fragment == "" || (base == nil && !strings.Contains(fragment, pluginfilePath)) {
		return fragment
	}

	context := &html.Node{Type: html.ElementNode, Data: "body", DataAtom: atom.Body}
	nodes, err := html.ParseFragment(strings.NewReader(fragment), context)
	if err != nil {
		return fragment
	}

	changed := false
	for _, n := range nodes {
		changed = c.walk(n, base) || changed
	}
	if !changed {
		return fragment
	}

	var out strings.Builder
	for _, n := range nodes {
		if err := html.Render(&out, n); err != nil {
			return fragment
		}
	}

	return out.String()
}

func (c *collector) walk(n *html.Node, base *url.URL) bool {
	changed := false

	if n.Type == html.ElementNode {
		for i, attr := range n.Attr {
			if !slices.Contains(urlAttributes, attr.Key) {
				continue
			}
			if target, ok := c.resolve(attr.Val, base); ok {
				n.Attr[i].Val = target
				changed = true
			}
		}
	}

	for child := n.FirstChild; child != nil; child = child.NextSibling {
		changed = c.walk(child, base) || changed
	}

	return changed
}

func (c *collector) resolve(raw string, base *url.URL) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "#") {
		return "", false
	}

	ref, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	if base != nil {
		ref = base.ResolveReference(ref)
	}
	if (ref.Scheme != "http" && ref.Scheme != "https") || ref.Host != c.host || !strings.Contains(ref.Path, pluginfilePath) {
		return "", false
	}

	if id, ok := c.lookup(ref); ok {
		return FilesRoute + id, true
	}

	id := assetKey(c.courseID, normalize(ref))
	if _, ok := c.assets[id]; !ok {
		asset := &store.MoodleAsset{ID: id, CourseID: c.courseID, URL: downloadURL(ref)}
		if old, ok := c.old[id]; ok && old.Path != nil {
			asset.Path, asset.Mimetype = old.Path, old.Mimetype
		}
		c.assets[id] = asset
	}

	return AssetsRoute + id, true
}

func buildContent(src moduleSource, files []File, col *collector) string {
	var content string

	switch src.modname {
	case pageModule:
		for _, i := range src.files {
			if files[i].Filename == indexFile && files[i].Filepath == "/" {
				content = renderFile(files[i], col)
				break
			}
		}
	case bookModule:
		var out strings.Builder
		for _, ch := range bookChapters(src.contents) {
			i, ok := chapterFile(src.files, files, ch.Href)
			if !ok {
				continue
			}
			level := min(baseHeading+ch.Level, maxHeading)
			out.WriteString("<h" + strconv.Itoa(level) + ">" + html.EscapeString(ch.Title) + "</h" + strconv.Itoa(level) + ">")
			out.WriteString(renderFile(files[i], col))
		}
		content = out.String()
	default:
		return ""
	}

	for _, i := range src.files {
		if files[i].Filename == indexFile || strings.Contains(content, FilesRoute+files[i].ID) {
			files[i].Embedded = true
		}
	}

	return content
}

func bookChapters(contents []moodlelib.File) []chapter {
	for _, f := range contents {
		if f.Type != structureType {
			continue
		}

		var tree []chapter
		if err := json.Unmarshal([]byte(f.Content), &tree); err != nil {
			continue
		}

		var flat []chapter
		var walk func([]chapter)
		walk = func(list []chapter) {
			for _, ch := range list {
				flat = append(flat, ch)
				walk(ch.Subitems)
			}
		}
		walk(tree)
		return flat
	}

	return nil
}

func chapterFile(indices []int, files []File, href string) (int, bool) {
	dir := path.Dir(strings.Trim(href, "/"))
	for _, i := range indices {
		if files[i].Filename == indexFile && strings.Trim(files[i].Filepath, "/") == dir {
			return i, true
		}
	}

	return 0, false
}

func renderFile(file File, col *collector) string {
	if file.Path == nil {
		return ""
	}

	f, err := storage.Open(*file.Path)
	if err != nil {
		return ""
	}
	defer f.Close()

	raw, err := io.ReadAll(io.LimitReader(f, maxHTMLBytes))
	if err != nil {
		return ""
	}

	base, err := url.Parse(file.FileURL)
	if err != nil {
		return col.rewrite(string(raw), nil)
	}

	return col.rewrite(string(raw), base)
}

func normalize(u *url.URL) string {
	return u.Host + strings.Replace(u.Path, webservicePath, pluginfilePath, 1)
}

func looseKey(u *url.URL) string {
	path := strings.Replace(u.Path, webservicePath, pluginfilePath, 1)
	head, tail, ok := strings.Cut(path, pluginfilePath)
	if !ok {
		return u.Host + path
	}

	segments := strings.Split(tail, "/")
	if len(segments) > itemSegment+1 && isNumber(segments[itemSegment]) {
		segments = append(segments[:itemSegment], segments[itemSegment+1:]...)
	}

	return u.Host + head + pluginfilePath + strings.Join(segments, "/")
}

func isNumber(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func downloadURL(u *url.URL) string {
	clean := *u
	clean.Fragment = ""

	query := clean.Query()
	query.Del("token")
	clean.RawQuery = query.Encode()

	if !strings.Contains(clean.Path, webservicePath) {
		clean.Path = strings.Replace(clean.Path, pluginfilePath, webservicePath, 1)
		clean.RawPath = ""
	}

	return clean.String()
}

func assetKey(courseID int64, key string) string {
	sum := sha256.Sum256([]byte(strconv.FormatInt(courseID, 10) + "\n" + key))
	return hex.EncodeToString(sum[:keyBytes])
}
