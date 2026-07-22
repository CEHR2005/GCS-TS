package oracle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const (
	projectOperation   = "traits.project"
	calculateOperation = "traits.calculate"
)

type envelope struct {
	ID string `json:"id"`
	Op string `json:"op"`
}

type projectRequest struct {
	ID       string          `json:"id"`
	Op       string          `json:"op"`
	Document json.RawMessage `json:"document"`
}

type calculateRequest struct {
	ID                         string          `json:"id"`
	Op                         string          `json:"op"`
	Document                   json.RawMessage `json:"document"`
	UseMultiplicativeModifiers *bool           `json:"use_multiplicative_modifiers"`
}

type response struct {
	ID     string `json:"id"`
	OK     bool   `json:"ok"`
	Result any    `json:"result"`
}

type Processor struct{ seenIDs map[string]struct{} }

func NewProcessor() *Processor { return &Processor{seenIDs: make(map[string]struct{})} }

func (p *Processor) ProcessLine(line []byte) ([]byte, error) {
	var env envelope
	if err := decodeRequest(line, &env, false); err != nil {
		return nil, err
	}
	if strings.TrimSpace(env.ID) == "" {
		return nil, fmt.Errorf("request id must be non-blank")
	}
	if strings.TrimSpace(env.Op) == "" {
		return nil, fmt.Errorf("request op must be non-blank")
	}
	if _, exists := p.seenIDs[env.ID]; exists {
		return nil, fmt.Errorf("duplicate request id %q", env.ID)
	}

	var result any
	switch env.Op {
	case projectOperation:
		var request projectRequest
		if err := decodeRequest(line, &request, true); err != nil {
			return nil, err
		}
		document, err := requestDocument(request.Document)
		if err != nil {
			return nil, err
		}
		result, err = projectDocument(document)
		if err != nil {
			return nil, err
		}
	case calculateOperation:
		var request calculateRequest
		if err := decodeRequest(line, &request, true); err != nil {
			return nil, err
		}
		if request.UseMultiplicativeModifiers == nil {
			return nil, fmt.Errorf("request is missing use_multiplicative_modifiers")
		}
		document, err := requestDocument(request.Document)
		if err != nil {
			return nil, err
		}
		result, err = calculateDocument(document, *request.UseMultiplicativeModifiers)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unknown operation %q", env.Op)
	}

	p.seenIDs[env.ID] = struct{}{}
	encoded, err := json.Marshal(response{ID: env.ID, OK: true, Result: result})
	if err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return encoded, nil
}

func decodeRequest(line []byte, destination any, strict bool) error {
	if err := rejectDuplicateMembers(line); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(line))
	if strict {
		decoder.DisallowUnknownFields()
	}
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("decode request: %w", err)
	}
	return requireEOF(decoder)
}

func rejectDuplicateMembers(line []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(line))
	first, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("decode request: %w", err)
	}
	if delimiter, ok := first.(json.Delim); !ok || delimiter != '{' {
		return fmt.Errorf("decode request: request must be a JSON object")
	}
	seen := make(map[string]struct{})
	for decoder.More() {
		token, tokenErr := decoder.Token()
		if tokenErr != nil {
			return fmt.Errorf("decode request: %w", tokenErr)
		}
		name, ok := token.(string)
		if !ok {
			return fmt.Errorf("decode request: object member name is not a string")
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("decode request: duplicate object member %q", name)
		}
		seen[name] = struct{}{}
		var value json.RawMessage
		if valueErr := decoder.Decode(&value); valueErr != nil {
			return fmt.Errorf("decode request: %w", valueErr)
		}
	}
	if _, err = decoder.Token(); err != nil {
		return fmt.Errorf("decode request: %w", err)
	}
	return requireEOF(decoder)
}

func requestDocument(raw json.RawMessage) ([]byte, error) {
	if raw == nil {
		return nil, fmt.Errorf("request is missing document")
	}
	var document string
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, fmt.Errorf("request document must be a JSON string: %w", err)
	}
	return []byte(document), nil
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
