import {
  GcsPrimitiveError,
  absFxp,
  addFxp,
  applyFxpRounding,
  ceilFxp,
  divideFxp,
  floorFxp,
  formatFxp,
  fxpFromRaw,
  fxpToRaw,
  maxFxp,
  minFxp,
  moduloFxp,
  multiplyFxp,
  parseFxp,
  roundFxp,
  subtractFxp,
  truncateFxp,
  type Fxp,
} from "@gcs/gcs-engine";
import { describe, expect, it } from "vitest";

import type {
  PrimitiveOracleRequest,
  PrimitiveOracleResponse,
} from "./oracle-protocol";
import { runPrimitiveOracle } from "./oracle-runner";
import {
  FXP_BOUNDARY_VALUES,
  FXP_VECTOR_SEED,
  makeFxpPairVectors,
} from "./vectors";

type Comparison = {
  request: PrimitiveOracleRequest;
  operation: string;
  index: number;
  operands: string;
  tsRaw: string;
};

const binaryOperations = {
  add: addFxp,
  subtract: subtractFxp,
  multiply: multiplyFxp,
  divide: divideFxp,
  modulo: moduloFxp,
  min: minFxp,
  max: maxFxp,
} as const;

const unaryOperations = {
  abs: absFxp,
  truncate: truncateFxp,
  floor: floorFxp,
  ceil: ceilFxp,
  round: roundFxp,
} as const;

describe("fixed-point conformance with GCS v5.44.0", () => {
  it("preserves complete vector context when the oracle reports failure", () => {
    expect(() =>
      expectRawMatch(
        {
          id: "divide-17",
          ok: false,
          category: "divide_by_zero",
          message: "division by zero",
        },
        "divide",
        17,
        "left=1 right=0",
        "12345",
      ),
    ).toThrow(
      "fxp mismatch op=divide seed=0x4743535f465850 index=17 left=1 right=0 TS=12345 Go=failure category=divide_by_zero message=division by zero",
    );
    expect(() =>
      expectTextMatch(
        {
          id: "format-18",
          ok: false,
          category: "invalid_fxp",
          message: "invalid raw value",
        },
        "format",
        18,
        "raw=1",
        "0.0001",
      ),
    ).toThrow(
      "fxp mismatch op=format seed=0x4743535f465850 index=18 raw=1 TS=0.0001 Go=failure category=invalid_fxp message=invalid raw value",
    );
  });

  it("matches parsing and canonical formatting boundaries", () => {
    const inputs = [
      "0",
      "+",
      ".",
      ",",
      "-0.00019",
      "0.00009",
      "1,234.56789",
      "1e-3",
      "-922337203685477.5808",
      "922337203685477.5807",
    ] as const;
    const parseRequests = inputs.map((input, index) => ({
      id: `parse-${index}`,
      op: "fxp.parse",
      args: { input },
    }));
    const parseResponses = runPrimitiveOracle(parseRequests);
    inputs.forEach((input, index) => {
      const tsRaw = fxpToRaw(parseFxp(input)).toString();
      expectRawMatch(
        parseResponses[index],
        "parse",
        index,
        `input=${JSON.stringify(input)}`,
        tsRaw,
      );
    });

    const values = FXP_BOUNDARY_VALUES;
    const formatResponses = runPrimitiveOracle(
      values.map((raw, index) => ({
        id: `format-${index}`,
        op: "fxp.format",
        args: { raw: raw.toString() },
      })),
    );
    values.forEach((raw, index) => {
      const tsText = formatFxp(fxpFromRaw(raw));
      expectTextMatch(
        formatResponses[index],
        "format",
        index,
        `raw=${raw}`,
        tsText,
      );
    });
  }, 30_000);

  it("characterizes exponent precision and the approved checked-error policy", () => {
    const precisionInput = "9.99999e-1";
    const saferPolicyInput = "9.223372036854775807e14";
    const separatorInputs = ["1e1_0", "1_0e1"] as const;
    const finiteSyntaxOverflowInput = "1e309";
    const responses = runPrimitiveOracle([
      {
        id: "exponent-precision",
        op: "fxp.parse",
        args: { input: precisionInput },
      },
      {
        id: "exponent-safer-policy",
        op: "fxp.parse",
        args: { input: saferPolicyInput },
      },
      ...separatorInputs.map((input, index) => ({
        id: `exponent-separator-${index}`,
        op: "fxp.parse",
        args: { input },
      })),
      {
        id: "exponent-finite-syntax-overflow",
        op: "fxp.parse",
        args: { input: finiteSyntaxOverflowInput },
      },
    ]);

    expectRawMatch(
      responses[0],
      "parse_exponent_precision",
      0,
      `input=${JSON.stringify(precisionInput)}`,
      fxpToRaw(parseFxp(precisionInput)).toString(),
    );
    expect(
      fxpToRaw(parseFxp(precisionInput)),
      mismatch(
        "parse_exponent_precision",
        0,
        `input=${JSON.stringify(precisionInput)}`,
        fxpToRaw(parseFxp(precisionInput)).toString(),
        String(responses[0]?.ok ? responses[0].result.raw : "failure"),
      ),
    ).toBe(10_000n);

    const goSaferPolicy = responses[1];
    const policyContext = mismatch(
      "parse_exponent_safer_policy",
      1,
      `input=${JSON.stringify(saferPolicyInput)}`,
      "FXP_OUT_OF_RANGE",
      goSaferPolicy?.ok
        ? `successful raw=${String(goSaferPolicy.result.raw)}`
        : `failure category=${goSaferPolicy?.category ?? "missing"} message=${goSaferPolicy?.message ?? "missing"}`,
    );
    expect(goSaferPolicy?.ok, policyContext).toBe(true);
    if (goSaferPolicy?.ok) {
      expect(goSaferPolicy.result.raw, policyContext).toBe("0");
    }
    expect(() => parseFxp(saferPolicyInput), policyContext).toThrowError(
      expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
    );

    separatorInputs.forEach((input, index) => {
      expectRawMatch(
        responses[index + 2],
        "parse_exponent_separator",
        index + 2,
        `input=${JSON.stringify(input)}`,
        fxpToRaw(parseFxp(input)).toString(),
      );
    });

    const goFiniteSyntaxOverflow = responses[4];
    const overflowContext = mismatch(
      "parse_exponent_finite_syntax_overflow",
      4,
      `input=${JSON.stringify(finiteSyntaxOverflowInput)}`,
      "FXP_OUT_OF_RANGE",
      goFiniteSyntaxOverflow?.ok
        ? `successful raw=${String(goFiniteSyntaxOverflow.result.raw)}`
        : `failure category=${goFiniteSyntaxOverflow?.category ?? "missing"} message=${goFiniteSyntaxOverflow?.message ?? "missing"}`,
    );
    expect(goFiniteSyntaxOverflow?.ok, overflowContext).toBe(false);
    if (goFiniteSyntaxOverflow && !goFiniteSyntaxOverflow.ok) {
      expect(goFiniteSyntaxOverflow.category, overflowContext).toBe(
        "fxp_out_of_range",
      );
    }
    expect(
      () => parseFxp(finiteSyntaxOverflowInput),
      overflowContext,
    ).toThrowError(expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }));
  }, 30_000);

  it("matches checked parser error categories for malformed and out-of-range text", () => {
    const inputs = [
      " ",
      "1.2.3",
      "922337203685477.5808",
      "-922337203685477.5809",
    ] as const;
    const responses = runPrimitiveOracle(
      inputs.map((input, index) => ({
        id: `parse-error-${index}`,
        op: "fxp.parse",
        args: { input },
      })),
    );
    inputs.forEach((input, index) => {
      let tsError: GcsPrimitiveError | undefined;
      try {
        parseFxp(input);
      } catch (error) {
        if (!(error instanceof GcsPrimitiveError)) throw error;
        tsError = error;
      }
      expectParseErrorCategoryMatch(responses[index], index, input, tsError);
    });
  }, 30_000);

  it("matches every binary operation across deterministic and explicit overflow vectors", () => {
    const vectors = [
      ...makeFxpPairVectors(256),
      { index: 256, left: 9_223_372_036_854_775_807n, right: 1n },
      { index: 257, left: -9_223_372_036_854_775_808n, right: 1n },
      { index: 258, left: 9_223_372_036_854_775_807n, right: 20_000n },
      { index: 259, left: -9_223_372_036_854_775_808n, right: 20_000n },
      { index: 260, left: 9_223_372_036_854_775_807n, right: 1n },
      { index: 261, left: -55_000n, right: 20_000n },
      { index: 262, left: -1n, right: 10_000n },
      { index: 263, left: 1n, right: -10_000n },
    ];
    const comparisons: Comparison[] = [];
    for (const [operation, calculate] of Object.entries(binaryOperations)) {
      for (const vector of vectors) {
        const left = fxpFromRaw(vector.left);
        const right = fxpFromRaw(vector.right);
        comparisons.push({
          request: {
            id: `${operation}-${vector.index}`,
            op: `fxp.${operation}`,
            args: {
              left: vector.left.toString(),
              right: vector.right.toString(),
            },
          },
          operation,
          index: vector.index,
          operands: `left=${vector.left} right=${vector.right}`,
          tsRaw: fxpToRaw(calculate(left, right) as Fxp).toString(),
        });
      }
    }
    compareRawResults(comparisons);
  }, 30_000);

  it("matches every unary and rounding operation at signed and half boundaries", () => {
    const values = [
      ...FXP_BOUNDARY_VALUES,
      ...makeFxpPairVectors(256).map(({ left }) => left),
    ];
    const comparisons: Comparison[] = [];
    for (const [operation, calculate] of Object.entries(unaryOperations)) {
      values.forEach((raw, index) => {
        comparisons.push({
          request: {
            id: `${operation}-${index}`,
            op: `fxp.${operation}`,
            args: { value: raw.toString() },
          },
          operation,
          index,
          operands: `value=${raw}`,
          tsRaw: fxpToRaw(calculate(fxpFromRaw(raw))).toString(),
        });
      });
    }
    for (const roundDown of [false, true]) {
      values.forEach((raw, index) => {
        const operation = `apply_rounding(${roundDown})`;
        comparisons.push({
          request: {
            id: `apply-${roundDown}-${index}`,
            op: "fxp.apply_rounding",
            args: { value: raw.toString(), roundDown },
          },
          operation,
          index,
          operands: `value=${raw} roundDown=${roundDown}`,
          tsRaw: fxpToRaw(
            applyFxpRounding(fxpFromRaw(raw), roundDown),
          ).toString(),
        });
      });
    }
    compareRawResults(comparisons);
  }, 30_000);
});

function compareRawResults(comparisons: readonly Comparison[]): void {
  const responses = runPrimitiveOracle(
    comparisons.map(({ request }) => request),
  );
  comparisons.forEach((comparison, responseIndex) => {
    expectRawMatch(
      responses[responseIndex],
      comparison.operation,
      comparison.index,
      comparison.operands,
      comparison.tsRaw,
    );
  });
}

function expectParseErrorCategoryMatch(
  response: PrimitiveOracleResponse | undefined,
  index: number,
  input: string,
  tsError: GcsPrimitiveError | undefined,
): void {
  const operands = `input=${JSON.stringify(input)}`;
  const tsCategory = tsError?.code ?? "success";
  if (response === undefined) {
    throw new Error(
      mismatch("parse_error", index, operands, tsCategory, "missing response"),
    );
  }
  if (response.ok) {
    throw new Error(
      mismatch(
        "parse_error",
        index,
        operands,
        tsCategory,
        `success raw=${String(response.result.raw)}`,
      ),
    );
  }
  const expectedGoCategory =
    tsError?.code === "INVALID_FXP"
      ? "invalid_fxp"
      : tsError?.code === "FXP_OUT_OF_RANGE"
        ? "fxp_out_of_range"
        : undefined;
  if (expectedGoCategory === undefined) {
    throw new Error(
      mismatch(
        "parse_error",
        index,
        operands,
        tsCategory,
        `failure category=${response.category} message=${response.message}`,
      ),
    );
  }
  expect(
    expectedGoCategory,
    mismatch(
      "parse_error",
      index,
      operands,
      tsCategory,
      `failure category=${response.category} message=${response.message}`,
    ),
  ).toBe(response.category);
}

function expectRawMatch(
  response: PrimitiveOracleResponse | undefined,
  operation: string,
  index: number,
  operands: string,
  tsRaw: string,
): void {
  if (response === undefined) {
    throw new Error(
      mismatch(operation, index, operands, tsRaw, "missing response"),
    );
  }
  if (!response.ok) {
    throw new Error(
      mismatch(
        operation,
        index,
        operands,
        tsRaw,
        `failure category=${response.category} message=${response.message}`,
      ),
    );
  }
  const goRaw = response.result.raw;
  expect(
    tsRaw,
    mismatch(operation, index, operands, tsRaw, String(goRaw)),
  ).toBe(goRaw);
}

function expectTextMatch(
  response: PrimitiveOracleResponse | undefined,
  operation: string,
  index: number,
  operands: string,
  tsText: string,
): void {
  if (response === undefined) {
    throw new Error(
      mismatch(operation, index, operands, tsText, "missing response"),
    );
  }
  if (!response.ok) {
    throw new Error(
      mismatch(
        operation,
        index,
        operands,
        tsText,
        `failure category=${response.category} message=${response.message}`,
      ),
    );
  }
  const goText = response.result.text;
  expect(
    tsText,
    mismatch(operation, index, operands, tsText, String(goText)),
  ).toBe(goText);
}

function mismatch(
  operation: string,
  index: number,
  operands: string,
  tsValue: string,
  goValue: string,
): string {
  return `fxp mismatch op=${operation} seed=0x${FXP_VECTOR_SEED.toString(16)} index=${index} ${operands} TS=${tsValue} Go=${goValue}`;
}
