package email

import (
	"encoding/xml"
	"fmt"
	"strings"
)

const (
	mailFolderClass = "IPF.Note"
	searchFolderTag = "SearchFolder"
	maxFolders      = 1000
)

var folderRoleIDs = []string{"inbox", "drafts", "sentitems", "deleteditems", "junkemail", "outbox"}

type Folder struct {
	ID       string `json:"id"`
	ParentID string `json:"parent_id"`
	Name     string `json:"name"`
	Class    string `json:"class"`
	Role     string `json:"role"`
	Total    int    `json:"total"`
	Unread   int    `json:"unread"`
}

type ewsFolderSet struct {
	Folders []ewsFolderInfo `xml:",any"`
}

type ewsFolderInfo struct {
	XMLName     xml.Name
	FolderID    ewsItemID `xml:"FolderId"`
	ParentID    ewsItemID `xml:"ParentFolderId"`
	Class       string    `xml:"FolderClass"`
	Name        string    `xml:"DisplayName"`
	TotalCount  int       `xml:"TotalCount"`
	UnreadCount int       `xml:"UnreadCount"`
}

type findFolderEnvelope struct {
	Body struct {
		Response struct {
			Messages []struct {
				ResponseClass string       `xml:"ResponseClass,attr"`
				MessageText   string       `xml:"MessageText"`
				Folders       ewsFolderSet `xml:"RootFolder>Folders"`
			} `xml:"ResponseMessages>FindFolderResponseMessage"`
		} `xml:"FindFolderResponse"`
	} `xml:"Body"`
}

type folderIDsEnvelope struct {
	Body struct {
		Response struct {
			Messages []struct {
				ResponseClass string       `xml:"ResponseClass,attr"`
				Folders       ewsFolderSet `xml:"Folders"`
			} `xml:"ResponseMessages>GetFolderResponseMessage"`
		} `xml:"GetFolderResponse"`
	} `xml:"Body"`
}

func GetFolders(server, username, password string) ([]Folder, error) {
	c := newEWSClient(server, username, password)

	roles, err := c.folderRoles()
	if err != nil {
		return nil, err
	}

	body, err := c.do(fmt.Sprintf(`
<m:FindFolder Traversal="Deep">
  <m:FolderShape>
    <t:BaseShape>AllProperties</t:BaseShape>
  </m:FolderShape>
  <m:IndexedPageFolderView MaxEntriesReturned="%d" Offset="0" BasePoint="Beginning"/>
  <m:ParentFolderIds>
    <t:DistinguishedFolderId Id="msgfolderroot"/>
  </m:ParentFolderIds>
</m:FindFolder>`, maxFolders), "FindFolder")
	if err != nil {
		return nil, err
	}

	var env findFolderEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse FindFolder response: %w", err)
	}
	if len(env.Body.Response.Messages) == 0 {
		return nil, fmt.Errorf("empty FindFolder response")
	}

	msg := env.Body.Response.Messages[0]
	if msg.ResponseClass != "Success" {
		return nil, fmt.Errorf("FindFolder failed: %s", msg.MessageText)
	}

	folders := make([]Folder, 0, len(msg.Folders.Folders))
	for _, f := range msg.Folders.Folders {
		if f.XMLName.Local == searchFolderTag {
			continue
		}
		if f.Class != "" && !strings.HasPrefix(f.Class, mailFolderClass) {
			continue
		}

		folders = append(folders, Folder{
			ID:       f.FolderID.ID,
			ParentID: f.ParentID.ID,
			Name:     f.Name,
			Class:    f.Class,
			Role:     roles[f.FolderID.ID],
			Total:    f.TotalCount,
			Unread:   f.UnreadCount,
		})
	}

	return folders, nil
}

func GetMessagesInFolder(server, username, password, folderID string, limit, offset int) ([]EmailSummary, error) {
	c := newEWSClient(server, username, password)

	items, err := c.findItemsUnder(fmt.Sprintf(`<t:FolderId Id="%s"/>`, xmlEscape(folderID)), limit, offset)
	if err != nil {
		return nil, err
	}

	emails := make([]EmailSummary, 0, len(items))
	for _, item := range items {
		emails = append(emails, summaryFromEWS(item))
	}

	return emails, nil
}

func (c *ewsClient) folderRoles() (map[string]string, error) {
	var ids strings.Builder
	for _, role := range folderRoleIDs {
		fmt.Fprintf(&ids, `<t:DistinguishedFolderId Id="%s"/>`, role)
	}

	body, err := c.do(fmt.Sprintf(`
<m:GetFolder>
  <m:FolderShape>
    <t:BaseShape>IdOnly</t:BaseShape>
  </m:FolderShape>
  <m:FolderIds>%s</m:FolderIds>
</m:GetFolder>`, ids.String()), "GetFolder")
	if err != nil {
		return nil, err
	}

	var env folderIDsEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse GetFolder response: %w", err)
	}

	roles := map[string]string{}
	for i, msg := range env.Body.Response.Messages {
		if i >= len(folderRoleIDs) || msg.ResponseClass != "Success" || len(msg.Folders.Folders) == 0 {
			continue
		}
		roles[msg.Folders.Folders[0].FolderID.ID] = folderRoleIDs[i]
	}

	return roles, nil
}
