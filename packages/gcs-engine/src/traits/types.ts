import type {
  FrequencyRoll,
  SelfControlAdjustment,
  SelfControlRoll,
  StudyLevel,
  StudyType,
  TraitContainerType,
  TraitModifierAffects,
} from "../enums/index.js";
import type { Fxp } from "../fxp/index.js";
import type { Tid } from "../tid/index.js";

export type GcsReadonlyJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GcsReadonlyJsonValue[]
  | GcsReadonlyJsonObject;

export type GcsReadonlyJsonObject = {
  readonly [key: string]: GcsReadonlyJsonValue;
};

export type GcsSourceV5 = {
  readonly library: string;
  readonly path: string;
  readonly id: Tid;
};

export type GcsStudyV5 = {
  readonly type: StudyType;
  readonly hours: Fxp;
  readonly note?: string;
};

export type GcsTraitCommonV5 = {
  readonly id: Tid;
  readonly source?: GcsSourceV5;
  readonly name?: string;
  readonly reference?: string;
  readonly referenceHighlight?: string;
  readonly localNotes?: string;
  readonly tags?: readonly string[];
  readonly prerequisites?: GcsReadonlyJsonObject;
  readonly selfControlRoll?: SelfControlRoll;
  readonly selfControlAdjustment?: SelfControlAdjustment;
  readonly frequency?: FrequencyRoll;
  readonly disabled?: boolean;
  readonly vttNotes?: string;
  readonly userDescription?: string;
  readonly replacements?: Readonly<Record<string, string>>;
  readonly modifiers?: readonly GcsTraitModifierNodeV5[];
  readonly thirdParty?: GcsReadonlyJsonObject;
  readonly calc?: GcsReadonlyJsonObject;
};

export type GcsTraitNodeV5 = GcsTraitV5 | GcsTraitContainerV5;
export type GcsTraitModifierNodeV5 =
  GcsTraitModifierV5 | GcsTraitModifierContainerV5;

export type GcsTraitV5 = GcsTraitCommonV5 & {
  readonly kind: "trait";
  readonly basePoints?: Fxp;
  readonly pointsPerLevel?: Fxp;
  readonly levels?: Fxp;
  readonly roundDown?: boolean;
  readonly canLevel?: boolean;
  readonly study?: readonly GcsStudyV5[];
  readonly studyHoursNeeded?: StudyLevel;
  readonly features?: readonly GcsReadonlyJsonValue[];
  readonly weapons?: readonly GcsReadonlyJsonValue[];
};

export type GcsTraitContainerV5 = GcsTraitCommonV5 & {
  readonly kind: "trait_container";
  readonly ancestry?: string;
  readonly templatePicker?: GcsReadonlyJsonObject;
  readonly containerType?: TraitContainerType;
  readonly children?: readonly GcsTraitNodeV5[];
};

export type GcsTraitModifierCommonV5 = {
  readonly id: Tid;
  readonly source?: GcsSourceV5;
  readonly name?: string;
  readonly reference?: string;
  readonly referenceHighlight?: string;
  readonly localNotes?: string;
  readonly tags?: readonly string[];
  readonly vttNotes?: string;
  readonly replacements?: Readonly<Record<string, string>>;
  readonly thirdParty?: GcsReadonlyJsonObject;
  readonly calc?: GcsReadonlyJsonObject;
};

export type GcsTraitModifierV5 = GcsTraitModifierCommonV5 & {
  readonly kind: "trait_modifier";
  readonly costAdjustment?: string;
  readonly useLevelFromTrait?: boolean;
  readonly showNotesOnWeapon?: boolean;
  readonly affects?: TraitModifierAffects;
  readonly features?: readonly GcsReadonlyJsonValue[];
  readonly levels?: Fxp;
  readonly disabled?: boolean;
};

export type GcsTraitModifierContainerV5 = GcsTraitModifierCommonV5 & {
  readonly kind: "trait_modifier_container";
  readonly children?: readonly GcsTraitModifierNodeV5[];
};
