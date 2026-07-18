package oracle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const projectOperation = "traits.project"

type request struct {
	ID       string          `json:"id"`
	Op       string          `json:"op"`
	Document json.RawMessage `json:"document"`
}

type response struct {
	ID     string     `json:"id"`
	OK     bool       `json:"ok"`
	Result projection `json:"result"`
}

// Processor validates and processes one finite JSONL request stream.
type Processor struct {
	seenIDs map[string]struct{}
}

// NewProcessor creates a processor with an empty request ID set.
func NewProcessor() *Processor {
	return &Processor{seenIDs: make(map[string]struct{})}
}

// ProcessLine returns exactly one response for a valid request record.
func (p *Processor) ProcessLine(line []byte) ([]byte, error) {
	var request request
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return nil, fmt.Errorf("decode request: %w", err)
	}
	if err := requireEOF(decoder); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.ID) == "" {
		return nil, fmt.Errorf("request id must be non-blank")
	}
	if strings.TrimSpace(request.Op) == "" {
		return nil, fmt.Errorf("request op must be non-blank")
	}
	if request.Document == nil {
		return nil, fmt.Errorf("request is missing document")
	}
	if request.Op != projectOperation {
		return nil, fmt.Errorf("unknown operation %q", request.Op)
	}
	if _, exists := p.seenIDs[request.ID]; exists {
		return nil, fmt.Errorf("duplicate request id %q", request.ID)
	}

	var document string
	if err := json.Unmarshal(request.Document, &document); err != nil {
		return nil, fmt.Errorf("request document must be a JSON string: %w", err)
	}
	p.seenIDs[request.ID] = struct{}{}
	result, err := projectDocument([]byte(document))
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(response{ID: request.ID, OK: true, Result: result})
	if err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return encoded, nil
}

func requireEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("decode request: multiple JSON values")
		}
		return fmt.Errorf("decode request: %w", err)
	}
	return nil
}
