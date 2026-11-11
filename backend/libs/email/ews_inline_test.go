package email

import (
	"strings"
	"testing"
)

func TestInlineAttachmentXMLOrder(t *testing.T) {
	xml := attachmentXML([]OutboundAttachment{{
		Filename:    "bild.png",
		ContentType: "image/png",
		Data:        []byte{1, 2, 3},
		ContentID:   "bild1",
		Inline:      true,
	}})
	for _, muss := range []string{"<t:ContentId>bild1</t:ContentId>", "<t:IsInline>true</t:IsInline>"} {
		if !strings.Contains(xml, muss) {
			t.Fatalf("missing %q in:\n%s", muss, xml)
		}
	}
	iType := strings.Index(xml, "<t:ContentType>")
	iCid := strings.Index(xml, "<t:ContentId>")
	iInline := strings.Index(xml, "<t:IsInline>")
	iContent := strings.Index(xml, "<t:Content>")
	if !(iType < iCid && iCid < iInline && iInline < iContent) {
		t.Errorf("wrong element order: ContentType=%d ContentId=%d IsInline=%d Content=%d\n%s",
			iType, iCid, iInline, iContent, xml)
	}
}

func TestPlainAttachmentUnchanged(t *testing.T) {
	xml := attachmentXML([]OutboundAttachment{{
		Filename: "brief.pdf", ContentType: "application/pdf", Data: []byte{9},
	}})
	if strings.Contains(xml, "ContentId") || strings.Contains(xml, "IsInline") {
		t.Errorf("plain attachment gained inline markers:\n%s", xml)
	}
}
