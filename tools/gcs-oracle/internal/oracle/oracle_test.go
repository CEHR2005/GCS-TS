package oracle

import (
	"encoding/json"
	"testing"

	"github.com/richardwilkes/gcs/v5/model/fxp"
	"github.com/richardwilkes/gcs/v5/model/gurps"
)

type wireResponse struct {
	ID       string          `json:"id"`
	OK       bool            `json:"ok"`
	Document json.RawMessage `json:"document"`
	Category string          `json:"category"`
	Message  string          `json:"message"`
}

func decodeWireResponse(t *testing.T, data []byte) wireResponse {
	t.Helper()
	var response wireResponse
	if err := json.Unmarshal(data, &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return response
}

func TestProcessLineNormalizesDocument(t *testing.T) {
	request := []byte(`{"id":"one","op":"normalize","document":"{\"version\":5}"}`)
	response, err := ProcessLine(request)
	if err != nil {
		t.Fatal(err)
	}
	wire := decodeWireResponse(t, response)
	if wire.ID != "one" || !wire.OK || len(wire.Document) == 0 {
		t.Fatalf("unexpected response: %+v", wire)
	}
	var document struct {
		Version int `json:"version"`
	}
	if err = json.Unmarshal(wire.Document, &document); err != nil {
		t.Fatalf("decode document: %v", err)
	}
	if document.Version != 5 {
		t.Fatalf("document version = %d, want 5", document.Version)
	}
}

func TestProcessLineClassifiesExpectedDocumentFailures(t *testing.T) {
	tests := []struct {
		name     string
		document string
		category string
	}{
		{name: "invalid JSON", document: `{`, category: "invalid_json"},
		{name: "unsupported version", document: `{"version":6}`, category: "unsupported_version"},
		{name: "invalid GCS", document: `{"version":5,"profile":false}`, category: "invalid_gcs"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, err := json.Marshal(struct {
				ID       string `json:"id"`
				Op       string `json:"op"`
				Document string `json:"document"`
			}{ID: "case", Op: "normalize", Document: test.document})
			if err != nil {
				t.Fatal(err)
			}

			response, err := ProcessLine(request)
			if err != nil {
				t.Fatal(err)
			}
			wire := decodeWireResponse(t, response)
			if wire.ID != "case" || wire.OK || wire.Category != test.category || wire.Message == "" {
				t.Fatalf("unexpected response: %+v", wire)
			}
			if len(wire.Document) != 0 {
				t.Fatalf("expected no document, got %s", wire.Document)
			}
		})
	}
}

func TestProcessLineRejectsProtocolFailures(t *testing.T) {
	tests := []struct {
		name    string
		request []byte
	}{
		{name: "malformed JSON", request: []byte(`{`)},
		{name: "unsupported operation", request: []byte(`{"id":"one","op":"other","document":"{\"version\":5}"}`)},
		{name: "missing id", request: []byte(`{"op":"normalize","document":"{\"version\":5}"}`)},
		{name: "missing operation", request: []byte(`{"id":"one","document":"{\"version\":5}"}`)},
		{name: "missing document", request: []byte(`{"id":"one","op":"normalize"}`)},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := ProcessLine(test.request); err == nil {
				t.Fatal("expected protocol error")
			}
		})
	}
}

func TestProcessLineConfiguresScriptTimeoutForTestOracle(t *testing.T) {
	request := []byte(`{"id":"one","op":"normalize","document":"{\"version\":5}"}`)
	if _, err := ProcessLine(request); err != nil {
		t.Fatal(err)
	}
	if got := gurps.GlobalSettings().GeneralSettings().PermittedPerScriptExecTime; got != fxp.Five {
		t.Fatalf("script timeout = %s, want %s", got, fxp.Five)
	}
}
