package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"strings"
	"testing"
)

const helperEnvironment = "GCS_TRAITS_ORACLE_TEST_HELPER=1"

func TestCommandWritesSuccessfulJSONLResponse(t *testing.T) {
	input := commandRequest(t, "request-1", "traits.project", `{"version":5,"traits":[]}`)
	stdout, stderr, err := runCommand(t, string(input)+"\n")
	if err != nil {
		t.Fatalf("command failed: %v: %s", err, stderr)
	}
	if stderr != "" {
		t.Fatalf("unexpected stderr: %s", stderr)
	}
	if !strings.HasSuffix(stdout, "\n") || strings.Count(stdout, "\n") != 1 {
		t.Fatalf("expected one newline-terminated response, got %q", stdout)
	}
	var response map[string]any
	if err = json.Unmarshal([]byte(strings.TrimSuffix(stdout, "\n")), &response); err != nil {
		t.Fatal(err)
	}
	if response["id"] != "request-1" || response["ok"] != true {
		t.Fatalf("unexpected response: %s", stdout)
	}
}

func TestCommandTerminatesNonZeroForMalformedRequest(t *testing.T) {
	assertCommandFailure(t, "not-json\n", "decode request")
}

func TestCommandTerminatesNonZeroForUnknownOperation(t *testing.T) {
	input := commandRequest(t, "request-1", "meta.ping", `{"version":5,"traits":[]}`)
	assertCommandFailure(t, string(input)+"\n", "unknown operation")
}

func TestCommandTerminatesNonZeroForDuplicateID(t *testing.T) {
	input := commandRequest(t, "request-1", "traits.project", `{"version":5,"traits":[]}`)
	stdout, stderr, err := runCommand(t, string(input)+"\n"+string(input)+"\n")
	assertNonZeroExit(t, err)
	if strings.Count(stdout, "\n") != 1 {
		t.Fatalf("expected the first valid response before failure, got %q", stdout)
	}
	if !strings.Contains(stderr, "duplicate request id") {
		t.Fatalf("unexpected stderr: %q", stderr)
	}
}

func TestCommandHelperProcess(t *testing.T) {
	if os.Getenv("GCS_TRAITS_ORACLE_TEST_HELPER") != "1" {
		return
	}
	main()
	os.Exit(0)
}

func runCommand(t *testing.T, input string) (stdout, stderr string, err error) {
	t.Helper()
	command := exec.Command(os.Args[0], "-test.run=^TestCommandHelperProcess$")
	command.Env = append(os.Environ(), helperEnvironment)
	command.Stdin = strings.NewReader(input)
	var stdoutBuffer, stderrBuffer bytes.Buffer
	command.Stdout = &stdoutBuffer
	command.Stderr = &stderrBuffer
	err = command.Run()
	return stdoutBuffer.String(), stderrBuffer.String(), err
}

func assertCommandFailure(t *testing.T, input, message string) {
	t.Helper()
	stdout, stderr, err := runCommand(t, input)
	assertNonZeroExit(t, err)
	if stdout != "" {
		t.Fatalf("fatal request produced stdout: %q", stdout)
	}
	if !strings.Contains(stderr, message) {
		t.Fatalf("stderr %q does not contain %q", stderr, message)
	}
}

func assertNonZeroExit(t *testing.T, err error) {
	t.Helper()
	var exitError *exec.ExitError
	if !errors.As(err, &exitError) || exitError.ExitCode() == 0 {
		t.Fatalf("expected non-zero exit, got %v", err)
	}
}

func commandRequest(t *testing.T, id, op, document string) []byte {
	t.Helper()
	encoded, err := json.Marshal(map[string]any{"id": id, "op": op, "document": document})
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
