import { spawnSync } from "node:child_process";

import {
  parsePrimitiveOracleResponse,
  type PrimitiveOracleRequest,
  type PrimitiveOracleResponse,
} from "./oracle-protocol";

export type PrimitiveOracleRunnerOptions = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
};

const DEFAULT_ARGS = [
  "-C",
  "tools/gcs-primitives-oracle",
  "run",
  "./cmd/gcs-primitives-oracle",
] as const;

export function runPrimitiveOracle(
  requests: readonly PrimitiveOracleRequest[],
  options: PrimitiveOracleRunnerOptions = {},
): readonly PrimitiveOracleResponse[] {
  if (requests.length === 0) return [];
  const requestedIds = validateRequests(requests);
  const input = `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
  const child = spawnSync(
    options.command ?? "go",
    options.args ?? DEFAULT_ARGS,
    {
      cwd: options.cwd ?? process.cwd(),
      input,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 30_000,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    },
  );

  if (child.error) {
    throw new Error(`start primitive oracle: ${child.error.message}`);
  }
  if (child.signal !== null) {
    throw new Error(
      `primitive oracle process failed with signal ${child.signal}${failureStderr(child.stderr)}`,
    );
  }
  if (child.status !== 0) {
    const status =
      child.status === null ? "unknown status" : `exit code ${child.status}`;
    throw new Error(
      `primitive oracle process failed with ${status}${failureStderr(child.stderr)}`,
    );
  }

  if (!child.stdout.endsWith("\n")) {
    throw new Error(
      "primitive oracle response is missing its terminal newline",
    );
  }
  const lines = child.stdout.split(/\r?\n/u);
  lines.pop();
  if (lines.some((line) => line.length === 0)) {
    throw new Error("blank primitive oracle response record");
  }
  const byId = new Map<string, PrimitiveOracleResponse>();
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `invalid primitive oracle response JSON: ${String(error)}`,
        { cause: error },
      );
    }
    const response = parsePrimitiveOracleResponse(value);
    if (!requestedIds.has(response.id)) {
      throw new Error(`unknown response id: ${response.id}`);
    }
    if (byId.has(response.id)) {
      throw new Error(`duplicate response id: ${response.id}`);
    }
    byId.set(response.id, response);
  }

  const missing = requests.map(({ id }) => id).filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`missing response ids: ${missing.join(", ")}`);
  }
  if (byId.size !== requests.length) {
    throw new Error(
      `primitive oracle response-count mismatch: expected ${requests.length}, received ${byId.size}`,
    );
  }
  return requests.map(({ id }) => byId.get(id) as PrimitiveOracleResponse);
}

function validateRequests(
  requests: readonly PrimitiveOracleRequest[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const request of requests) {
    if (
      typeof request.id !== "string" ||
      typeof request.op !== "string" ||
      !isRecord(request.args)
    ) {
      throw new Error("invalid primitive oracle request");
    }
    if (ids.has(request.id)) {
      throw new Error(`duplicate request id: ${request.id}`);
    }
    ids.add(request.id);
  }
  return ids;
}

function failureStderr(stderr: string): string {
  const detail = stderr.trim();
  return detail.length === 0 ? "" : `: ${detail}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
