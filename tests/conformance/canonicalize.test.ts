import { describe, expect, it } from "vitest";

import { canonicalize } from "./canonicalize";

describe("canonicalize", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const canonical = canonicalize({
      z: [{ b: 2, a: 1 }, "second"],
      a: { d: 4, c: 3 },
    });

    expect(Object.keys(canonical as object)).toEqual(["a", "z"]);
    expect(Object.keys((canonical as { a: object }).a)).toEqual(["c", "d"]);
    expect(canonical).toEqual({
      a: { c: 3, d: 4 },
      z: [{ a: 1, b: 2 }, "second"],
    });
  });
});
