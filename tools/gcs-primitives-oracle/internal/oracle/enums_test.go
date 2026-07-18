package oracle

import (
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"github.com/richardwilkes/gcs/v5/model/gurps/enums/container"
)

func enumOperation(t *testing.T, op string, args map[string]any) map[string]any {
	t.Helper()
	request, err := json.Marshal(map[string]any{"id": "enum", "op": op, "args": args})
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
	var result map[string]any
	if err := json.Unmarshal(envelope.Result, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestEnumTables(t *testing.T) {
	tests := []struct {
		domain string
		want   []any
	}{
		{"trait_container", []any{"group", "alternative_abilities", "ancestry", "attributes", "meta_trait"}},
		{"trait_modifier_affects", []any{"total", "base_only", "levels_only"}},
		{"self_control_roll", []any{float64(0), float64(1), float64(6), float64(7), float64(8), float64(9), float64(10), float64(11), float64(12), float64(13), float64(14), float64(15)}},
		{"self_control_adjustment", []any{"none", "action_penalty", "reaction_penalty", "fright_check_penalty", "fright_check_bonus", "minor_cost_of_living_increase", "major_cost_of_living_increase"}},
		{"frequency_roll", []any{float64(0), float64(6), float64(9), float64(12), float64(15), float64(18)}},
		{"study_level", []any{"", "180", "160", "140", "120"}},
		{"study_type", []any{"self", "job", "teacher", "intensive"}},
	}

	for _, test := range tests {
		t.Run(test.domain, func(t *testing.T) {
			result := enumOperation(t, "enum.table", map[string]any{"domain": test.domain})
			if !reflect.DeepEqual(result["values"], test.want) {
				t.Fatalf("unexpected values: %#v", result["values"])
			}
		})
	}
}

func TestEnumTableFollowsPinnedExportedOrdering(t *testing.T) {
	original := container.Types
	mutated := slices.Clone(original)
	mutated[0], mutated[1] = mutated[1], mutated[0]
	container.Types = mutated
	defer func() { container.Types = original }()

	result := enumOperation(t, "enum.table", map[string]any{"domain": "trait_container"})
	want := make([]any, len(mutated))
	for i, value := range mutated {
		want[i] = value.Key()
	}
	if !reflect.DeepEqual(result["values"], want) {
		t.Fatalf("enum.table did not follow container.Types: %#v", result["values"])
	}
}

func TestEnumNormalize(t *testing.T) {
	tests := []struct {
		domain string
		input  any
		want   any
	}{
		{"trait_container", "AnCeStRy", "ancestry"},
		{"trait_container", "anceſtry", "ancestry"},
		{"trait_container", "RaCe", "ancestry"},
		{"trait_container", "unknown", "group"},
		{"trait_container", "ａｎｃｅｓｔｒｙ", "group"},
		{"trait_modifier_affects", "LeVeLs_OnLy", "levels_only"},
		{"trait_modifier_affects", "unknown", "total"},
		{"self_control_adjustment", "FrIgHt_ChEcK_BoNuS", "fright_check_bonus"},
		{"self_control_adjustment", "unknown", "none"},
		{"study_level", "180", "180"},
		{"study_level", "unknown", ""},
		{"study_type", "TeAcHeR", "teacher"},
		{"study_type", "intenſive", "intensive"},
		{"study_type", "unknown", "self"},
		{"self_control_roll", 2, float64(0)},
		{"self_control_roll", 257, float64(0)},
		{"self_control_roll", -255, float64(0)},
		{"frequency_roll", 5, float64(0)},
		{"frequency_roll", 262, float64(0)},
		{"frequency_roll", -238, float64(0)},
	}

	for _, test := range tests {
		t.Run(test.domain, func(t *testing.T) {
			result := enumOperation(t, "enum.normalize", map[string]any{
				"domain": test.domain,
				"input":  test.input,
			})
			if !reflect.DeepEqual(result["value"], test.want) {
				t.Fatalf("unexpected value: %#v", result["value"])
			}
		})
	}
}

func TestEnumNormalizeRejectsNullAndFractionalInputs(t *testing.T) {
	for _, request := range []string{
		`{"id":"enum","op":"enum.normalize","args":{"domain":"trait_container","input":null}}`,
		`{"id":"enum","op":"enum.normalize","args":{"domain":"self_control_roll","input":null}}`,
		`{"id":"enum","op":"enum.normalize","args":{"domain":"self_control_roll","input":1.5}}`,
	} {
		if _, err := ProcessLine([]byte(request)); err == nil {
			t.Fatalf("expected malformed arguments to fail: %s", request)
		}
	}
}
