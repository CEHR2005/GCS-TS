package oracle

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/richardwilkes/gcs/v5/model/fxp"
	"github.com/richardwilkes/gcs/v5/model/gurps"
)

func TestProcessLineNormalizesDocument(t *testing.T) {
	request := []byte(`{"id":"one","op":"normalize","document":"{\"version\":5}"}`)
	response, err := ProcessLine(request)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(response, []byte(`"ok":true`)) {
		t.Fatalf("unexpected response: %s", response)
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
			if !bytes.Contains(response, []byte(`"category":"`+test.category+`"`)) {
				t.Fatalf("unexpected response: %s", response)
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
