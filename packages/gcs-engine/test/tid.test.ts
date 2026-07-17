import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertTidKind,
  generateTid,
  getTidKind,
  isTid,
  parseTid,
  type TidKind,
} from "@gcs/gcs-engine";

const deterministicBytes = () =>
  Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

describe("typed identifiers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates the pinned deterministic vector", () => {
    const tid = generateTid("t", deterministicBytes);

    expect(tid).toBe("tAAECAwQFBgcICQoL");
    expect(parseTid(tid)).toBe(tid);
    expect(getTidKind(tid)).toBe("t");
  });

  it.each(["t", "T", "m", "M"] as const)(
    "accepts supported kind %s",
    (kind) => {
      const tid = `${kind}AAECAwQFBgcICQoL`;

      expect(isTid(tid)).toBe(true);
      expect(getTidKind(parseTid(tid))).toBe(kind);
      expect(() => assertTidKind(parseTid(tid), kind)).not.toThrow();
    },
  );

  it("rejects a supported TID with the wrong expected kind", () => {
    const tid = generateTid("t", deterministicBytes);

    expect(() => assertTidKind(tid, "T")).toThrowError(
      expect.objectContaining({ code: "INVALID_TID_KIND" }),
    );
  });

  it("rejects an unsupported generation kind at runtime", () => {
    expect(() => generateTid("s" as TidKind, deterministicBytes)).toThrowError(
      expect.objectContaining({ code: "INVALID_TID_KIND" }),
    );
  });

  it.each([
    "tAAECAwQFBgcICQo",
    "tAAECAwQFBgcICQoLx",
    "t+AECAwQFBgcICQoL",
    "t/AECAwQFBgcICQoL",
  ])("rejects invalid syntax %s", (input) => {
    expect(isTid(input)).toBe(false);
    expect(() => parseTid(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_TID" }),
    );
  });

  it.each([null, undefined, 42, {}])(
    "handles non-string runtime input %j as an invalid TID",
    (input) => {
      expect(isTid(input as string)).toBe(false);
      expect(() => parseTid(input as string)).toThrowError(
        expect.objectContaining({ code: "INVALID_TID" }),
      );
    },
  );

  it("distinguishes an unsupported kind from invalid syntax", () => {
    const input = "sAAECAwQFBgcICQoL";

    expect(isTid(input)).toBe(false);
    expect(() => parseTid(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_TID_KIND" }),
    );
  });

  it.each([11, 13])("rejects a random source returning %i bytes", (length) => {
    expect(() => generateTid("t", () => new Uint8Array(length))).toThrowError(
      expect.objectContaining({ code: "CRYPTO_UNAVAILABLE" }),
    );
  });

  it("accepts a cross-realm Uint8Array random source", () => {
    const bytes = runInNewContext(
      "Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11])",
    ) as Uint8Array;

    expect(generateTid("t", () => bytes)).toBe("tAAECAwQFBgcICQoL");
  });

  it.each([
    new Uint8ClampedArray(12),
    new DataView(new ArrayBuffer(12)),
    { length: 12 },
  ])("rejects a non-Uint8Array random result", (value) => {
    expect(() =>
      generateTid("t", () => value as unknown as Uint8Array),
    ).toThrowError(expect.objectContaining({ code: "CRYPTO_UNAVAILABLE" }));
  });

  it.each([new Uint16Array(12), new Uint8ClampedArray(12)])(
    "rejects a typed array spoofing the Uint8Array string tag",
    (value) => {
      Object.defineProperty(value, Symbol.toStringTag, {
        value: "Uint8Array",
      });

      expect(() =>
        generateTid("t", () => value as unknown as Uint8Array),
      ).toThrowError(expect.objectContaining({ code: "CRYPTO_UNAVAILABLE" }));
    },
  );

  it("reads default crypto once and calls getRandomValues with that receiver", () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    let reads = 0;
    const cryptoValue = {
      getRandomValues(this: unknown, bytes: Uint8Array) {
        expect(this).toBe(cryptoValue);
        bytes.set(deterministicBytes());
        return bytes;
      },
    };

    try {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        get() {
          reads += 1;
          return cryptoValue;
        },
      });

      expect(generateTid("t")).toBe("tAAECAwQFBgcICQoL");
      expect(reads).toBe(1);
    } finally {
      if (cryptoDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "crypto");
      } else {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      }
    }
  });

  it.each([
    ["crypto", undefined],
    ["getRandomValues", {}],
  ] as const)(
    "reports unavailable default %s and never falls back to Math.random",
    (_missing, cryptoValue) => {
      const cryptoDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "crypto",
      );
      const mathRandom = vi.spyOn(Math, "random");

      try {
        Object.defineProperty(globalThis, "crypto", {
          configurable: true,
          value: cryptoValue,
        });

        expect(() => generateTid("t")).toThrowError(
          expect.objectContaining({ code: "CRYPTO_UNAVAILABLE" }),
        );
        expect(mathRandom).not.toHaveBeenCalled();
      } finally {
        if (cryptoDescriptor === undefined) {
          Reflect.deleteProperty(globalThis, "crypto");
        } else {
          Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
        }
      }
    },
  );
});
