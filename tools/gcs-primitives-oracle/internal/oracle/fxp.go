package oracle

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/richardwilkes/gcs/v5/model/fxp"
)

type fxpRawResult struct {
	Raw string `json:"raw"`
}

func decodeFxpRaw(raw string) (fxp.Int, error) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("decode fixed-point raw value: %w", err)
	}
	return fxp.Int(value), nil
}

func fxpResult(value fxp.Int) fxpRawResult {
	return fxpRawResult{Raw: strconv.FormatInt(int64(value), 10)}
}

func handleFxpParse(args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Input *string `json:"input"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode fxp.parse args: %w", err)
	}
	if input.Input == nil {
		return nil, "", "", fmt.Errorf("decode fxp.parse args: missing input")
	}
	value, parseErr := fxp.FromString(*input.Input)
	if parseErr != nil {
		category = "invalid_fxp"
		if isFxpOutOfRange(*input.Input, parseErr) {
			category = "fxp_out_of_range"
		}
		return nil, category, parseErr.Error(), nil
	}
	return fxpResult(value), "", "", nil
}

func isFxpOutOfRange(input string, err error) bool {
	if errors.Is(err, strconv.ErrRange) {
		return true
	}
	type detailedError interface {
		Message() string
		Unwrap() error
	}
	var detailed detailedError
	return errors.As(err, &detailed) && detailed.Unwrap() == nil &&
		detailed.Message() == "value out of range: "+strings.ReplaceAll(input, ",", "")
}

func handleFxpFormat(args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Raw string `json:"raw"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode fxp.format args: %w", err)
	}
	value, err := decodeFxpRaw(input.Raw)
	if err != nil {
		return nil, "", "", err
	}
	return struct {
		Text string `json:"text"`
	}{Text: value.String()}, "", "", nil
}

func handleFxpBinary(op string, args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Left  string `json:"left"`
		Right string `json:"right"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode %s args: %w", op, err)
	}
	left, err := decodeFxpRaw(input.Left)
	if err != nil {
		return nil, "", "", err
	}
	right, err := decodeFxpRaw(input.Right)
	if err != nil {
		return nil, "", "", err
	}
	if right == 0 && (op == "fxp.divide" || op == "fxp.modulo") {
		return nil, "divide_by_zero", "division by zero", nil
	}

	var value fxp.Int
	switch op {
	case "fxp.add":
		value = left.Add(right)
	case "fxp.subtract":
		value = left.Sub(right)
	case "fxp.multiply":
		value = left.Mul(right)
	case "fxp.divide":
		value = left.Div(right)
	case "fxp.modulo":
		value = left.Mod(right)
	case "fxp.min":
		value = left.Min(right)
	case "fxp.max":
		value = left.Max(right)
	default:
		return nil, "", "", fmt.Errorf("unknown fixed-point binary operation %q", op)
	}
	return fxpResult(value), "", "", nil
}

func handleFxpUnary(op string, args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode %s args: %w", op, err)
	}
	inputValue, err := decodeFxpRaw(input.Value)
	if err != nil {
		return nil, "", "", err
	}

	var value fxp.Int
	switch op {
	case "fxp.abs":
		value = inputValue.Abs()
	case "fxp.truncate":
		value = inputValue.Trunc()
	case "fxp.floor":
		value = inputValue.Floor()
	case "fxp.ceil":
		value = inputValue.Ceil()
	case "fxp.round":
		value = inputValue.Round()
	default:
		return nil, "", "", fmt.Errorf("unknown fixed-point unary operation %q", op)
	}
	return fxpResult(value), "", "", nil
}

func handleFxpApplyRounding(args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Value     string `json:"value"`
		RoundDown *bool  `json:"roundDown"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode fxp.apply_rounding args: %w", err)
	}
	if input.RoundDown == nil {
		return nil, "", "", fmt.Errorf("decode fxp.apply_rounding args: missing roundDown")
	}
	value, err := decodeFxpRaw(input.Value)
	if err != nil {
		return nil, "", "", err
	}
	return fxpResult(fxp.ApplyRounding(value, *input.RoundDown)), "", "", nil
}
