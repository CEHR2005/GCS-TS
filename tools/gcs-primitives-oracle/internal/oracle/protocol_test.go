package oracle

import (
	"encoding/json"
	"testing"
)

func TestProcessLinePing(t *testing.T) {
	got, err := ProcessLine([]byte(`{"id":"p1","op":"meta.ping","args":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err = json.Unmarshal(got, &response); err != nil {
		t.Fatal(err)
	}
	if response["id"] != "p1" || response["ok"] != true {
		t.Fatalf("unexpected response: %s", got)
	}
	result, ok := response["result"].(map[string]any)
	if !ok || result["protocolVersion"] != float64(1) {
		t.Fatalf("unexpected result: %s", got)
	}
}

func TestProcessLineRejectsMalformedRequests(t *testing.T) {
	for _, input := range []string{
		`not-json`,
		`{"op":"meta.ping","args":{}}`,
		`{"id":"p1","args":{}}`,
		`{"id":"p1","op":"missing","args":{}}`,
	} {
		if _, err := ProcessLine([]byte(input)); err == nil {
			t.Fatalf("expected failure for %s", input)
		}
	}
}

func TestProcessLineRejectsNonObjectArgs(t *testing.T) {
	for _, test := range []struct {
		name string
		args string
	}{
		{name: "array", args: `[]`},
		{name: "number", args: `1`},
		{name: "string", args: `"x"`},
		{name: "null", args: `null`},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := []byte(`{"id":"p1","op":"meta.ping","args":` + test.args + `}`)
			if _, err := ProcessLine(input); err == nil {
				t.Fatalf("expected failure for args %s", test.args)
			}
		})
	}
}

func TestBuildResponseCreatesDomainFailureEnvelope(t *testing.T) {
	got, err := buildResponse("p1", nil, "invalid_argument", "bad input")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "p1" || got.OK || got.Category != "invalid_argument" || got.Message != "bad input" {
		t.Fatalf("unexpected response: %+v", got)
	}
	if got.Result != nil {
		t.Fatalf("failure result should be omitted: %s", got.Result)
	}
}
