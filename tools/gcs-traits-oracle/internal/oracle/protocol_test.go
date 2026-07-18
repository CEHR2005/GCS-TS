package oracle

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestProcessorReturnsOneProjectionResponse(t *testing.T) {
	document := `{"version":5,"traits":[]}`
	request := mustRequest(t, "request-1", "traits.project", document)

	encoded, err := NewProcessor().ProcessLine(request)
	if err != nil {
		t.Fatal(err)
	}

	var response struct {
		ID     string `json:"id"`
		OK     bool   `json:"ok"`
		Result struct {
			Traits []any `json:"traits"`
		} `json:"result"`
	}
	if err = json.Unmarshal(encoded, &response); err != nil {
		t.Fatal(err)
	}
	if response.ID != "request-1" || !response.OK || response.Result.Traits == nil || len(response.Result.Traits) != 0 {
		t.Fatalf("unexpected response: %s", encoded)
	}
}

func TestProcessorRejectsMalformedEnvelopes(t *testing.T) {
	validDocument, err := json.Marshal(`{"version":5,"traits":[]}`)
	if err != nil {
		t.Fatal(err)
	}
	tests := map[string]string{
		"malformed JSON":   `not-json`,
		"missing id":       `{"op":"traits.project","document":` + string(validDocument) + `}`,
		"blank id":         `{"id":"  ","op":"traits.project","document":` + string(validDocument) + `}`,
		"missing op":       `{"id":"request-1","document":` + string(validDocument) + `}`,
		"blank op":         `{"id":"request-1","op":"","document":` + string(validDocument) + `}`,
		"missing document": `{"id":"request-1","op":"traits.project"}`,
		"document object":  `{"id":"request-1","op":"traits.project","document":{"version":5}}`,
		"unknown op":       `{"id":"request-1","op":"meta.ping","document":` + string(validDocument) + `}`,
	}

	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if _, processErr := NewProcessor().ProcessLine([]byte(input)); processErr == nil {
				t.Fatalf("expected failure for %s", input)
			}
		})
	}
}

func TestProcessorRejectsDuplicateIDs(t *testing.T) {
	processor := NewProcessor()
	request := mustRequest(t, "request-1", "traits.project", `{"version":5,"traits":[]}`)
	if _, err := processor.ProcessLine(request); err != nil {
		t.Fatal(err)
	}
	if _, err := processor.ProcessLine(request); err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("expected duplicate ID failure, got %v", err)
	}
}

func mustRequest(t *testing.T, id, op, document string) []byte {
	t.Helper()
	encoded, err := json.Marshal(map[string]any{
		"id":       id,
		"op":       op,
		"document": document,
	})
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
