package oracle

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestProjectDocumentRequiresVersionFive(t *testing.T) {
	for _, version := range []string{"4", "6"} {
		document := []byte(`{"version":` + version + `,"traits":[]}`)
		if _, err := projectDocument(document); err == nil {
			t.Fatalf("expected version %s to be rejected", version)
		}
	}
}

func TestProjectDocumentProjectsAllFourNodeKinds(t *testing.T) {
	result := mustProjectionObject(t, []byte(syntheticDocument))
	traits := objectArray(t, result, "traits")
	if len(traits) != 1 {
		t.Fatalf("got %d root traits, want 1", len(traits))
	}

	container := traits[0]
	assertFields(t, container, map[string]any{
		"kind":                  "trait_container",
		"id":                    "TF6lD0le4p2bvHdzA",
		"name":                  "Root container",
		"reference":             "B1",
		"referenceHighlight":    "B1 highlight",
		"localNotes":            "root notes",
		"selfControlRoll":       float64(12),
		"selfControlAdjustment": "reaction_penalty",
		"frequency":             float64(9),
		"disabled":              true,
		"vttNotes":              "root vtt",
		"userDescription":       "root user description",
		"ancestry":              "Synthetic",
		"containerType":         "meta_trait",
		"childrenPresent":       true,
		"modifiersPresent":      true,
	})
	assertFields(t, objectField(t, container, "source"), map[string]any{
		"library": "Synthetic Library",
		"path":    "traits/root.adq",
		"id":      "TK0N6GSn4uRWY2STu",
	})
	assertFields(t, objectField(t, container, "replacements"), map[string]any{"one": "two"})
	if got := container["tags"]; !reflect.DeepEqual(got, []any{"Container", "Synthetic"}) {
		t.Errorf("tags = %#v", got)
	}
	assertAbsent(t, container, "calc", "features", "prerequisites", "thirdParty", "weapons", "templatePicker")

	modifiers := objectArray(t, container, "modifiers")
	modifierContainer := modifiers[0]
	assertFields(t, modifierContainer, map[string]any{
		"kind":               "trait_modifier_container",
		"id":                 "MhPPIWOr22DD9zVkO",
		"name":               "Modifier container",
		"reference":          "M1",
		"referenceHighlight": "M1 highlight",
		"localNotes":         "modifier container notes",
		"vttNotes":           "modifier container vtt",
		"childrenPresent":    true,
	})
	assertFields(t, objectField(t, modifierContainer, "source"), map[string]any{
		"library": "Synthetic Library",
		"path":    "modifiers/container.adq",
		"id":      "MCyZ5811rEJS8QN7T",
	})
	assertFields(t, objectField(t, modifierContainer, "replacements"), map[string]any{"old": "new"})
	modifierLeaf := objectArray(t, modifierContainer, "children")[0]
	assertFields(t, modifierLeaf, map[string]any{
		"kind":              "trait_modifier",
		"id":                "mGM2ePrucJxJtyatC",
		"name":              "Modifier leaf",
		"costAdjustment":    "+25%",
		"useLevelFromTrait": true,
		"showNotesOnWeapon": true,
		"affects":           "levels_only",
		"levelsRaw":         "15000",
		"disabled":          true,
		"childrenPresent":   false,
	})
	assertFields(t, objectField(t, modifierLeaf, "source"), map[string]any{
		"library": "Synthetic Library",
		"path":    "modifiers/leaf.adq",
		"id":      "meXPqRBxgqg6HSs0i",
	})
	assertAbsent(t, modifierLeaf, "calc", "features", "thirdParty")

	child := objectArray(t, container, "children")[0]
	assertFields(t, child, map[string]any{
		"kind":              "trait",
		"id":                "t1aYD-F0-V6Yy54oC",
		"name":              "Trait leaf",
		"basePointsRaw":     "12500",
		"pointsPerLevelRaw": "-25000",
		"levelsRaw":         "37500",
		"roundDown":         true,
		"canLevel":          true,
		"studyHoursNeeded":  "160",
		"childrenPresent":   false,
		"modifiersPresent":  true,
	})
	assertFields(t, objectField(t, child, "source"), map[string]any{
		"library": "Synthetic Library",
		"path":    "traits/leaf.adq",
		"id":      "tEf4GGUmgFnigcLKX",
	})
	if got := objectArray(t, child, "modifiers"); len(got) != 0 {
		t.Fatalf("got %d leaf modifiers, want present empty array", len(got))
	}
	study := objectArray(t, child, "study")[0]
	assertFields(t, study, map[string]any{
		"type":     "teacher",
		"hoursRaw": "45000",
		"note":     "guided study",
	})
	assertAbsent(t, child, "calc", "features", "prerequisites", "thirdParty", "weapons", "templatePicker")
}

func TestProjectDocumentLoadsCommittedFixture(t *testing.T) {
	document, err := os.ReadFile("../../../../fixtures/gcs-v5/wang-laowu.gcs")
	if err != nil {
		t.Fatal(err)
	}
	result := mustProjectionObject(t, document)
	traits := objectArray(t, result, "traits")
	if len(traits) == 0 {
		t.Fatal("fixture projection has no traits")
	}
	assertFields(t, traits[0], map[string]any{
		"kind": "trait",
		"id":   "t1aYD-F0-V6Yy54oC",
		"name": "Natural Attacks",
	})
}

func mustProjectionObject(t *testing.T, document []byte) map[string]any {
	t.Helper()
	projected, err := projectDocument(document)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(projected)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func objectArray(t *testing.T, object map[string]any, key string) []map[string]any {
	t.Helper()
	values, ok := object[key].([]any)
	if !ok {
		t.Fatalf("%s is not an array: %#v", key, object[key])
	}
	result := make([]map[string]any, len(values))
	for i, value := range values {
		var objectOK bool
		result[i], objectOK = value.(map[string]any)
		if !objectOK {
			t.Fatalf("%s[%d] is not an object: %#v", key, i, value)
		}
	}
	return result
}

func objectField(t *testing.T, object map[string]any, key string) map[string]any {
	t.Helper()
	value, ok := object[key].(map[string]any)
	if !ok {
		t.Fatalf("%s is not an object: %#v", key, object[key])
	}
	return value
}

func assertFields(t *testing.T, actual, expected map[string]any) {
	t.Helper()
	for key, want := range expected {
		if got := actual[key]; !reflect.DeepEqual(got, want) {
			t.Errorf("%s = %#v, want %#v", key, got, want)
		}
	}
}

func assertAbsent(t *testing.T, object map[string]any, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if _, exists := object[key]; exists {
			t.Errorf("opaque field %s must be omitted", key)
		}
	}
}

const syntheticDocument = `{
  "version": 5,
  "traits": [{
    "id": "TF6lD0le4p2bvHdzA",
    "source": {"library":"Synthetic Library","path":"traits\\root.adq","id":"TK0N6GSn4uRWY2STu"},
    "name": "Root container",
    "reference": "B1",
    "reference_highlight": "B1 highlight",
    "local_notes": "root notes",
    "tags": ["Container", "Synthetic"],
    "prereqs": {"all": true},
    "cr": 12,
    "cr_adj": "reaction_penalty",
    "frequency": 9,
    "disabled": true,
    "vtt_notes": "root vtt",
    "userdesc": "root user description",
    "replacements": {"one":"two"},
    "third_party": {"ignored": true},
    "calc": {"ignored": true},
    "ancestry": "Synthetic",
    "template_picker": {"ignored": true},
    "container_type": "meta_trait",
    "modifiers": [{
      "id": "MhPPIWOr22DD9zVkO",
      "source": {"library":"Synthetic Library","path":"modifiers/container.adq","id":"MCyZ5811rEJS8QN7T"},
      "name": "Modifier container",
      "reference": "M1",
      "reference_highlight": "M1 highlight",
      "local_notes": "modifier container notes",
      "tags": ["Container", "Modifier"],
      "vtt_notes": "modifier container vtt",
      "replacements": {"old":"new"},
      "third_party": {"ignored": true},
      "calc": {"ignored": true},
      "children": [{
        "id": "mGM2ePrucJxJtyatC",
        "source": {"library":"Synthetic Library","path":"modifiers/leaf.adq","id":"meXPqRBxgqg6HSs0i"},
        "name": "Modifier leaf",
        "cost_adj": "+25%",
        "use_level_from_trait": true,
        "show_notes_on_weapon": true,
        "affects": "levels_only",
        "levels": 1.5,
        "disabled": true,
        "features": [{"ignored": true}],
        "third_party": {"ignored": true},
        "calc": {"ignored": true}
      }]
    }],
    "children": [{
      "id": "t1aYD-F0-V6Yy54oC",
      "source": {"library":"Synthetic Library","path":"traits/leaf.adq","id":"tEf4GGUmgFnigcLKX"},
      "name": "Trait leaf",
      "base_points": 1.25,
      "points_per_level": -2.5,
      "levels": 3.75,
      "round_down": true,
      "can_level": true,
      "study": [{"type":"teacher","hours":4.5,"note":"guided study"}],
      "study_hours_needed": "160",
      "features": [{"ignored": true}],
      "weapons": [{"ignored": true}],
      "prereqs": {"all": true},
      "third_party": {"ignored": true},
      "calc": {"ignored": true},
      "modifiers": []
    }]
  }]
}`
