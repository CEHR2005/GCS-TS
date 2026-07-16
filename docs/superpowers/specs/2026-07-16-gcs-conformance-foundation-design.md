# GCS TypeScript Conformance Foundation Design

## Summary

Build the first independent slice of the future GURPS character manager: a Docker-first pnpm monorepo containing a production TypeScript package, `gcs-engine`, and a test-only Go oracle. The foundation strictly parses and serializes `.gcs` data version 5 and proves semantic round-trip compatibility against GCS v5.44.0.

Next.js, shadcn/ui, Prisma, PostgreSQL, drag-and-drop, and GURPS calculations are deliberately outside this slice.

## Architecture

- The repository is a pnpm workspace. This slice creates only `packages/gcs-engine`, `tools/gcs-oracle`, the v5 fixture corpus, shared tooling, and CI.
- `packages/gcs-engine` is a runtime-dependency-free TypeScript package. It validates only the GCS v5 envelope, preserves all JSON data, and never claims to calculate derived GURPS values.
- `tools/gcs-oracle` is a test-only Go CLI pinned to `github.com/richardwilkes/gcs/v5 v5.44.0`. It loads a document with the official API, recalculates it, and emits normalized JSON.
- Conformance compares official normalization of the source document with official normalization after the TypeScript parse/serialize round-trip.
- A curated committed corpus makes CI deterministic; the complete local corpus is available through an explicit opt-in command.

## Toolchain

The pinned versions are:

- Node.js 24.18.0 LTS;
- pnpm 11.13.1;
- TypeScript 6.0.3;
- Vitest 4.1.10 and Vite 8.1.5;
- ESLint 10.7.0, typescript-eslint 8.64.0, and Prettier 3.9.5;
- Go 1.26.5 for tests and CI only;
- GCS v5.44.0 and GCS Master Library v5.12.0.

The canonical execution environment is Docker Compose because the host does not provide the required Node, pnpm, or Go versions. The toolchain image pins the official multi-architecture image digests:

- `node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`;
- `golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651`.

The canonical gate is:

```bash
docker compose run --rm toolchain pnpm check
```

GitHub Actions runs the same Docker-first gate on pushes and pull requests.

## Public TypeScript API

```ts
export const GCS_DATA_VERSION = 5 as const;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type GcsDocumentV5 = {
  version: 5;
  [key: string]: JsonValue;
};

export type GcsParseErrorCode =
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "ROOT_NOT_OBJECT"
  | "MISSING_VERSION"
  | "UNSUPPORTED_VERSION";

export class GcsParseError extends Error {
  readonly code: GcsParseErrorCode;
  readonly path?: string;
}

export function parseGcsV5(input: string | Uint8Array): GcsDocumentV5;

export function serializeGcsV5(document: GcsDocumentV5): string;
```

`parseGcsV5` uses fatal UTF-8 decoding for byte input, strict JSON parsing, an object root check, and an exact `version === 5` check. It does not repair or normalize content.

`serializeGcsV5` validates the envelope again, emits tab-indented JSON plus a final newline, and preserves unknown fields and `third_party` semantically. JSON key order is not a compatibility contract.

## Oracle Protocol

The oracle uses line-delimited JSON over stdin/stdout. Each request contains an `id`, `op: "normalize"`, and the raw `.gcs` document as a string. A response echoes the `id` and is one of:

- `{ "id": "...", "ok": true, "document": { ... } }`;
- `{ "id": "...", "ok": false, "category": "invalid_json|unsupported_version|invalid_gcs", "message": "..." }`.

Localized or release-specific error text is not compared. Malformed protocol input and internal failures terminate the process with a non-zero exit so CI cannot silently continue.

## Fixtures and Licensing

The committed upstream fixtures are:

- `Master Library/Thaumatology/Wang Laowu.gcs`;
- `Master Library/Dungeon Fantasy RPG/Monsters/Dragons/Dragon, Large, Fire.gcs`;
- `Master Library/Dungeon Fantasy RPG/Monsters/Lich.gcs`.

Their manifest records source repository, source tag, source path, and SHA-256. Synthetic fixtures cover minimal and invalid envelopes without copying upstream data.

The TypeScript engine package and files translated from GCS are distributed under MPL-2.0 with the required notices. The rest of the monorepo remains separately licensable. This is a conservative engineering boundary, not legal advice.

## Validation

The mandatory gate runs formatting, linting, type checking, TypeScript unit tests, Go oracle tests, TypeScript-to-Go conformance tests, package build, dependency tree inspection, and a production audit that rejects high or critical findings.

Tests cover invalid UTF-8, malformed JSON, non-object roots, missing versions, v1/v6 rejection, v5 acceptance, Unicode, decimals, empty or absent collections, nested `third_party`, unknown fields, tab indentation, and the final newline.

For every curated fixture, the recursively key-sorted result of `oracle(normalize(original))` must equal `oracle(normalize(serialize(parse(original))))`.

Data versions 2 through 4 are explicitly marked unsupported by this foundation. The separate extended-corpus command requires `GCS_CORPUS_DIR`; invoking it without that variable is an error rather than a skip.

## Operational Notes for Future Slices

- `calc` fields are derived by GCS `Recalculate` and are never editable source state.
- Unknown fields and `third_party` must survive round trips.
- Only containers may have children, and future mutations must reject cycles.
- GCS `Toggle State` changes `disabled` for traits; it is not available for skills.
- GCS table search is a case-insensitive substring match; multiple selected tags use AND semantics.
- The next engine slice ports fixed-point values, enums, and TID primitives. Full calculation parity is reached through later domain slices, not this foundation.

## Acceptance Criteria

- A fresh checkout can build the pinned toolchain and run the canonical gate without host-level installation.
- The engine package has no runtime dependencies and emits TypeScript declarations.
- All curated fixtures pass semantic oracle comparison.
- Capability limitations are explicit and machine-readable.
- Fixture provenance, licensing, and digests are verified by tests.
- No manually maintained source file exceeds the 500-line soft cap; the 350-line target is preferred.
