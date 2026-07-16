# @gcs/gcs-engine

Strict, runtime-dependency-free parsing and serialization for GCS data version 5.

```ts
import { parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";

const document = parseGcsV5(source);
const output = serializeGcsV5(document);
```

The parser validates only the JSON envelope and exact `version: 5` marker. It
preserves unknown fields semantically and does not normalize content, generate
IDs, recalculate GURPS values, or support other GCS data versions.

This package is licensed under MPL-2.0. See [LICENSE](./LICENSE).
