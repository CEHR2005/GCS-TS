# @gcs/gcs-engine

Runtime-dependency-free GCS data version 5 parsing, serialization, and engine
primitives.

Machine-readable data-version support is declared in the package manifest's `gcsCapabilities` field.

```ts
import { parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";

const document = parseGcsV5(source);
const output = serializeGcsV5(document);
```

The parser validates only the JSON envelope and exact `version: 5` marker. It
preserves unknown fields semantically and does not normalize content, generate
IDs, recalculate GURPS values, or support other GCS data versions.

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

This package is licensed under MPL-2.0. See [LICENSE](./LICENSE).
