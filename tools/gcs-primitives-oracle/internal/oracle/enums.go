package oracle

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/richardwilkes/gcs/v5/model/gurps/enums/affects"
	"github.com/richardwilkes/gcs/v5/model/gurps/enums/container"
	"github.com/richardwilkes/gcs/v5/model/gurps/enums/frequency"
	"github.com/richardwilkes/gcs/v5/model/gurps/enums/selfctrl"
	"github.com/richardwilkes/gcs/v5/model/gurps/enums/study"
)

type enumTableArgs struct {
	Domain string `json:"domain"`
}

type enumNormalizeArgs struct {
	Domain string          `json:"domain"`
	Input  json.RawMessage `json:"input"`
}

func handleEnumTable(raw json.RawMessage) (any, string, string, error) {
	var args enumTableArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, "", "", fmt.Errorf("decode enum.table arguments: %w", err)
	}
	if args.Domain == "" {
		return nil, "", "", fmt.Errorf("enum.table domain is required")
	}

	var values any
	switch args.Domain {
	case "trait_container":
		values = keysOfContainerTypes([]container.Type{
			container.Group,
			container.AlternativeAbilities,
			container.Ancestry,
			container.Attributes,
			container.MetaTrait,
		})
	case "trait_modifier_affects":
		values = keysOfAffectsOptions([]affects.Option{
			affects.Total,
			affects.BaseOnly,
			affects.LevelsOnly,
		})
	case "self_control_roll":
		values = numbersOfSelfControlRolls([]selfctrl.Roll{
			selfctrl.None,
			selfctrl.Always,
			selfctrl.CR6,
			selfctrl.CR7,
			selfctrl.CR8,
			selfctrl.CR9,
			selfctrl.CR10,
			selfctrl.CR11,
			selfctrl.CR12,
			selfctrl.CR13,
			selfctrl.CR14,
			selfctrl.CR15,
		})
	case "self_control_adjustment":
		values = keysOfSelfControlAdjustments([]selfctrl.Adjustment{
			selfctrl.NoAdjustment,
			selfctrl.ActionPenalty,
			selfctrl.ReactionPenalty,
			selfctrl.FrightCheckPenalty,
			selfctrl.FrightCheckBonus,
			selfctrl.MinorCostOfLivingIncrease,
			selfctrl.MajorCostOfLivingIncrease,
		})
	case "frequency_roll":
		values = numbersOfFrequencyRolls([]frequency.Roll{
			frequency.None,
			frequency.FR6,
			frequency.FR9,
			frequency.FR12,
			frequency.FR15,
			frequency.Constant,
		})
	case "study_level":
		values = keysOfStudyLevels([]study.Level{
			study.Standard,
			study.Level1,
			study.Level2,
			study.Level3,
			study.Level4,
		})
	case "study_type":
		values = keysOfStudyTypes([]study.Type{
			study.Self,
			study.Job,
			study.Teacher,
			study.Intensive,
		})
	default:
		return nil, "", "", fmt.Errorf("unknown enum domain %q", args.Domain)
	}
	return map[string]any{"values": values}, "", "", nil
}

func handleEnumNormalize(raw json.RawMessage) (any, string, string, error) {
	var args enumNormalizeArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, "", "", fmt.Errorf("decode enum.normalize arguments: %w", err)
	}
	if args.Domain == "" || args.Input == nil {
		return nil, "", "", fmt.Errorf("enum.normalize domain and input are required")
	}

	var value any
	switch args.Domain {
	case "trait_container":
		input, err := enumStringInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = container.ExtractType(input).Key()
	case "trait_modifier_affects":
		input, err := enumStringInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = affects.ExtractOption(input).Key()
	case "self_control_adjustment":
		input, err := enumStringInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = selfctrl.ExtractAdjustment(input).Key()
	case "study_level":
		input, err := enumStringInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = study.ExtractLevel(input).Key()
	case "study_type":
		input, err := enumStringInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = study.ExtractType(input).Key()
	case "self_control_roll":
		input, err := enumNumberInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = int(selfctrl.Roll(input).EnsureValid())
	case "frequency_roll":
		input, err := enumNumberInput(args.Input)
		if err != nil {
			return nil, "", "", err
		}
		value = int(frequency.Roll(input).EnsureValid())
	default:
		return nil, "", "", fmt.Errorf("unknown enum domain %q", args.Domain)
	}
	return map[string]any{"value": value}, "", "", nil
}

func enumStringInput(raw json.RawMessage) (string, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return "", fmt.Errorf("enum input must be a string")
	}
	var input string
	if err := json.Unmarshal(raw, &input); err != nil {
		return "", fmt.Errorf("enum input must be a string: %w", err)
	}
	return input, nil
}

func enumNumberInput(raw json.RawMessage) (int, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return 0, fmt.Errorf("enum input must be an integer")
	}
	var input int
	if err := json.Unmarshal(raw, &input); err != nil {
		return 0, fmt.Errorf("enum input must be an integer: %w", err)
	}
	if input < 0 || input > 255 {
		return 0, nil
	}
	return input, nil
}

func keysOfContainerTypes(values []container.Type) []string {
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = value.Key()
	}
	return result
}

func keysOfAffectsOptions(values []affects.Option) []string {
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = value.Key()
	}
	return result
}

func numbersOfSelfControlRolls(values []selfctrl.Roll) []int {
	result := make([]int, len(values))
	for i, value := range values {
		result[i] = int(value)
	}
	return result
}

func keysOfSelfControlAdjustments(values []selfctrl.Adjustment) []string {
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = value.Key()
	}
	return result
}

func numbersOfFrequencyRolls(values []frequency.Roll) []int {
	result := make([]int, len(values))
	for i, value := range values {
		result[i] = int(value)
	}
	return result
}

func keysOfStudyLevels(values []study.Level) []string {
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = value.Key()
	}
	return result
}

func keysOfStudyTypes(values []study.Type) []string {
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = value.Key()
	}
	return result
}
