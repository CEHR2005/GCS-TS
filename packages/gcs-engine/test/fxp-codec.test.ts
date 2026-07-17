import { describe, expect, it } from "vitest";

import {
  formatFxp,
  fxpFromInteger,
  fxpFromRaw,
  fxpToRaw,
  parseFxp,
} from "@gcs/gcs-engine";

describe("fixed-point codec", () => {
  it.each([
    ["0", 0n, "0"],
    ["+", 0n, "0"],
    [".", 0n, "0"],
    [",", 0n, "0"],
    ["1,234.56789", 12_345_678n, "1234.5678"],
    ["-0.00019", -1n, "-0.0001"],
    ["1e-3", 10n, "0.001"],
    [
      "-922337203685477.5808",
      -9_223_372_036_854_775_808n,
      "-922337203685477.5808",
    ],
  ] as const)("parses and formats %s", (input, raw, output) => {
    const value = parseFxp(input);

    expect(fxpToRaw(value)).toBe(raw);
    expect(formatFxp(value)).toBe(output);
  });

  it.each(["", " ", "NaN", "1.2.3", "１２", "1e"])(
    "rejects malformed input %j",
    (input) =>
      expect(() => parseFxp(input)).toThrowError(
        expect.objectContaining({ code: "INVALID_FXP" }),
      ),
  );

  it("rejects signed-64 overflow", () => {
    expect(() => parseFxp("922337203685477.5808")).toThrowError(
      expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
    );
    expect(() => fxpFromRaw(9_223_372_036_854_775_808n)).toThrowError(
      expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
    );
    expect(fxpToRaw(fxpFromInteger(2n))).toBe(20_000n);
    expect(() => fxpFromInteger(922_337_203_685_478n)).toThrowError(
      expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
    );
  });

  it.each([
    ["-", 0n],
    ["+.", 0n],
    ["-.", 0n],
    [",,,", 0n],
    ["1E+2", 1_000_000n],
  ] as const)("accepts pinned form %s", (input, raw) => {
    expect(fxpToRaw(parseFxp(input))).toBe(raw);
  });

  it.each([" 1", "1 ", "+ 1", "1e309"])(
    "rejects incompatible form %j",
    (input) =>
      expect(() => parseFxp(input)).toThrowError(
        expect.objectContaining({ code: "INVALID_FXP" }),
      ),
  );
});
