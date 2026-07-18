package oracle

import (
	jsonv2 "encoding/json/v2"
	"fmt"
	"maps"
	"slices"
	"strconv"

	"github.com/richardwilkes/gcs/v5/model/fxp"
	"github.com/richardwilkes/gcs/v5/model/gurps"
	"github.com/richardwilkes/toolbox/v2/tid"
)

type projection struct {
	Traits []projectedTrait `json:"traits"`
}

type projectedTrait interface {
	projectedTraitNode()
}

type projectedModifier interface {
	projectedModifierNode()
}

type sourceProjection struct {
	Library string `json:"library"`
	Path    string `json:"path"`
	ID      string `json:"id"`
}

type studyProjection struct {
	Type     string `json:"type"`
	HoursRaw string `json:"hoursRaw"`
	Note     string `json:"note"`
}

type traitCommonProjection struct {
	Kind                  string              `json:"kind"`
	ID                    string              `json:"id"`
	Source                *sourceProjection   `json:"source,omitempty"`
	Name                  string              `json:"name"`
	Reference             string              `json:"reference"`
	ReferenceHighlight    string              `json:"referenceHighlight"`
	LocalNotes            string              `json:"localNotes"`
	Tags                  []string            `json:"tags"`
	SelfControlRoll       int                 `json:"selfControlRoll"`
	SelfControlAdjustment string              `json:"selfControlAdjustment"`
	Frequency             int                 `json:"frequency"`
	Disabled              bool                `json:"disabled"`
	VTTNotes              string              `json:"vttNotes"`
	UserDescription       string              `json:"userDescription"`
	Replacements          map[string]string   `json:"replacements"`
	ModifiersPresent      bool                `json:"modifiersPresent"`
	Modifiers             []projectedModifier `json:"modifiers"`
}

type traitLeafProjection struct {
	traitCommonProjection
	BasePointsRaw     string            `json:"basePointsRaw"`
	PointsPerLevelRaw string            `json:"pointsPerLevelRaw"`
	LevelsRaw         string            `json:"levelsRaw"`
	RoundDown         bool              `json:"roundDown"`
	CanLevel          bool              `json:"canLevel"`
	Study             []studyProjection `json:"study"`
	StudyHoursNeeded  string            `json:"studyHoursNeeded"`
	ChildrenPresent   bool              `json:"childrenPresent"`
}

func (traitLeafProjection) projectedTraitNode() {}

type traitContainerProjection struct {
	traitCommonProjection
	Ancestry        string           `json:"ancestry"`
	ContainerType   string           `json:"containerType"`
	ChildrenPresent bool             `json:"childrenPresent"`
	Children        []projectedTrait `json:"children"`
}

func (traitContainerProjection) projectedTraitNode() {}

type modifierCommonProjection struct {
	Kind               string            `json:"kind"`
	ID                 string            `json:"id"`
	Source             *sourceProjection `json:"source,omitempty"`
	Name               string            `json:"name"`
	Reference          string            `json:"reference"`
	ReferenceHighlight string            `json:"referenceHighlight"`
	LocalNotes         string            `json:"localNotes"`
	Tags               []string          `json:"tags"`
	VTTNotes           string            `json:"vttNotes"`
	Replacements       map[string]string `json:"replacements"`
}

type modifierLeafProjection struct {
	modifierCommonProjection
	CostAdjustment    string `json:"costAdjustment"`
	UseLevelFromTrait bool   `json:"useLevelFromTrait"`
	ShowNotesOnWeapon bool   `json:"showNotesOnWeapon"`
	Affects           string `json:"affects"`
	LevelsRaw         string `json:"levelsRaw"`
	Disabled          bool   `json:"disabled"`
	ChildrenPresent   bool   `json:"childrenPresent"`
}

func (modifierLeafProjection) projectedModifierNode() {}

type modifierContainerProjection struct {
	modifierCommonProjection
	ChildrenPresent bool                `json:"childrenPresent"`
	Children        []projectedModifier `json:"children"`
}

func (modifierContainerProjection) projectedModifierNode() {}

func projectDocument(document []byte) (projection, error) {
	var wrapper struct {
		Version int            `json:"version"`
		Traits  []*gurps.Trait `json:"traits"`
	}
	if err := jsonv2.Unmarshal(document, &wrapper); err != nil {
		return projection{}, fmt.Errorf("decode GCS document: %w", err)
	}
	if wrapper.Version != 5 {
		return projection{}, fmt.Errorf("unsupported GCS data version %d", wrapper.Version)
	}
	traits := make([]projectedTrait, len(wrapper.Traits))
	for i, trait := range wrapper.Traits {
		var err error
		if traits[i], err = projectTrait(trait); err != nil {
			return projection{}, fmt.Errorf("project trait %d: %w", i, err)
		}
	}
	return projection{Traits: traits}, nil
}

func projectTrait(trait *gurps.Trait) (projectedTrait, error) {
	if trait == nil {
		return nil, fmt.Errorf("nil trait")
	}
	common, err := projectTraitCommon(trait)
	if err != nil {
		return nil, err
	}
	if !trait.Container() {
		common.Kind = "trait"
		study := make([]studyProjection, len(trait.Study))
		for i, one := range trait.Study {
			if one == nil {
				return nil, fmt.Errorf("nil study record %d", i)
			}
			study[i] = studyProjection{Type: one.Type.Key(), HoursRaw: rawFxp(one.Hours), Note: one.Note}
		}
		return traitLeafProjection{
			traitCommonProjection: common,
			BasePointsRaw:         rawFxp(trait.BasePoints),
			PointsPerLevelRaw:     rawFxp(trait.PointsPerLevel),
			LevelsRaw:             rawFxp(trait.Levels),
			RoundDown:             trait.RoundCostDown,
			CanLevel:              trait.CanLevel,
			Study:                 study,
			StudyHoursNeeded:      trait.StudyHoursNeeded.Key(),
		}, nil
	}

	common.Kind = "trait_container"
	children := make([]projectedTrait, len(trait.Children))
	for i, child := range trait.Children {
		if children[i], err = projectTrait(child); err != nil {
			return nil, fmt.Errorf("project child %d: %w", i, err)
		}
	}
	return traitContainerProjection{
		traitCommonProjection: common,
		Ancestry:              trait.Ancestry,
		ContainerType:         trait.ContainerType.Key(),
		ChildrenPresent:       trait.Children != nil,
		Children:              children,
	}, nil
}

func projectTraitCommon(trait *gurps.Trait) (traitCommonProjection, error) {
	modifiers := make([]projectedModifier, len(trait.Modifiers))
	for i, modifier := range trait.Modifiers {
		var err error
		if modifiers[i], err = projectModifier(modifier); err != nil {
			return traitCommonProjection{}, fmt.Errorf("project modifier %d: %w", i, err)
		}
	}
	return traitCommonProjection{
		ID:                    projectTID(trait.TID),
		Source:                projectSource(trait.Source),
		Name:                  trait.Name,
		Reference:             trait.PageRef,
		ReferenceHighlight:    trait.PageRefHighlight,
		LocalNotes:            trait.LocalNotes,
		Tags:                  slices.Clone(trait.Tags),
		SelfControlRoll:       int(trait.SelfControl),
		SelfControlAdjustment: trait.SelfControlAdj.Key(),
		Frequency:             int(trait.Frequency),
		Disabled:              trait.Disabled,
		VTTNotes:              trait.VTTNotes,
		UserDescription:       trait.UserDesc,
		Replacements:          maps.Clone(trait.Replacements),
		ModifiersPresent:      trait.Modifiers != nil,
		Modifiers:             modifiers,
	}, nil
}

func projectModifier(modifier *gurps.TraitModifier) (projectedModifier, error) {
	if modifier == nil {
		return nil, fmt.Errorf("nil trait modifier")
	}
	common := modifierCommonProjection{
		ID:                 projectTID(modifier.TID),
		Source:             projectSource(modifier.Source),
		Name:               modifier.Name,
		Reference:          modifier.PageRef,
		ReferenceHighlight: modifier.PageRefHighlight,
		LocalNotes:         modifier.LocalNotes,
		Tags:               slices.Clone(modifier.Tags),
		VTTNotes:           modifier.VTTNotes,
		Replacements:       maps.Clone(modifier.Replacements),
	}
	if !modifier.Container() {
		common.Kind = "trait_modifier"
		return modifierLeafProjection{
			modifierCommonProjection: common,
			CostAdjustment:           modifier.CostAdj,
			UseLevelFromTrait:        modifier.UseLevelFromTrait,
			ShowNotesOnWeapon:        modifier.ShowNotesOnWeapon,
			Affects:                  modifier.Affects.Key(),
			LevelsRaw:                rawFxp(modifier.Levels),
			Disabled:                 modifier.Disabled,
		}, nil
	}

	common.Kind = "trait_modifier_container"
	children := make([]projectedModifier, len(modifier.Children))
	for i, child := range modifier.Children {
		var err error
		if children[i], err = projectModifier(child); err != nil {
			return nil, fmt.Errorf("project child %d: %w", i, err)
		}
	}
	return modifierContainerProjection{
		modifierCommonProjection: common,
		ChildrenPresent:          modifier.Children != nil,
		Children:                 children,
	}, nil
}

func projectSource(source gurps.Source) *sourceProjection {
	if source.IsZero() {
		return nil
	}
	return &sourceProjection{Library: source.Library, Path: source.Path, ID: projectTID(source.TID)}
}

func rawFxp(value fxp.Int) string {
	return strconv.FormatInt(int64(value), 10)
}

func projectTID(value tid.TID) string {
	return string(value)
}
