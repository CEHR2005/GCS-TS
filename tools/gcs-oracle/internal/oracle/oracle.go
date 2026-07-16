package oracle

import (
	"encoding/json"
	jsonv2 "encoding/json/v2"
	"fmt"
	"sync"
	"testing/fstest"

	"github.com/richardwilkes/gcs/v5/model/fxp"
	"github.com/richardwilkes/gcs/v5/model/gurps"
)

const normalizeOperation = "normalize"

var configureGCSOnce sync.Once

type request struct {
	ID       *string `json:"id"`
	Op       *string `json:"op"`
	Document *string `json:"document"`
}

type response struct {
	ID       string          `json:"id"`
	OK       bool            `json:"ok"`
	Document json.RawMessage `json:"document,omitempty"`
	Category string          `json:"category,omitempty"`
	Message  string          `json:"message,omitempty"`
}

// ProcessLine processes one JSONL protocol request.
func ProcessLine(line []byte) ([]byte, error) {
	var request request
	if err := json.Unmarshal(line, &request); err != nil {
		return nil, fmt.Errorf("decode request: %w", err)
	}
	if request.ID == nil || request.Op == nil || request.Document == nil {
		return nil, fmt.Errorf("decode request: id, op, and document are required")
	}
	if *request.Op != normalizeOperation {
		return nil, fmt.Errorf("unsupported operation %q", *request.Op)
	}

	document, category, message, err := normalize(*request.Document)
	if err != nil {
		return nil, err
	}

	protocolResponse := response{ID: *request.ID}
	if category == "" {
		protocolResponse.OK = true
		protocolResponse.Document = document
	} else {
		protocolResponse.Category = category
		protocolResponse.Message = message
	}
	encoded, err := json.Marshal(protocolResponse)
	if err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return encoded, nil
}

func normalize(document string) (normalized json.RawMessage, category string, message string, err error) {
	data := []byte(document)
	if !json.Valid(data) {
		return nil, "invalid_json", "invalid JSON document", nil
	}

	var envelope struct {
		Version int `json:"version"`
	}
	if unmarshalErr := json.Unmarshal(data, &envelope); unmarshalErr != nil {
		return nil, "invalid_gcs", unmarshalErr.Error(), nil
	}
	if envelope.Version < 2 || envelope.Version > 5 {
		return nil, "unsupported_version", fmt.Sprintf("unsupported GCS data version %d", envelope.Version), nil
	}

	configureGCSOnce.Do(func() {
		settings := gurps.GlobalSettings().GeneralSettings()
		settings.AutoFillProfile = false
		settings.AutoAddNaturalAttacks = false
		settings.PermittedPerScriptExecTime = fxp.Five
	})

	fileSystem := fstest.MapFS{
		"character.gcs": &fstest.MapFile{Data: data},
	}
	entity, loadErr := gurps.NewEntityFromFile(fileSystem, "character.gcs")
	if loadErr != nil {
		return nil, "invalid_gcs", loadErr.Error(), nil
	}

	encoded, marshalErr := jsonv2.Marshal(entity)
	if marshalErr != nil {
		return nil, "", "", fmt.Errorf("encode normalized document: %w", marshalErr)
	}
	return json.RawMessage(encoded), "", "", nil
}
