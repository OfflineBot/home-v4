package email

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"regexp"
	"strings"

	"golang.org/x/net/html/charset"
)

func sanitizeUTF8(s string) string {
	if s == "" {
		return s
	}
	return strings.ToValidUTF8(s, "")
}

func decodeCharset(raw []byte, label string) string {
	label = strings.TrimSpace(strings.ToLower(label))
	if label == "" || label == "utf-8" || label == "utf8" || label == "us-ascii" || label == "ascii" {
		return sanitizeUTF8(string(raw))
	}
	enc, _ := charset.Lookup(label)
	if enc == nil {
		slog.Warn("mail: charset decode fallback", "charset", label, "reason", "unknown label")
		return sanitizeUTF8(string(raw))
	}
	decoded, err := io.ReadAll(enc.NewDecoder().Reader(bytes.NewReader(raw)))
	if err != nil {
		slog.Warn("mail: charset decode fallback", "charset", label, "err", err)
		return sanitizeUTF8(string(raw))
	}
	return sanitizeUTF8(string(decoded))
}

func replaceCIDsWithDataURLs(htmlBody, rawMIMEBase64 string) string {
	raw, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(rawMIMEBase64), ""))
	if err != nil {
		return htmlBody
	}

	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return htmlBody
	}

	cidMap := make(map[string]string)
	walkMIMEParts(textproto.MIMEHeader(msg.Header), msg.Body, cidMap)

	slog.Debug("mail: replaceCIDsWithDataURLs", "cids_found", len(cidMap))
	if len(cidMap) == 0 {
		return htmlBody
	}

	result := htmlBody
	replaced := 0
	for cid, dataURL := range cidMap {
		before := result
		result = strings.ReplaceAll(result, "cid:"+cid, dataURL)
		if result != before {
			replaced++
		}
	}
	slog.Debug("mail: replaceCIDsWithDataURLs — done", "cids_replaced", replaced, "cids_found", len(cidMap))
	return result
}

func walkMIMEParts(header textproto.MIMEHeader, body io.Reader, cidMap map[string]string) {
	ct := header.Get("Content-Type")
	if ct == "" {
		ct = "text/plain"
	}
	mediaType, params, err := mime.ParseMediaType(ct)
	if err != nil {
		return
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(body, params["boundary"])
		for {
			part, err := mr.NextPart()
			if err != nil {
				break
			}
			walkMIMEParts(textproto.MIMEHeader(part.Header), part, cidMap)
		}
		return
	}

	contentID := strings.Trim(header.Get("Content-Id"), "<>")
	if contentID == "" {
		return
	}

	raw, err := io.ReadAll(body)
	if err != nil {
		return
	}

	var decoded []byte
	switch strings.ToLower(strings.TrimSpace(header.Get("Content-Transfer-Encoding"))) {
	case "base64":
		decoded, err = base64.StdEncoding.DecodeString(strings.Join(strings.Fields(string(raw)), ""))
		if err != nil {
			return
		}
	case "quoted-printable":
		decoded, err = io.ReadAll(quotedprintable.NewReader(bytes.NewReader(raw)))
		if err != nil {
			return
		}
	default:
		decoded = raw
	}

	cidMap[contentID] = fmt.Sprintf("data:%s;base64,%s",
		mediaType, base64.StdEncoding.EncodeToString(decoded))
}

func ExtractPlainTextFromMIME(rawMIMEBase64 string) string {
	if rawMIMEBase64 == "" {
		return ""
	}
	raw, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(rawMIMEBase64), ""))
	if err != nil {
		return ""
	}
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return ""
	}
	return findPlainPart(textproto.MIMEHeader(msg.Header), msg.Body)
}

func findPlainPart(header textproto.MIMEHeader, body io.Reader) string {
	ct := header.Get("Content-Type")
	if ct == "" {
		ct = "text/plain"
	}
	mediaType, params, err := mime.ParseMediaType(ct)
	if err != nil {
		return ""
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		mr := multipart.NewReader(body, params["boundary"])
		for {
			part, err := mr.NextPart()
			if err != nil {
				return ""
			}
			if s := findPlainPart(textproto.MIMEHeader(part.Header), part); s != "" {
				return s
			}
		}
	}

	if mediaType != "text/plain" {
		return ""
	}
	disposition := strings.ToLower(header.Get("Content-Disposition"))
	if strings.HasPrefix(disposition, "attachment") {
		return ""
	}

	raw, err := io.ReadAll(body)
	if err != nil {
		return ""
	}
	var decoded []byte
	switch strings.ToLower(strings.TrimSpace(header.Get("Content-Transfer-Encoding"))) {
	case "base64":
		decoded, err = base64.StdEncoding.DecodeString(strings.Join(strings.Fields(string(raw)), ""))
		if err != nil {
			return ""
		}
	case "quoted-printable":
		decoded, err = io.ReadAll(quotedprintable.NewReader(bytes.NewReader(raw)))
		if err != nil {
			return ""
		}
	default:
		decoded = raw
	}
	return decodeCharset(decoded, params["charset"])
}

var reListUnsubHTTP = regexp.MustCompile(`<(https?://[^>]+)>`)

var reListUnsubMailto = regexp.MustCompile(`<(mailto:[^>]+)>`)

func ParseListUnsubscribe(rawMIMEBase64 string) string {
	if rawMIMEBase64 == "" {
		return ""
	}
	raw, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(rawMIMEBase64), ""))
	if err != nil {
		return ""
	}

	headers := string(raw)
	if idx := strings.Index(headers, "\r\n\r\n"); idx != -1 {
		headers = headers[:idx]
	} else if idx := strings.Index(headers, "\n\n"); idx != -1 {
		headers = headers[:idx]
	}

	unfolded := strings.ReplaceAll(headers, "\r\n ", " ")
	unfolded = strings.ReplaceAll(unfolded, "\r\n\t", " ")
	unfolded = strings.ReplaceAll(unfolded, "\n ", " ")
	unfolded = strings.ReplaceAll(unfolded, "\n\t", " ")

	var headerVal string
	for _, line := range strings.Split(unfolded, "\n") {
		if strings.HasPrefix(strings.ToLower(line), "list-unsubscribe:") {
			headerVal = strings.TrimSpace(line[len("list-unsubscribe:"):])
			break
		}
	}
	if headerVal == "" {
		return ""
	}
	if m := reListUnsubHTTP.FindStringSubmatch(headerVal); len(m) >= 2 {
		return m[1]
	}
	if m := reListUnsubMailto.FindStringSubmatch(headerVal); len(m) >= 2 {
		return m[1]
	}
	return ""
}
