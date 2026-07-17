package oracle

import (
	"encoding/json"
	"fmt"

	"github.com/richardwilkes/gcs/v5/model/kinds"
	toolboxTid "github.com/richardwilkes/toolbox/v2/tid"
)

type tidInspection struct {
	SyntaxValid   bool   `json:"syntaxValid"`
	SupportedKind bool   `json:"supportedKind"`
	Kind          string `json:"kind"`
}

func handleTIDInspect(args json.RawMessage) (result any, category string, message string, err error) {
	var input struct {
		Input *string `json:"input"`
	}
	if err := json.Unmarshal(args, &input); err != nil {
		return nil, "", "", fmt.Errorf("decode tid.inspect args: %w", err)
	}
	if input.Input == nil {
		return nil, "", "", fmt.Errorf("decode tid.inspect args: missing input")
	}

	id := toolboxTid.TID(*input.Input)
	valid := toolboxTid.IsValid(id)
	kind := byte(0)
	kindText := ""
	if len(id) != 0 {
		kind = id[0]
		kindText = string(kind)
	}
	supported := valid && (kind == kinds.Trait || kind == kinds.TraitContainer ||
		kind == kinds.TraitModifier || kind == kinds.TraitModifierContainer)
	return tidInspection{
		SyntaxValid:   valid,
		SupportedKind: supported,
		Kind:          kindText,
	}, "", "", nil
}
