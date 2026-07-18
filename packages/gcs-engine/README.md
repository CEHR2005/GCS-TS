# @gcs/gcs-engine

Runtime-dependency-free GCS data version 5 parsing, serialization, engine
primitives, and readonly typed trait projection.

Machine-readable data-version support is declared in the package manifest's `gcsCapabilities` field.

```ts
import { parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";

const document = parseGcsV5(source);
const output = serializeGcsV5(document);
```

The parser validates only the JSON envelope and exact `version: 5` marker. It
preserves unknown fields semantically and does not normalize content, generate
IDs, recalculate GURPS values, or support other GCS data versions.

## Typed traits and modifiers

`projectGcsTraitsV5` validates trait source fields in an already parsed
`GcsDocumentV5` and returns `readonly GcsTraitNodeV5[] | undefined`.
`undefined` means the document has no `traits` property; a present empty array
returns a frozen empty array.

```ts
import {
  GcsTraitProjectionError,
  parseGcsV5,
  projectGcsTraitsV5,
  serializeGcsV5,
} from "@gcs/gcs-engine";

const document = parseGcsV5(source);

try {
  const traits = projectGcsTraitsV5(document);
  for (const trait of traits ?? []) {
    switch (trait.kind) {
      case "trait":
        console.log(trait.name, trait.basePoints);
        break;
      case "trait_container":
        console.log(trait.name, trait.children?.length ?? 0);
        break;
    }
  }
} catch (error) {
  if (error instanceof GcsTraitProjectionError) {
    console.error(error.code, error.path);
  }
}

// Serialize the retained original document, never the projection.
const output = serializeGcsV5(document);
```

The complete tree uses four TID-discriminated node kinds:

- `t` becomes `GcsTraitV5` with `kind: "trait"`;
- `T` becomes `GcsTraitContainerV5` with `kind: "trait_container"`;
- `m` becomes `GcsTraitModifierV5` with `kind: "trait_modifier"`;
- `M` becomes `GcsTraitModifierContainerV5` with
  `kind: "trait_modifier_container"`.

The projection is strict. Invalid fields, enum values, node kinds, container
shapes, cycles, and excessive depth throw `GcsTraitProjectionError` with a
stable `code` and an RFC 6901 JSON-pointer `path`, for example
`/traits/2/modifiers/0/affects`. Compatibility normalizers, migration, and GCS
repair behaviors are not applied.

Persisted fixed-point fields arrive from `JSON.parse` as JavaScript numbers.
To prevent silent precision loss, projection accepts them only in the exact
safe real range `-900719925474.0991..900719925474.0991` and rejects
non-finite, over-precise, or unrecoverable values with `UNSAFE_FXP_NUMBER` at
the field path.

Every projected node, collection, source, study record, replacement map, and
opaque JSON value is cloned and frozen recursively. The result has no mutable
aliases to the input document. TypeScript `readonly` types and runtime freezing
therefore describe the same contract.

`features`, prerequisites, weapons, template-picker data, `third_party`, and
derived `calc` payloads are validated only as opaque JSON and exposed as
readonly clones. They are not interpreted or calculated. Unknown node fields
remain solely in the original document and are intentionally absent from the
projection. Keep that original `GcsDocumentV5` as the serialization source;
reconstructing a document from projected nodes is unsupported and would drop
unknown fields.

This API is a read model. It performs no mutation, creation, deletion,
write-back, point or cost calculation, `Recalculate` behavior, migration, or
repair. Calculation parity—including interpretation of cost adjustments and
derived `calc`—is the next engine boundary; editing and write-back remain a
separate later slice.

## Fixed-point values

`Fxp` stores a signed 64-bit raw integer at scale 10,000, so one point is
`10_000n`. Decimal input beyond four places is truncated toward zero and
formatting produces the canonical ungrouped decimal form without unnecessary
zeroes. Multiplication and division also truncate toward zero. Rounding uses
half away from zero; floor, ceiling, and the GCS `ApplyRounding` behavior are
available separately. Arithmetic follows the pinned GCS wrapping and
saturation rules at signed-64 boundaries. Division or modulo by zero throws a
`GcsPrimitiveError` with code `DIVIDE_BY_ZERO`.

The raw range is `-9223372036854775808` through `9223372036854775807`.
GCS-compatible `+`, `-`, `.`, `+.`, `-.`, and comma-only forms are accepted as
zero even though other malformed forms are rejected.

## Typed IDs

`Tid` supports the four trait-related GCS kinds: `t` (trait), `T` (trait
container), `m` (trait modifier), and `M` (trait modifier container). Each ID
contains a 16-character URL-safe Base64 payload encoding exactly 12 random
bytes. `generateTid` uses `globalThis.crypto.getRandomValues` by default and
throws `CRYPTO_UNAVAILABLE` if cryptographic randomness is unavailable. It
never falls back to `Math.random`. Tests can inject an exact 12-byte random
source.

## Persisted enums

The selected trait, roll, and study enums expose two explicit import paths:

- `parse...` functions accept only canonical persisted values and throw
  `INVALID_ENUM` for other input.
- `normalize...` functions reproduce pinned GCS compatibility behavior while
  matching canonical values case-insensitively without a diagnostic. Legacy
  aliases and fallback defaults return a visible `LEGACY_ALIAS` or
  `FALLBACK_DEFAULT` diagnostic.

For example:

```ts
import {
  formatFxp,
  generateTid,
  normalizeTraitContainerType,
  parseFxp,
  parseTraitContainerType,
} from "@gcs/gcs-engine";

formatFxp(parseFxp("1,234.56789")); // "1234.5678"
generateTid("t"); // cryptographically random 96-bit payload
parseTraitContainerType("ancestry"); // "ancestry"
normalizeTraitContainerType("race");
// { value: "ancestry", diagnostic: { code: "LEGACY_ALIAS", ... } }
```

All primitive validation failures use the exported `GcsPrimitiveError` class
with a stable `code` and optional `path`.

## Test-only upstream oracle

Trait conformance uses `tools/gcs-traits-oracle`, pinned to GCS v5.44.0 and
Toolbox v2.15.0. It decodes canonical v5 trait data through upstream Go types
and compares known source fields with the TypeScript projection. The oracle is
used only by tests and CI: it is not shipped in this package, introduces no
production Go requirement, and adds no runtime dependency. The upstream
sources and translated package behavior are MPL-2.0; see the repository
`THIRD_PARTY_NOTICES.md` for provenance.

This package is licensed under MPL-2.0. See [LICENSE](./LICENSE).
