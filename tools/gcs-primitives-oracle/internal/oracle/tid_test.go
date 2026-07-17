package oracle

import (
	"encoding/json"
	"testing"
)

func TestTIDInspect(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		syntaxValid   bool
		supportedKind bool
		kind          string
	}{
		{
			name:          "supported trait",
			input:         "tAAECAwQFBgcICQoL",
			syntaxValid:   true,
			supportedKind: true,
			kind:          "t",
		},
		{
			name:          "valid unsupported kind",
			input:         "sAAECAwQFBgcICQoL",
			syntaxValid:   true,
			supportedKind: false,
			kind:          "s",
		},
		{
			name:          "invalid payload",
			input:         "t+AECAwQFBgcICQoL",
			syntaxValid:   false,
			supportedKind: false,
			kind:          "t",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, err := json.Marshal(map[string]any{
				"id":   "tid",
				"op":   "tid.inspect",
				"args": map[string]string{"input": test.input},
			})
			if err != nil {
				t.Fatal(err)
			}
			got, err := ProcessLine(request)
			if err != nil {
				t.Fatal(err)
			}
			var envelope response
			if err := json.Unmarshal(got, &envelope); err != nil {
				t.Fatal(err)
			}
			if !envelope.OK {
				t.Fatalf("unexpected failure response: %s", got)
			}
			var result struct {
				SyntaxValid   bool   `json:"syntaxValid"`
				SupportedKind bool   `json:"supportedKind"`
				Kind          string `json:"kind"`
			}
			if err := json.Unmarshal(envelope.Result, &result); err != nil {
				t.Fatal(err)
			}
			if result.SyntaxValid != test.syntaxValid ||
				result.SupportedKind != test.supportedKind || result.Kind != test.kind {
				t.Fatalf("unexpected inspection: %+v", result)
			}
		})
	}
}

func TestTIDInspectRejectsMalformedArguments(t *testing.T) {
	for _, request := range []string{
		`{"id":"tid","op":"tid.inspect","args":{}}`,
		`{"id":"tid","op":"tid.inspect","args":{"input":1}}`,
	} {
		if _, err := ProcessLine([]byte(request)); err == nil {
			t.Fatalf("expected malformed arguments to fail: %s", request)
		}
	}
}
