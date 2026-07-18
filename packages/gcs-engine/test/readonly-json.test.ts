import { describe, expect, it, vi } from "vitest";

import {
  appendJsonPointer,
  cloneReadonlyJson,
} from "../src/traits/readonly-json.js";

function expectProjectionError(
  clone: () => unknown,
  code: string,
  path: string,
): void {
  expect(clone).toThrowError(expect.objectContaining({ code, path }));
}

describe("cloneReadonlyJson", () => {
  it("deeply clones and freezes JSON without retaining input aliases", () => {
    const input = { nested: [{ value: "original" }], safe: 4 };

    const output = cloneReadonlyJson(input, "/calc", 2, new WeakSet());

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(Object.isFrozen(output)).toBe(true);
    expect(
      Object.isFrozen((output as { nested: readonly unknown[] }).nested),
    ).toBe(true);
    expect(
      Object.isFrozen(
        (output as { nested: readonly object[] }).nested[0] as object,
      ),
    ).toBe(true);
    input.nested[0]!.value = "changed";
    expect(output).toEqual({ nested: [{ value: "original" }], safe: 4 });
  });

  it("escapes RFC 6901 JSON pointer tokens", () => {
    expect(appendJsonPointer("/calc", "a/b~c")).toBe("/calc/a~1b~0c");
    expect(appendJsonPointer("", "a/b~c")).toBe("/a~1b~0c");
  });

  it.each([
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["undefined", undefined],
    ["a function", () => undefined],
    ["a symbol", Symbol("invalid")],
  ])("rejects %s as non-JSON at its exact path", (_name, value) => {
    expectProjectionError(
      () => cloneReadonlyJson(value, "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc",
    );
  });

  it("rejects sparse arrays at the missing index", () => {
    const input: unknown[] = [];
    input.length = 1;

    expectProjectionError(
      () => cloneReadonlyJson(input, "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc/0",
    );
  });

  it("rejects symbol-keyed objects", () => {
    const input: Record<PropertyKey, unknown> = { safe: true };
    input[Symbol("hidden")] = "value";

    expectProjectionError(
      () => cloneReadonlyJson(input, "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc",
    );
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => "value");
    const input = {};
    Object.defineProperty(input, "danger", {
      enumerable: true,
      get: getter,
    });

    expectProjectionError(
      () => cloneReadonlyJson(input, "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc/danger",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects non-plain prototypes", () => {
    const input = Object.create({ inherited: true }) as object;

    expectProjectionError(
      () => cloneReadonlyJson(input, "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc",
    );
  });

  it.each([
    ["an Array subclass", () => new (class extends Array<unknown> {})(true)],
    [
      "an array with a replaced prototype",
      () => Object.setPrototypeOf([true], null) as unknown[],
    ],
  ])("rejects %s", (_name, createInput) => {
    expectProjectionError(
      () => cloneReadonlyJson(createInput(), "/calc", 1, new WeakSet()),
      "INVALID_FIELD",
      "/calc",
    );
  });

  it("rejects active-ancestor cycles at the recursive path", () => {
    const input: { self?: unknown } = {};
    input.self = input;

    expectProjectionError(
      () => cloneReadonlyJson(input, "/calc", 1, new WeakSet()),
      "CYCLE_DETECTED",
      "/calc/self",
    );
  });

  it("rejects arrays and objects at depth 257", () => {
    expectProjectionError(
      () => cloneReadonlyJson({}, "/calc", 257, new WeakSet()),
      "MAX_DEPTH_EXCEEDED",
      "/calc",
    );
    expectProjectionError(
      () => cloneReadonlyJson([], "/calc", 257, new WeakSet()),
      "MAX_DEPTH_EXCEEDED",
      "/calc",
    );
  });

  it("accepts arrays and objects at depth 256", () => {
    expect(cloneReadonlyJson({}, "/calc", 256, new WeakSet())).toEqual({});
    expect(cloneReadonlyJson([], "/calc", 256, new WeakSet())).toEqual([]);
  });

  it("allows shared non-ancestor objects and clones each occurrence", () => {
    const shared = { value: "same" };
    const output = cloneReadonlyJson(
      { left: shared, right: shared },
      "/calc",
      1,
      new WeakSet(),
    ) as { left: object; right: object };

    expect(output.left).toEqual(output.right);
    expect(output.left).not.toBe(output.right);
  });

  it("preserves __proto__ as data on a null-prototype clone", () => {
    const input = JSON.parse('{"__proto__":{"polluted":true}}') as object;
    const output = cloneReadonlyJson(input, "/calc", 1, new WeakSet()) as {
      readonly __proto__: { readonly polluted: boolean };
    };

    expect(Object.getPrototypeOf(output)).toBeNull();
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(output.__proto__).toEqual({ polluted: true });
  });
});
