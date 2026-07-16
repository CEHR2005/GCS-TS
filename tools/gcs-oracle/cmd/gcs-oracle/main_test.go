package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
)

var errTestWriter = errors.New("test writer failure")

type failingWriter struct{}

func (failingWriter) Write(_ []byte) (int, error) {
	return 0, errTestWriter
}

type cliResponse struct {
	ID       string          `json:"id"`
	OK       bool            `json:"ok"`
	Document json.RawMessage `json:"document"`
}

func decodeSingleResponse(t *testing.T, output []byte) cliResponse {
	t.Helper()
	lines := bytes.Split(output, []byte{'\n'})
	if len(lines) != 2 || len(lines[0]) == 0 || len(lines[1]) != 0 {
		t.Fatalf("expected exactly one JSONL response, got %q", output)
	}
	var response cliResponse
	if err := json.Unmarshal(lines[0], &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return response
}

func TestRunAcceptsEmptyInput(t *testing.T) {
	var output bytes.Buffer
	if err := run(strings.NewReader(""), &output); err != nil {
		t.Fatal(err)
	}
	if output.Len() != 0 {
		t.Fatalf("unexpected output: %q", output.String())
	}
}

func TestRunWritesExactlyOneDecodableResponseLine(t *testing.T) {
	var output bytes.Buffer
	request := `{"id":"one","op":"normalize","document":"{\"version\":5}"}` + "\n"
	if err := run(strings.NewReader(request), &output); err != nil {
		t.Fatal(err)
	}

	response := decodeSingleResponse(t, output.Bytes())
	if response.ID != "one" || !response.OK {
		t.Fatalf("unexpected response: %+v", response)
	}
	var document struct {
		Version int `json:"version"`
	}
	if err := json.Unmarshal(response.Document, &document); err != nil {
		t.Fatalf("decode document: %v", err)
	}
	if document.Version != 5 {
		t.Fatalf("document version = %d, want 5", document.Version)
	}
}

func TestRunRejectsProtocolFailures(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{name: "malformed request", input: "{\n"},
		{name: "unsupported operation", input: `{"id":"one","op":"other","document":"{\"version\":5}"}` + "\n"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := run(strings.NewReader(test.input), io.Discard); err == nil {
				t.Fatal("expected protocol error")
			}
		})
	}
}

func TestRunReturnsScannerErrorForOversizedLine(t *testing.T) {
	input := strings.NewReader(strings.Repeat("x", maxRequestSize+1))
	err := run(input, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "token too long") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunReturnsWriteError(t *testing.T) {
	document := `{"version":5,"third_party":{"padding":"` + strings.Repeat("x", 8192) + `"}}`
	request, err := json.Marshal(struct {
		ID       string `json:"id"`
		Op       string `json:"op"`
		Document string `json:"document"`
	}{ID: "one", Op: "normalize", Document: document})
	if err != nil {
		t.Fatal(err)
	}

	err = run(bytes.NewReader(append(request, '\n')), failingWriter{})
	if !errors.Is(err, errTestWriter) || !strings.Contains(err.Error(), "write response line 1") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunReturnsFlushError(t *testing.T) {
	request := `{"id":"one","op":"normalize","document":"{"}` + "\n"
	err := run(strings.NewReader(request), failingWriter{})
	if !errors.Is(err, errTestWriter) || !strings.Contains(err.Error(), "flush response line 1") {
		t.Fatalf("unexpected error: %v", err)
	}
}
