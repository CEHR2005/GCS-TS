# GCS TypeScript Conformance Foundation

This repository is the first, deliberately narrow slice of a future GURPS 4
character manager. It provides a production TypeScript package that strictly
parses and serializes GCS data version 5, plus a test-only oracle proving that
the round trip preserves official GCS semantics.

Next.js, UI, persistence, drag-and-drop, and GURPS calculation rules are not
part of this foundation.

## Setup and verification

Docker with Compose is the only host prerequisite. The canonical environment
pins Node 24.18.0, pnpm 11.13.1, Go 1.26.5, and both base-image digests; no host
Node, pnpm, or Go installation is required.

```sh
docker compose build toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm check
```

`pnpm check` runs formatting, linting, TypeScript type checks, unit tests, Go
oracle tests, curated conformance tests, the package build, dependency-tree
inspection, and a production dependency audit rejecting high and critical
findings. CI executes the same Docker-first sequence.

The base images are digest-pinned, but the Debian packages installed during
the image build resolve from mutable Bookworm APT repositories. The toolchain
is rebuildable against the current Bookworm repository state, but it is not
bit-for-bit reproducible or hermetic. Rebuild periodically with
`docker compose build --no-cache toolchain` to detect upstream package drift.

## TypeScript API

`@gcs/gcs-engine` has no runtime dependencies.

```ts
import { GcsParseError, parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";

try {
  const character = parseGcsV5(source);
  const exported = serializeGcsV5(character);
} catch (error) {
  if (error instanceof GcsParseError) {
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
later are rejected. The engine does not repair data, generate IDs, recalculate
values, or mutate character state.

## GCS oracle and conformance

`tools/gcs-oracle` is a JSONL Go CLI pinned to
`github.com/richardwilkes/gcs/v5` v5.44.0. It is only a test and CI oracle;
production code remains TypeScript-only. Curated conformance compares official
GCS normalization before and after the TypeScript parse/serialize round trip.

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

The next engine slice will port fixed-point values, enums, and TID primitives.
Calculation parity and the web application belong to later slices.
