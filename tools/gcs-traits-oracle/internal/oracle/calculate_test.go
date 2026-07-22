package oracle

import (
	"encoding/json"
	"testing"
)

func TestCalculateDocumentLeafContainerBothModesAndInheritance(t *testing.T) {
	document := []byte(`{"version":5,"traits":[{"id":"TF6lD0le4p2bvHdzA","name":"Container","modifiers":[{"id":"mGM2ePrucJxJtyatC","name":"Inherited enhancement","cost_adj":"+50%"},{"id":"meXPqRBxgqg6HSs0i","name":"Inherited limitation","cost_adj":"-50%"}],"children":[{"id":"t1aYD-F0-V6Yy54oC","name":"Leaf","base_points":10,"points_per_level":5,"levels":2,"can_level":true,"features":[{"type":"trait_bonus","name":{"compare":"is","qualifier":"Leaf"},"amount":99}]}]}]}`)
	tests := []struct {
		multiplicative bool
		adjusted       string
	}{{false, "200000"}, {true, "150000"}}
	for _, test := range tests {
		result, err := calculateDocument(document, test.multiplicative)
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			t.Fatal(err)
		}
		var object map[string]any
		if err = json.Unmarshal(encoded, &object); err != nil {
			t.Fatal(err)
		}
		container := object["traits"].([]any)[0].(map[string]any)
		leaf := container["children"].([]any)[0].(map[string]any)
		assertFields(t, container, map[string]any{"kind": "trait_container", "id": "TF6lD0le4p2bvHdzA", "adjustedPoints": test.adjusted})
		assertFields(t, leaf, map[string]any{"kind": "trait", "id": "t1aYD-F0-V6Yy54oC", "currentLevel": "20000", "adjustedPoints": test.adjusted})
		assertAbsent(t, leaf, "name", "basePoints", "features")
	}
}

func TestCalculateDocumentRejectsMalformedAndUnsupportedDocuments(t *testing.T) {
	for _, document := range [][]byte{[]byte(`not-json`), []byte(`{"version":4,"traits":[]}`), []byte(`{"version":5,"traits":[null]}`)} {
		if _, err := calculateDocument(document, false); err == nil {
			t.Fatalf("expected failure for %s", document)
		}
	}
}

func TestCalculateDocumentPreservesPresentEmptyChildren(t *testing.T) {
	result, err := calculateDocument([]byte(`{"version":5,"traits":[{"id":"TF6lD0le4p2bvHdzA","name":"Empty","children":[]}]}`), false)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var object map[string]any
	if err = json.Unmarshal(encoded, &object); err != nil {
		t.Fatal(err)
	}
	container := object["traits"].([]any)[0].(map[string]any)
	children, exists := container["children"]
	if !exists || len(children.([]any)) != 0 {
		t.Fatalf("expected present empty children, got %#v", container)
	}
}
