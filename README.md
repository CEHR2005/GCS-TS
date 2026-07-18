# GCS TypeScript Conformance Foundation

This repository is the first, deliberately narrow slice of a future GURPS 4
character manager. It provides a production TypeScript package that strictly
parses and serializes GCS data version 5 and exposes conformant fixed-point,
typed-ID, selected persisted-enum primitives, and a strict readonly projection
of traits and trait modifiers. Test-only Go oracles prove the document round
trip, primitive behavior, and known trait source fields against pinned upstream
GCS sources.

GURPS calculations, recalculation, trait mutation or write-back, Next.js, UI,
persistence, and drag-and-drop are not part of this slice.

## Setup and verification

Docker with Compose is the only host prerequisite. The canonical environment
pins Node 24.18.0, pnpm 11.13.1, Go 1.26.5, and both base-image digests; no host
Node, pnpm, or Go installation is required.

```sh
docker compose build toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm check
```

`pnpm check` runs formatting, linting, TypeScript type checks, unit tests, all
three Go oracle suites, document, primitive, and trait conformance tests, the
package build and built-package smoke test, dependency-tree inspection, and a
production dependency audit rejecting high and critical findings. CI executes
the same Docker-first sequence.

The base images are digest-pinned, but the Debian packages installed during
the image build resolve from mutable Bookworm APT repositories. The toolchain
is rebuildable against the current Bookworm repository state, but it is not
bit-for-bit reproducible or hermetic. Rebuild periodically with
`docker compose build --no-cache toolchain` to detect upstream package drift.

## TypeScript API

`@gcs/gcs-engine` has no runtime dependencies.

```ts
import {
  GcsParseError,
  GcsTraitProjectionError,
  parseGcsV5,
  projectGcsTraitsV5,
  serializeGcsV5,
} from "@gcs/gcs-engine";

try {
  const character = parseGcsV5(source);
  const traits = projectGcsTraitsV5(character);
  // Use the deeply frozen `traits` read model here.

  // Keep the original document as the only supported serialization source.
  const exported = serializeGcsV5(character);
} catch (error) {
  if (error instanceof GcsParseError) {
    console.error(error.code, error.path);
  } else if (error instanceof GcsTraitProjectionError) {
    console.error(error.code, error.path);
  }
}
```

`parseGcsV5` accepts a string or `Uint8Array`. It requires valid UTF-8, a JSON
object root, and an exact `version: 5`. `serializeGcsV5` emits tab-indented JSON
with a final newline. Both preserve unknown fields and `third_party`
semantically; key order and byte-identical output are not compatibility
contracts.

Only GCS data version 5 is supported. Versions 1 through 4 and version 6 or
later are rejected. The `parseGcsV5` and `serializeGcsV5` document APIs do not
repair data, generate IDs, recalculate values, or mutate character state.

Consumers can inspect the package manifest's `gcsCapabilities` field for the
machine-readable data-version support policy.

`projectGcsTraitsV5` returns `readonly GcsTraitNodeV5[] | undefined` and
discriminates four node kinds: `trait`, `trait_container`, `trait_modifier`,
and `trait_modifier_container`. It validates persisted source fields strictly,
reports stable errors with RFC 6901 JSON-pointer paths, and produces a deeply
frozen projection with no mutable aliases to the parsed document. Fixed-point
JSON numbers are accepted only in the exact safe real range
`-900719925474.0991..900719925474.0991`.

Complex `features`, prerequisites, weapons, template-picker data,
`third_party`, and derived `calc` values remain opaque readonly JSON. The
projection does not calculate or interpret them. It also omits unknown node
fields, so consumers must retain the untouched `GcsDocumentV5` and pass that
original document to `serializeGcsV5`; reconstructing a document from the
projection is unsupported and would lose unknown data.

The projection is a read model only. It does not mutate source state, write
changes back, calculate or recalculate values, or migrate or repair invalid
data. The next engine slice may add calculation parity, including cost parsing
and derived `calc` behavior, but it must remain separate from this readonly
source projection.

The primitives surface includes signed 64-bit fixed-point values at scale
10,000, four trait-related typed-ID kinds backed by cryptographic randomness,
and the persisted enums used by the projection. Strict enum parsers reject
unknown values; compatibility normalizers preserve pinned GCS fallback
behavior with visible diagnostics. See the
[`@gcs/gcs-engine` README](packages/gcs-engine/README.md) for the API and
examples.

## GCS oracle and conformance

`tools/gcs-oracle`, `tools/gcs-primitives-oracle`, and
`tools/gcs-traits-oracle` are JSONL Go CLIs pinned to
`github.com/richardwilkes/gcs/v5` v5.44.0; the primitive and trait oracles also
pin `github.com/richardwilkes/toolbox/v2` v2.15.0. They are test and CI oracles
only; production code remains TypeScript-only and runtime-dependency-free.
Curated conformance compares official GCS normalization before and after the
TypeScript parse/serialize round trip and compares known projected trait source
fields with pinned GCS decoding.

Three unmodified fixtures come from GCS Master Library v5.12.0. Their upstream
paths and exact SHA-256 digests are recorded in
`fixtures/gcs-v5/manifest.json` and verified by the test suite:

| Fixture             | Upstream path                                                          |
| ------------------- | ---------------------------------------------------------------------- |
| Wang Laowu          | `Library/Thaumatology/Wang Laowu.gcs`                                  |
| Dragon, Large, Fire | `Library/Dungeon Fantasy RPG/Monsters/Dragons/Dragon, Large, Fire.gcs` |
| Lich                | `Library/Dungeon Fantasy RPG/Monsters/Lich.gcs`                        |

See `THIRD_PARTY_NOTICES.md` for provenance and licensing details.

To test an additional local corpus, mount it read-only and provide the required
container path:

```sh
export GCS_CORPUS_DIR=/absolute/path/to/gcs-corpus
docker compose run --rm \
  --volume "$GCS_CORPUS_DIR:/corpus:ro" \
  --env GCS_CORPUS_DIR=/corpus \
  toolchain pnpm test:corpus
```

The host `GCS_CORPUS_DIR` supplies the source of the read-only bind mount. The
`--env` option independently sets the in-container path consumed by the corpus
test to `/corpus`.

Running `docker compose run --rm toolchain pnpm test:corpus` without the
container environment variable fails with an explicit `GCS_CORPUS_DIR is
required` error. The corpus test also fails when the directory contains no
`.gcs` files. It scans the corpus in one Node process and reuses one oracle
process.

## Scope and licensing

`packages/gcs-engine` and the upstream fixture excerpts are covered by
MPL-2.0. The remainder of the monorepo is separately licensable; see the
package license and `THIRD_PARTY_NOTICES.md`.

Calculation parity is the next engine boundary; trait editing and write-back
remain separate later work. The web application also belongs to a later slice.
