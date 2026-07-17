package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestRunWritesOneResponsePerRequest(t *testing.T) {
	input := strings.NewReader("{\"id\":\"p1\",\"op\":\"meta.ping\",\"args\":{}}\n" +
		"{\"id\":\"p2\",\"op\":\"meta.ping\",\"args\":{}}\n")
	var output bytes.Buffer

	if err := run(input, &output); err != nil {
		t.Fatal(err)
	}

	scanner := bufio.NewScanner(&output)
	for _, wantID := range []string{"p1", "p2"} {
		if !scanner.Scan() {
			t.Fatalf("missing response for %s", wantID)
		}
		var response map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if response["id"] != wantID || response["ok"] != true {
			t.Fatalf("unexpected response: %s", scanner.Bytes())
		}
	}
	if scanner.Scan() {
		t.Fatalf("unexpected extra response: %s", scanner.Bytes())
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestRunStopsAfterUnknownOperation(t *testing.T) {
	input := strings.NewReader("{\"id\":\"p1\",\"op\":\"meta.ping\",\"args\":{}}\n" +
		"{\"id\":\"p2\",\"op\":\"missing\",\"args\":{}}\n")
	var output bytes.Buffer

	if err := run(input, &output); err == nil {
		t.Fatal("expected protocol error")
	}
	if lines := bytes.Count(output.Bytes(), []byte{'\n'}); lines != 1 {
		t.Fatalf("got %d response lines, want 1", lines)
	}
}
