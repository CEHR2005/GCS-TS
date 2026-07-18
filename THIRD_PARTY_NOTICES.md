# Third-Party Notices

## GCS Master Library fixtures

The files under `fixtures/gcs-v5/` listed in that directory's `manifest.json`
are unmodified excerpts from `richardwilkes/gcs_master_library` tag `v5.12.0`.
They are licensed under the Mozilla Public License 2.0 (MPL-2.0).

Source: https://github.com/richardwilkes/gcs_master_library/tree/v5.12.0/Library

The exact upstream paths and SHA-256 digests are recorded in the manifest.

## GCS engine behavior and test oracles

The primitive and typed-trait behavior in `packages/gcs-engine` and its
conformance tests was translated from and checked against these pinned MPL-2.0
sources:

- `richardwilkes/gcs` tag `v5.44.0`
  ([source](https://github.com/richardwilkes/gcs/tree/v5.44.0)):
  - `model/fxp/int.go` and `model/fxp/int_test.go`
  - `model/gurps/enums/affects/`
  - `model/gurps/enums/container/`
  - `model/gurps/enums/frequency/`
  - `model/gurps/enums/selfctrl/`
  - `model/gurps/enums/study/`
  - `model/kinds/kinds.go`
- `richardwilkes/toolbox` tag `v2.15.0`
  ([source](https://github.com/richardwilkes/toolbox/tree/v2.15.0)):
  - `fixed/fixed64/int.go` and `fixed/fixed64/int_test.go`
  - `tid/tid.go` and its tests

Both upstream repositories are licensed under the Mozilla Public License 2.0
(MPL-2.0). The Go modules are downloaded at their pinned versions only for the
test oracles; they are not production dependencies or vendored runtime code.

`tools/gcs-traits-oracle` pins `github.com/richardwilkes/gcs/v5` v5.44.0 and
`github.com/richardwilkes/toolbox/v2` v2.15.0 in its own `go.mod`. The JSONL
oracle uses upstream `model/gurps`, `model/fxp`, and `tid` APIs to decode GCS
data version 5 and project known trait and trait-modifier source fields for
test comparison. It is built and run only by tests and CI. Opaque JSON
retention and original-document serialization are verified in TypeScript and
by the existing whole-document oracle rather than copied from the traits
oracle.

The MPL-2.0 boundary covers `packages/gcs-engine` and upstream-derived test and
fixture material. This notice does not state or imply that the entire monorepo
is licensed under MPL-2.0; the remainder remains separately licensable.
