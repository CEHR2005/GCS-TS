import { spawnSync } from "node:child_process";

import {
  hasExactKeys,
  parseTraitCalculationOracleResponse,
  type TraitCalculationOracleRequest,
  type TraitCalculationOracleResponse,
} from "./oracle-protocol";

export type TraitCalculationOracleRunnerOptions = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
};

export function runTraitCalculationOracle(
  requests: readonly TraitCalculationOracleRequest[],
  options: TraitCalculationOracleRunnerOptions = {},
): readonly TraitCalculationOracleResponse[] {
  if (requests.length === 0) return [];
  const requestedIds = validateRequests(requests);
  const input = `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
  const child = spawnSync(
    options.command ?? "gcs-traits-oracle",
    options.args ?? [],
    {
      cwd: options.cwd ?? process.cwd(),
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer,
    },
  );
  if (child.error) {
    const code = (child.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT")
      throw new Error(
        `trait calculation oracle process timed out after ${timeoutMs} ms${stderr(child.stderr)}`,
        { cause: child.error },
      );
    if (code === "ENOBUFS")
      throw new Error(
        `trait calculation oracle process exceeded its ${maxBuffer}-byte output buffer`,
        { cause: child.error },
      );
    throw new Error(
      `start trait calculation oracle: ${child.error.message}${stderr(child.stderr)}`,
      { cause: child.error },
    );
  }
  if (child.signal !== null)
    throw new Error(
      `trait calculation oracle process failed with signal ${child.signal}${stderr(child.stderr)}`,
    );
  if (child.status !== 0)
    throw new Error(
      `trait calculation oracle process failed with ${child.status === null ? "unknown status" : `exit code ${child.status}`}${stderr(child.stderr)}`,
    );
  if (!child.stdout.endsWith("\n"))
    throw new Error(
      "trait calculation oracle response is missing its terminal newline",
    );
  const lines = child.stdout.split(/\r?\n/u);
  lines.pop();
  if (lines.some((line) => line.length === 0))
    throw new Error("blank trait calculation oracle response record");
  const byId = new Map<string, TraitCalculationOracleResponse>();
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `invalid trait calculation oracle response JSON: ${String(error)}`,
        { cause: error },
      );
    }
    const response = parseTraitCalculationOracleResponse(value);
    if (!requestedIds.has(response.id))
      throw new Error(`unknown response id: ${response.id}`);
    if (byId.has(response.id))
      throw new Error(`duplicate response id: ${response.id}`);
    byId.set(response.id, response);
  }
  const missing = requests.map(({ id }) => id).filter((id) => !byId.has(id));
  if (missing.length > 0)
    throw new Error(
      `missing response ids: ${missing.join(", ")}; trait calculation oracle response-count mismatch: expected ${requests.length}, received ${byId.size}`,
    );
  return requests.map(({ id }) => byId.get(id)!);
}

function validateRequests(
  requests: readonly TraitCalculationOracleRequest[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const request of requests) {
    if (
      !hasExactKeys(request as unknown as Record<string, unknown>, [
        "document",
        "id",
        "op",
        "use_multiplicative_modifiers",
      ]) ||
      typeof request.id !== "string" ||
      request.op !== "traits.calculate" ||
      typeof request.document !== "string" ||
      typeof request.use_multiplicative_modifiers !== "boolean"
    )
      throw new Error("invalid trait calculation oracle request");
    if (ids.has(request.id))
      throw new Error(`duplicate request id: ${request.id}`);
    ids.add(request.id);
  }
  return ids;
}

function stderr(value: string | undefined): string {
  if (value === undefined) return "";
  const detail = value.trim();
  return detail === "" ? "" : `: ${detail}`;
}
