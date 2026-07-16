# GCS TypeScript Conformance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Docker-first, runtime-dependency-free TypeScript package that strictly parses and serializes GCS data version 5 and proves semantic round-trip compatibility through a test-only GCS v5.44.0 Go oracle.

**Architecture:** A pnpm workspace contains the production `@gcs/gcs-engine` package and repository-level conformance tests. A separate Go module exposes the official GCS parser/recalculator over JSONL and is available only in development, tests, and CI. Docker Compose pins both toolchains and is the only canonical execution environment.

**Tech Stack:** Node.js 24.18.0 LTS, pnpm 11.13.1, TypeScript 6.0.3, Vitest 4.1.10, Vite 8.1.5, ESLint 10.7.0, typescript-eslint 8.64.0, Prettier 3.9.5, Go 1.26.5, GCS v5.44.0, GCS Master Library v5.12.0, Docker Compose, GitHub Actions.

## Global Constraints

- Production remains TypeScript-only; Go exists only in tests, CI, and the Docker toolchain.
- `packages/gcs-engine` has zero runtime dependencies and is licensed MPL-2.0.
- Foundation accepts only GCS data version 5. Versions 2 through 4 are an explicit future capability, not an implicit skip.
- Parsing and serialization preserve unknown fields and `third_party` semantically and never generate IDs, normalize content, or recalculate GURPS values.
- Serialization uses tab indentation and exactly one final newline. JSON object key order is not a compatibility contract.
- The official oracle is pinned to `github.com/richardwilkes/gcs/v5 v5.44.0` and Go 1.26.5.
- Curated Master Library fixtures are pinned to v5.12.0 and verified by SHA-256.
- Canonical verification is `docker compose run --rm toolchain pnpm check`; no host fallback is permitted.
- Manually maintained source files target at most 350 physical lines and must not exceed 500 lines.

---

### Task 1: Reproducible pnpm and Docker Workspace

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.node-version`, `.npmrc`
- Create: `tsconfig.base.json`, `tsconfig.test.json`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`
- Create: `docker/toolchain.Dockerfile`, `compose.yml`, `.dockerignore`
- Test: Docker image build, frozen install, tool version checks

**Interfaces:**

- Produces: root scripts `format`, `format:check`, `lint`, `typecheck`, `test:unit`, `test:oracle`, `test:conformance`, `test:corpus`, `build`, `deps:check`, `audit:prod`, and `check`.
- Produces: a `toolchain` Compose service containing Node, pnpm, and Go; Task 3 adds the compiled `gcs-oracle` binary.

- [ ] **Step 1: Add exact workspace manifests and static-tool configuration**

Use this root package contract:

```json
{
  "name": "gcs-web-foundation",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@11.13.1",
  "engines": {
    "node": "24.18.0",
    "pnpm": "11.13.1"
  },
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc -p tsconfig.test.json --noEmit && pnpm --filter @gcs/gcs-engine typecheck",
    "test:unit": "vitest run packages/gcs-engine",
    "test:oracle": "go -C tools/gcs-oracle test ./...",
    "test:conformance": "vitest run tests/conformance",
    "test:corpus": "vitest run tests/corpus",
    "build": "pnpm --filter @gcs/gcs-engine build",
    "deps:check": "pnpm list --depth Infinity",
    "audit:prod": "pnpm audit --prod --audit-level high",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:oracle && pnpm test:conformance && pnpm build && pnpm deps:check && pnpm audit:prod"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.3",
    "eslint": "10.7.0",
    "prettier": "3.9.5",
    "typescript": "6.0.3",
    "typescript-eslint": "8.64.0",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

Configure strict ESM TypeScript with `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. ESLint uses `@eslint/js` recommended plus `typescript-eslint` recommended and ignores generated output, fixture data, `.worktrees`, and `.superpowers`.

- [ ] **Step 2: Add the pinned Docker toolchain**

Use these exact base references:

```dockerfile
FROM golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS go-toolchain
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
```

Copy `/usr/local/go` from the Go stage into the Node stage, install exactly `pnpm@11.13.1`, set `GOCACHE=/tmp/go-build`, and use `/workspace` as the working directory. Compose bind-mounts the repository and uses named volumes for root `node_modules`, pnpm store, and Go build cache. Task 3 extends the Go stage to build and copy the oracle binary.

- [ ] **Step 3: Build the toolchain and generate the lockfiles**

Run:

```bash
docker compose build toolchain
docker compose run --rm toolchain pnpm install --no-frozen-lockfile
```

Expected: image build succeeds and `pnpm-lock.yaml` is generated. The image exposes Go 1.26.5 but does not attempt to build the oracle before Task 3 creates its module.

- [ ] **Step 4: Verify exact versions and frozen installation**

Run:

```bash
docker compose run --rm toolchain sh -c 'node --version && pnpm --version && go version'
docker compose run --rm toolchain pnpm install --frozen-lockfile
```

Expected: `v24.18.0`, `11.13.1`, `go1.26.5`, and a successful frozen install.

- [ ] **Step 5: Commit the reproducible workspace**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .node-version .npmrc tsconfig.base.json tsconfig.test.json vitest.config.ts eslint.config.mjs .prettierrc.json .prettierignore docker/toolchain.Dockerfile compose.yml .dockerignore
git commit -m "build: add pinned Docker pnpm workspace"
```

---

### Task 2: Strict GCS v5 TypeScript API

**Files:**

- Create: `packages/gcs-engine/package.json`, `packages/gcs-engine/tsconfig.json`, `packages/gcs-engine/tsconfig.build.json`
- Create: `packages/gcs-engine/src/types.ts`, `errors.ts`, `validate.ts`, `parse.ts`, `serialize.ts`, `index.ts`
- Create: `packages/gcs-engine/test/parse.test.ts`, `serialize.test.ts`
- Create: `packages/gcs-engine/LICENSE`, `packages/gcs-engine/README.md`

**Interfaces:**

- Produces: `GCS_DATA_VERSION`, `JsonValue`, `GcsDocumentV5`, `GcsParseErrorCode`, `GcsParseError`, `parseGcsV5`, and `serializeGcsV5` exactly as specified by the design.
- Produces: ESM JavaScript and declaration files in `packages/gcs-engine/dist`.

- [ ] **Step 1: Write failing parser tests**

Cover these exact cases in `parse.test.ts`:

```ts
expect(parseGcsV5('{"version":5,"name":"Åsa"}')).toEqual({
  version: 5,
  name: "Åsa",
});
expectGcsError(() => parseGcsV5(new Uint8Array([0xff])), {
  code: "INVALID_UTF8",
});
expectGcsError(() => parseGcsV5("{"), { code: "INVALID_JSON" });
expectGcsError(() => parseGcsV5("[]"), { code: "ROOT_NOT_OBJECT" });
expectGcsError(() => parseGcsV5("{}"), {
  code: "MISSING_VERSION",
  path: "/version",
});
expectGcsError(() => parseGcsV5('{"version":4}'), {
  code: "UNSUPPORTED_VERSION",
  path: "/version",
});
expectGcsError(() => parseGcsV5('{"version":6}'), {
  code: "UNSUPPORTED_VERSION",
  path: "/version",
});
```

Implement `expectGcsError` in the test file with `try/catch`, `expect(error).toBeInstanceOf(GcsParseError)`, and `expect(error).toMatchObject(expected)` so the tests use supported Vitest matchers.

- [ ] **Step 2: Run parser tests to verify RED**

Run: `docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/parse.test.ts`

Expected: FAIL because `@gcs/gcs-engine` exports do not exist.

- [ ] **Step 3: Implement the minimal parser**

`parseGcsV5` must decode `Uint8Array` with `new TextDecoder("utf-8", { fatal: true })`, call `JSON.parse`, require a non-null non-array object root, require an own `version` property, and require the numeric value `5`. Wrap only decoding and JSON syntax failures; do not swallow programmer errors.

- [ ] **Step 4: Run parser tests to verify GREEN**

Run: `docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/parse.test.ts`

Expected: PASS with seven parser cases.

- [ ] **Step 5: Write failing serializer tests**

Cover semantic preservation and formatting:

```ts
const document = parseGcsV5(
  JSON.stringify({
    version: 5,
    profile: { name: "Ирина" },
    third_party: { nested: [true, 1.25, { value: "未知" }] },
    unknown_extension: { enabled: false },
  }),
);
const output = serializeGcsV5(document);
expect(output.endsWith("\n")).toBe(true);
expect(output.endsWith("\n\n")).toBe(false);
expect(output).toContain('\n\t"profile"');
expect(JSON.parse(output)).toEqual(document);
expectGcsError(() => serializeGcsV5({} as GcsDocumentV5), {
  code: "MISSING_VERSION",
});
```

- [ ] **Step 6: Run serializer tests to verify RED**

Run: `docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/serialize.test.ts`

Expected: FAIL because `serializeGcsV5` does not exist.

- [ ] **Step 7: Implement serialization, exports, package build, and MPL files**

Validate the in-memory object with the same envelope guard and return:

```ts
`${JSON.stringify(document, null, "\t")}\n`;
```

Use package name `@gcs/gcs-engine`, version `0.0.0`, `type: "module"`, `sideEffects: false`, and no `dependencies` field. Copy the unmodified upstream MPL-2.0 license text into the package.

Add `"@gcs/gcs-engine": "workspace:*"` to the root `devDependencies`, then run `docker compose run --rm toolchain pnpm install --no-frozen-lockfile` so repository-level tests resolve the public package through the workspace and the lockfile records the importer.

- [ ] **Step 8: Verify package behavior and build**

Run:

```bash
docker compose run --rm toolchain pnpm test:unit
docker compose run --rm toolchain pnpm typecheck
docker compose run --rm toolchain pnpm build
```

Expected: all TypeScript tests pass and `dist/index.js` plus `dist/index.d.ts` exist.

- [ ] **Step 9: Commit the TypeScript API**

```bash
git add packages/gcs-engine
git commit -m "feat: add strict GCS v5 parse serialize API"
```

---

### Task 3: Official GCS Go Oracle

**Files:**

- Create: `tools/gcs-oracle/go.mod`, `go.sum`
- Create: `tools/gcs-oracle/internal/oracle/oracle.go`, `oracle_test.go`
- Create: `tools/gcs-oracle/cmd/gcs-oracle/main.go`
- Modify: `docker/toolchain.Dockerfile`

**Interfaces:**

- Consumes: JSONL requests `{ id: string, op: "normalize", document: string }`.
- Produces: JSONL success `{ id, ok: true, document }` or expected-data failure `{ id, ok: false, category, message }`.
- Produces: non-zero process exit for malformed protocol input, unsupported operations, scanner errors, encoding errors, and internal failures.

- [ ] **Step 1: Write failing oracle unit tests**

Test `ProcessLine([]byte) ([]byte, error)` with:

```go
request := []byte(`{"id":"one","op":"normalize","document":"{\"version\":5}"}`)
response, err := ProcessLine(request)
if err != nil {
	t.Fatal(err)
}
if !bytes.Contains(response, []byte(`"ok":true`)) {
	t.Fatalf("unexpected response: %s", response)
}
```

Also assert invalid embedded JSON returns `category: "invalid_json"`, version 6 returns `category: "unsupported_version"`, and malformed protocol JSON or an unsupported `op` returns a non-nil Go error.

- [ ] **Step 2: Run oracle tests to verify RED**

Run: `docker compose run --rm toolchain go -C tools/gcs-oracle test ./...`

Expected: FAIL because the Go module and `ProcessLine` do not exist.

- [ ] **Step 3: Implement minimal normalization and classification**

Use `encoding/json` for the protocol, `testing/fstest.MapFS` for `character.gcs`, `gurps.NewEntityFromFile` for parsing, and `encoding/json/v2.Marshal` for normalized output. Disable automatic profile filling and natural-attack creation once before parsing. Classify invalid JSON before invoking GCS; classify versions outside GCS 2 through 5 as `unsupported_version`; classify remaining expected parse failures as `invalid_gcs`.

- [ ] **Step 4: Implement the JSONL command**

Use `bufio.Scanner` with a 16 MiB maximum token. Process every valid line and flush one response line. Return a process error immediately for protocol errors; write errors to stderr and exit 1. Empty stdin is successful and produces no output.

- [ ] **Step 5: Run oracle tests to verify GREEN**

Run: `docker compose run --rm toolchain go -C tools/gcs-oracle test ./...`

Expected: PASS for normalization, three error categories, and protocol failures.

- [ ] **Step 6: Rebuild and smoke-test the compiled oracle**

Run:

```bash
docker compose build toolchain
printf '%s\n' '{"id":"smoke","op":"normalize","document":"{\"version\":5}"}' | docker compose run --rm -T toolchain gcs-oracle
```

Expected: one JSON response with `"id":"smoke"` and `"ok":true`.

- [ ] **Step 7: Commit the oracle**

```bash
git add tools/gcs-oracle docker/toolchain.Dockerfile
git commit -m "test: add pinned official GCS oracle"
```

---

### Task 4: Curated Fixtures and Semantic Conformance

**Files:**

- Create: `fixtures/gcs-v5/manifest.json`, `THIRD_PARTY_NOTICES.md`, three `.gcs` fixtures
- Create: `tests/conformance/oracle-client.ts`, `canonicalize.ts`, `conformance.test.ts`, `manifest.test.ts`
- Create: `tests/corpus/corpus.test.ts`
- Modify: `vitest.config.ts`, root package scripts only if test discovery requires it

**Interfaces:**

- Consumes: the `@gcs/gcs-engine` public API and `go -C tools/gcs-oracle run ./cmd/gcs-oracle`.
- Produces: semantic equality between official normalization before and after the TypeScript round trip.
- Produces: explicit extended-corpus command requiring `GCS_CORPUS_DIR`.

- [ ] **Step 1: Copy fixtures and create the exact provenance manifest**

Use these file names and digests:

```json
[
  {
    "file": "wang-laowu.gcs",
    "sha256": "5fa73a3fdb65ae4e1780a4b50775bdd44eb010ddd3e315dce9b21eab53f4be55"
  },
  {
    "file": "dragon-large-fire.gcs",
    "sha256": "929fb9b49af4ccf3b384e38f35e066c7b90b068a2030c6a86cd93519f19cd5a3"
  },
  {
    "file": "lich.gcs",
    "sha256": "2176a0d593f20dc694a9530cee70c8909c1885f4654dfa071b0c5aa93b25fdd8"
  }
]
```

The manifest also contains `sourceRepository: "richardwilkes/gcs_master_library"`, `sourceTag: "v5.12.0"`, `license: "MPL-2.0"`, and each full upstream `Library/...` path.

- [ ] **Step 2: Write failing manifest and conformance tests**

Manifest tests compute SHA-256 from bytes and compare every digest. Conformance tests load each source, run `parseGcsV5` and `serializeGcsV5`, send original and serialized documents to the same oracle process, require both responses to succeed, recursively sort object keys while preserving array order, and assert deep equality.

- [ ] **Step 3: Run conformance tests to verify RED**

Run: `docker compose run --rm toolchain pnpm test:conformance`

Expected: FAIL until the oracle client and canonicalizer exist.

- [ ] **Step 4: Implement the oracle client and canonicalizer**

The client starts `go -C tools/gcs-oracle run ./cmd/gcs-oracle`, writes JSONL requests, parses responses by request `id`, rejects duplicate/missing IDs, rejects non-zero exit, and includes stderr in thrown process errors without suppressing it. The canonicalizer sorts only object entries and recursively canonicalizes values.

- [ ] **Step 5: Verify semantic conformance**

Run: `docker compose run --rm toolchain pnpm test:conformance`

Expected: all three fixture round trips and all provenance checks pass.

- [ ] **Step 6: Add the explicit extended-corpus test**

`tests/corpus/corpus.test.ts` must throw `GCS_CORPUS_DIR is required for test:corpus` before registering corpus cases when the environment variable is absent. When present, it recursively finds `.gcs` files, processes them sequentially in one Node process and one oracle process, and reports each relative path on failure.

- [ ] **Step 7: Verify missing-variable failure and a real corpus pass**

Run:

```bash
docker compose run --rm toolchain pnpm test:corpus
docker compose run --rm -e GCS_CORPUS_DIR='/corpus' -v /home/deploy/apps/dragon-reaper/GCS:/corpus:ro toolchain pnpm test:corpus
```

Expected: the first command fails with the exact required-variable message; the second processes the available `.gcs` corpus without spawning one Node process per file.

- [ ] **Step 8: Commit fixtures and conformance tests**

```bash
git add fixtures tests vitest.config.ts package.json
git commit -m "test: prove GCS v5 semantic round trip"
```

---

### Task 5: CI, Documentation, and Full Verification Gate

**Files:**

- Create: `.github/workflows/ci.yml`, `README.md`, `packages/gcs-engine/AGENTS.md`
- Modify: `.gitignore`, `.dockerignore`, package documentation as required by final checks
- Test: complete Docker gate, clean-checkout rebuild, diff and file-size review

**Interfaces:**

- Produces: GitHub Actions for pushes and pull requests using the canonical Docker commands.
- Produces: durable operational instructions for humans and future agents.

- [ ] **Step 1: Add GitHub Actions using the canonical gate**

The workflow checks out the repository, runs `docker compose build toolchain`, `docker compose run --rm toolchain pnpm install --frozen-lockfile`, and `docker compose run --rm toolchain pnpm check`. It grants read-only repository contents and uses no secrets.

- [ ] **Step 2: Write the root README and nested AGENTS.md**

Document setup, API usage, canonical commands, current v5-only capability, oracle boundary, corpus command, fixture provenance, and the next engine slice. `packages/gcs-engine/AGENTS.md` must state the upstream pins, `calc` derivation rule, unknown-field preservation, container/cycle invariant, trait-only toggle semantics, substring search, AND tag semantics, fixture digest rule, MPL boundary, and canonical Docker gate.

- [ ] **Step 3: Run formatting and repair only formatting differences**

Run:

```bash
docker compose run --rm toolchain pnpm format
docker compose run --rm toolchain pnpm format:check
```

Expected: the second command exits 0. Formatting may not change fixture contents or digests.

- [ ] **Step 4: Run the complete fresh verification gate**

Run:

```bash
docker compose build --no-cache toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm check
```

Expected: formatting, lint, type checking, unit tests, Go tests, curated conformance, build, dependency tree, and production audit all exit 0 with no warnings promoted outside the gate.

- [ ] **Step 5: Review repository integrity**

Run:

```bash
git diff --check
git status --short
find packages/gcs-engine/src tools/gcs-oracle tests -type f \( -name '*.ts' -o -name '*.go' \) -print0 | xargs -0 wc -l | sort -nr | head -20
git diff "$(git merge-base main HEAD)" --stat
git diff "$(git merge-base main HEAD)" -- . ':!fixtures/gcs-v5/*.gcs'
```

Expected: no whitespace errors, only intended changes, no manually maintained source over 500 lines, no secrets or machine-specific values, and no untracked required files.

- [ ] **Step 6: Commit documentation and CI**

```bash
git add .github README.md packages/gcs-engine/AGENTS.md .gitignore .dockerignore package.json pnpm-lock.yaml
git commit -m "docs: document GCS conformance workflow"
```

- [ ] **Step 7: Re-run the canonical gate after the final commit**

Run: `docker compose run --rm toolchain pnpm check`

Expected: exit 0 from the exact committed tree.
