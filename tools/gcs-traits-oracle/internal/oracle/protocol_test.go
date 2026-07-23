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

func TestProcessorReturnsOneCalculateResponse(t *testing.T) {
	request := mustCalculateRequest(t, "calculate-1", `{"version":5,"traits":[{"id":"t1aYD-F0-V6Yy54oC","name":"Leveled","base_points":10,"points_per_level":5,"levels":2,"can_level":true}]}`, false)
	encoded, err := NewProcessor().ProcessLine(request)
	if err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err = json.Unmarshal(encoded, &response); err != nil {
		t.Fatal(err)
	}
	result := response["result"].(map[string]any)
	traits := result["traits"].([]any)
	assertFields(t, traits[0].(map[string]any), map[string]any{
		"kind": "trait", "id": "t1aYD-F0-V6Yy54oC", "currentLevel": "20000", "adjustedPoints": "200000",
	})
}

func TestCalculateRequestRequiresBooleanOptionAndStrictFields(t *testing.T) {
	document, _ := json.Marshal(`{"version":5,"traits":[]}`)
	tests := []string{
		`{"id":"x","op":"traits.calculate","document":` + string(document) + `}`,
		`{"id":"x","op":"traits.calculate","document":` + string(document) + `,"use_multiplicative_modifiers":"false"}`,
		`{"id":"x","op":"traits.calculate","document":` + string(document) + `,"use_multiplicative_modifiers":false,"extra":1}`,
	}
	for _, input := range tests {
		if _, err := NewProcessor().ProcessLine([]byte(input)); err == nil {
			t.Fatalf("expected failure for %s", input)
		}
	}
}

func TestProjectRequestRemainsStrict(t *testing.T) {
	request := []byte(`{"id":"x","op":"traits.project","document":"{\"version\":5,\"traits\":[]}","use_multiplicative_modifiers":false}`)
	if _, err := NewProcessor().ProcessLine(request); err == nil {
		t.Fatal("expected project-specific unknown field failure")
	}
}

func TestProcessorRejectsDuplicateMemberNames(t *testing.T) {
	tests := []string{
		`{"id":"first","id":"last","op":"traits.project","document":"{\"version\":5,\"traits\":[]}"}`,
		`{"id":"x","op":"traits.project","op":"traits.calculate","document":"{\"version\":5,\"traits\":[]}","use_multiplicative_modifiers":false}`,
		`{"id":"x","op":"traits.project","document":"{\"version\":5,\"traits\":[]}","document":"{\"version\":5,\"traits\":[]}"}`,
		`{"id":"x","op":"traits.calculate","document":"{\"version\":5,\"traits\":[]}","use_multiplicative_modifiers":false,"use_multiplicative_modifiers":true}`,
	}
	for _, input := range tests {
		if _, err := NewProcessor().ProcessLine([]byte(input)); err == nil {
			t.Fatalf("standard JSON decoder accepted duplicate member using its last value: %s", input)
		}
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

func mustCalculateRequest(t *testing.T, id, document string, multiplicative bool) []byte {
	t.Helper()
	encoded, err := json.Marshal(map[string]any{
		"id": id, "op": "traits.calculate", "document": document,
		"use_multiplicative_modifiers": multiplicative,
	})
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
