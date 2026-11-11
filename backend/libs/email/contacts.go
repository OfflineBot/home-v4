package email

import (
	"encoding/xml"
	"fmt"
)

const noResults = "ErrorNameResolutionNoResults"

type resolveEnvelope struct {
	Body struct {
		Response struct {
			Messages []struct {
				ResponseClass string `xml:"ResponseClass,attr"`
				ResponseCode  string `xml:"ResponseCode"`
				MessageText   string `xml:"MessageText"`
				Resolutions   []struct {
					Mailbox ewsMailbox `xml:"Mailbox"`
				} `xml:"ResolutionSet>Resolution"`
			} `xml:"ResponseMessages>ResolveNamesResponseMessage"`
		} `xml:"ResolveNamesResponse"`
	} `xml:"Body"`
}

func ResolveNames(server, username, password, query string) ([]Contact, error) {
	c := newEWSClient(server, username, password)

	body, err := c.do(fmt.Sprintf(`
<m:ResolveNames ReturnFullContactData="false" SearchScope="ActiveDirectoryContacts">
  <m:UnresolvedEntry>%s</m:UnresolvedEntry>
</m:ResolveNames>`, xmlEscape(query)), "ResolveNames")
	if err != nil {
		return nil, err
	}

	var env resolveEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse ResolveNames response: %w", err)
	}
	if len(env.Body.Response.Messages) == 0 {
		return nil, fmt.Errorf("empty ResolveNames response")
	}

	msg := env.Body.Response.Messages[0]
	if msg.ResponseCode == noResults {
		return []Contact{}, nil
	}
	if msg.ResponseClass == "Error" {
		return nil, fmt.Errorf("ResolveNames failed: %s", msg.MessageText)
	}

	found := make([]Contact, 0, len(msg.Resolutions))
	for _, r := range msg.Resolutions {
		if r.Mailbox.EmailAddress != "" {
			found = append(found, Contact{Name: r.Mailbox.Name, Email: r.Mailbox.EmailAddress})
		}
	}

	return found, nil
}

func contacts(mbs []ewsMailbox) []Contact {
	out := make([]Contact, 0, len(mbs))
	for _, mb := range mbs {
		if mb.EmailAddress != "" {
			out = append(out, Contact{Name: mb.Name, Email: mb.EmailAddress})
		}
	}
	return out
}
