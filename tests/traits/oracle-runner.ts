import { spawnSync } from "node:child_process";

import {
  hasExactKeys,
  parseTraitsOracleResponse,
  type TraitsOracleRequest,
  type TraitsOracleResponse,
} from "./oracle-protocol";

export type TraitsOracleRunnerOptions = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export function runTraitsOracle(
  requests: readonly TraitsOracleRequest[],
  options: TraitsOracleRunnerOptions = {},
): readonly TraitsOracleResponse[] {
  if (requests.length === 0) return [];
  const requestedIds = validateRequests(requests);
  const input = `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const child = spawnSync(
    options.command ?? "gcs-traits-oracle",
    options.args ?? [],
    {
      cwd: options.cwd ?? process.cwd(),
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    },
  );

  if (child.error) {
    if ((child.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      throw new Error(
        `traits oracle process timed out after ${timeoutMs} ms${failureStderr(child.stderr)}`,
        { cause: child.error },
      );
    }
    throw new Error(`start traits oracle: ${child.error.message}`, {
      cause: child.error,
    });
  }
  if (child.signal !== null) {
    throw new Error(
      `traits oracle process failed with signal ${child.signal}${failureStderr(child.stderr)}`,
    );
  }
  if (child.status !== 0) {
    const status =
      child.status === null ? "unknown status" : `exit code ${child.status}`;
    throw new Error(
      `traits oracle process failed with ${status}${failureStderr(child.stderr)}`,
    );
  }

  if (!child.stdout.endsWith("\n")) {
    throw new Error("traits oracle response is missing its terminal newline");
  }
  const lines = child.stdout.split(/\r?\n/u);
  lines.pop();
  if (lines.some((line) => line.length === 0)) {
    throw new Error("blank traits oracle response record");
  }

  const byId = new Map<string, TraitsOracleResponse>();
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid traits oracle response JSON: ${String(error)}`, {
        cause: error,
      });
    }
    const response = parseTraitsOracleResponse(value);
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
    throw new Error(
      `missing response ids: ${missing.join(", ")}; traits oracle response-count mismatch: expected ${requests.length}, received ${byId.size}`,
    );
  }
  return requests.map(({ id }) => byId.get(id) as TraitsOracleResponse);
}

function validateRequests(
  requests: readonly TraitsOracleRequest[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const request of requests) {
    if (
      typeof request !== "object" ||
      request === null ||
      !hasExactKeys(request as unknown as Record<string, unknown>, [
        "document",
        "id",
        "op",
      ]) ||
      typeof request.id !== "string" ||
      request.op !== "traits.project" ||
      typeof request.document !== "string"
    ) {
      throw new Error("invalid traits oracle request");
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
