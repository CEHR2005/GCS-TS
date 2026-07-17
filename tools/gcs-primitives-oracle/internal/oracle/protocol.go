package oracle

import (
	"encoding/json"
	"fmt"
)

type request struct {
	ID   *string          `json:"id"`
	Op   *string          `json:"op"`
	Args *json.RawMessage `json:"args"`
}

type response struct {
	ID       string          `json:"id"`
	OK       bool            `json:"ok"`
	Result   json.RawMessage `json:"result,omitempty"`
	Category string          `json:"category,omitempty"`
	Message  string          `json:"message,omitempty"`
}

func ProcessLine(line []byte) ([]byte, error) {
	var request request
	if err := json.Unmarshal(line, &request); err != nil {
		return nil, fmt.Errorf("decode request: %w", err)
	}
	if request.ID == nil {
		return nil, fmt.Errorf("request is missing id")
	}
	if request.Op == nil {
		return nil, fmt.Errorf("request is missing op")
	}
	if request.Args == nil {
		return nil, fmt.Errorf("request is missing args")
	}
	var argsObject map[string]json.RawMessage
	if err := json.Unmarshal(*request.Args, &argsObject); err != nil || argsObject == nil {
		return nil, fmt.Errorf("request args must be an object")
	}

	result, category, message, err := dispatch(*request.Op, *request.Args)
	if err != nil {
		return nil, err
	}
	response, err := buildResponse(*request.ID, result, category, message)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return encoded, nil
}

func buildResponse(id string, result any, category, message string) (response, error) {
	response := response{ID: id, Category: category, Message: message}
	if category != "" {
		return response, nil
	}
	encodedResult, err := json.Marshal(result)
	if err != nil {
		return response, fmt.Errorf("encode result: %w", err)
	}
	response.OK = true
	response.Result = encodedResult
	return response, nil
}

func dispatch(op string, args json.RawMessage) (result any, category string, message string, err error) {
	switch op {
	case "meta.ping":
		return map[string]any{"protocolVersion": 1}, "", "", nil
	case "fxp.parse":
		return handleFxpParse(args)
	case "fxp.format":
		return handleFxpFormat(args)
	case "fxp.add", "fxp.subtract", "fxp.multiply", "fxp.divide", "fxp.modulo", "fxp.min", "fxp.max":
		return handleFxpBinary(op, args)
	case "fxp.abs", "fxp.truncate", "fxp.floor", "fxp.ceil", "fxp.round":
		return handleFxpUnary(op, args)
	case "fxp.apply_rounding":
		return handleFxpApplyRounding(args)
	default:
		return nil, "", "", fmt.Errorf("unknown operation %q", op)
	}
}
