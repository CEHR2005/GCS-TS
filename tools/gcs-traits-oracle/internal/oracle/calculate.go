package oracle

import (
	jsonv2 "encoding/json/v2"
	"fmt"

	"github.com/richardwilkes/gcs/v5/model/gurps"
)

type calculation struct {
	Traits []calculatedTrait `json:"traits"`
}

type calculatedTrait struct {
	Kind            string            `json:"kind"`
	ID              string            `json:"id"`
	CurrentLevel    *string           `json:"currentLevel,omitempty"`
	AdjustedPoints  string            `json:"adjustedPoints"`
	Children        []calculatedTrait `json:"children,omitempty"`
	ChildrenPresent bool              `json:"-"`
}

func calculateDocument(document []byte, useMultiplicativeModifiers bool) (calculation, error) {
	var wrapper struct {
		Version int            `json:"version"`
		Traits  []*gurps.Trait `json:"traits"`
	}
	if err := jsonv2.Unmarshal(document, &wrapper); err != nil {
		return calculation{}, fmt.Errorf("decode GCS document: %w", err)
	}
	if wrapper.Version != 5 {
		return calculation{}, fmt.Errorf("unsupported GCS data version %d", wrapper.Version)
	}
	entity := &gurps.Entity{}
	entity.SheetSettings = gurps.FactorySheetSettings()
	entity.SheetSettings.Entity = entity
	entity.SheetSettings.UseMultiplicativeModifiers = useMultiplicativeModifiers
	entity.Traits = wrapper.Traits
	for _, trait := range entity.Traits {
		if trait == nil {
			return calculation{}, fmt.Errorf("nil trait")
		}
		trait.SetDataOwner(entity)
	}
	traits := make([]calculatedTrait, len(entity.Traits))
	for i, trait := range entity.Traits {
		var err error
		if traits[i], err = calculateTrait(trait); err != nil {
			return calculation{}, fmt.Errorf("calculate trait %d: %w", i, err)
		}
	}
	return calculation{Traits: traits}, nil
}

func calculateTrait(trait *gurps.Trait) (calculatedTrait, error) {
	if trait == nil {
		return calculatedTrait{}, fmt.Errorf("nil trait")
	}
	result := calculatedTrait{ID: projectTID(trait.TID), AdjustedPoints: rawFxp(trait.AdjustedPoints())}
	if !trait.Container() {
		result.Kind = "trait"
		currentLevel := rawFxp(trait.CurrentLevel())
		result.CurrentLevel = &currentLevel
		return result, nil
	}
	result.Kind = "trait_container"
	if trait.Children != nil {
		result.ChildrenPresent = true
		result.Children = make([]calculatedTrait, len(trait.Children))
		for i, child := range trait.Children {
			var err error
			if result.Children[i], err = calculateTrait(child); err != nil {
				return calculatedTrait{}, fmt.Errorf("calculate child %d: %w", i, err)
			}
		}
	}
	return result, nil
}

func (t calculatedTrait) MarshalJSON() ([]byte, error) {
	type alias calculatedTrait
	if !t.ChildrenPresent {
		return jsonv2.Marshal(alias(t))
	}
	type withChildren struct {
		alias
		Children []calculatedTrait `json:"children"`
	}
	return jsonv2.Marshal(withChildren{alias: alias(t), Children: t.Children})
}
