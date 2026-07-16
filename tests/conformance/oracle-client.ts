import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

import { parseOracleResponse, type OracleResponse } from "./oracle-protocol";

export type {
  OracleDocument,
  OracleErrorCategory,
  OracleResponse,
} from "./oracle-protocol";

type OracleClientOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
  shutdownGraceMs?: number;
  killGraceMs?: number;
};

type PendingRequest = {
  resolve: (response: OracleResponse) => void;
  reject: (error: Error) => void;
};

const defaultShutdownGraceMs = 1_000;
const defaultKillGraceMs = 1_000;

export class GcsOracleClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #completedIds = new Set<string>();
  readonly #closed: Promise<void>;
  readonly #shutdownGraceMs: number;
  readonly #killGraceMs: number;
  readonly #usesProcessGroup = process.platform !== "win32";
  #resolveClosed!: () => void;
  #stderr = "";
  #terminalError?: Error;
  #closing = false;
  #hasClosed = false;
  #shutdownTimer: NodeJS.Timeout | undefined;
  #killTimer: NodeJS.Timeout | undefined;
  #shutdownEscalation?: "SIGTERM" | "SIGKILL";

  constructor(options: OracleClientOptions = {}) {
    const command = options.command ?? "go";
    const args = options.args ?? [
      "-C",
      "tools/gcs-oracle",
      "run",
      "./cmd/gcs-oracle",
    ];
    this.#shutdownGraceMs = validTimeout(
      options.shutdownGraceMs,
      defaultShutdownGraceMs,
    );
    this.#killGraceMs = validTimeout(options.killGraceMs, defaultKillGraceMs);
    this.#closed = new Promise((resolve) => {
      this.#resolveClosed = resolve;
    });
    this.#child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      detached: this.#usesProcessGroup,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#listen();
  }

  normalize(id: string, document: string): Promise<OracleResponse> {
    if (this.#closing) {
      return Promise.reject(new Error("GCS oracle client is closing"));
    }
    if (this.#terminalError) {
      return Promise.reject(this.#terminalError);
    }
    if (this.#pending.has(id) || this.#completedIds.has(id)) {
      return Promise.reject(new Error(`duplicate request id: ${id}`));
    }

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      const request = JSON.stringify({ id, op: "normalize", document });
      this.#child.stdin.write(`${request}\n`, (error) => {
        if (error) {
          this.#fail(
            new Error(`write GCS oracle request ${id}: ${error.message}`),
          );
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.#closing) {
      this.#closing = true;
      this.#beginGracefulShutdown();
    }
    await this.#closed;
    if (this.#terminalError) {
      throw this.#terminalError;
    }
  }

  #listen(): void {
    const lines = createInterface({
      input: this.#child.stdout,
      crlfDelay: Infinity,
    });
    lines.on("line", (line) => this.#handleResponse(line));
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (chunk: string) => {
      this.#stderr += chunk;
    });
    this.#child.on("error", (error) => {
      this.#fail(new Error(`start GCS oracle: ${error.message}`), false);
    });
    this.#child.on("close", (code, signal) => {
      this.#hasClosed = true;
      this.#clearShutdownTimers();
      if (!this.#terminalError && this.#shutdownEscalation) {
        this.#setTerminalError(this.#forcedShutdownError(code, signal));
      }
      if (!this.#terminalError && code !== 0) {
        const status =
          code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
        const stderr = this.#stderr.trim();
        this.#setTerminalError(
          new Error(
            `GCS oracle process failed with ${status}${stderr ? `: ${stderr}` : ""}`,
          ),
        );
      }
      if (!this.#terminalError && this.#pending.size > 0) {
        this.#setTerminalError(
          new Error(
            `missing response ids: ${[...this.#pending.keys()].join(", ")}`,
          ),
        );
      }
      this.#resolveClosed();
    });
  }

  #handleResponse(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.#fail(
        new Error(`invalid GCS oracle response JSON: ${String(error)}`),
      );
      return;
    }
    if (!isRecord(value) || typeof value.id !== "string") {
      this.#fail(new Error("GCS oracle response is missing a string id"));
      return;
    }

    const pending = this.#pending.get(value.id);
    if (!pending) {
      const kind = this.#completedIds.has(value.id) ? "duplicate" : "unknown";
      this.#fail(new Error(`${kind} response id: ${value.id}`));
      return;
    }
    const response = parseOracleResponse(value);
    if (response instanceof Error) {
      this.#fail(response);
      return;
    }

    this.#pending.delete(value.id);
    this.#completedIds.add(value.id);
    pending.resolve(response);
  }

  #fail(error: Error, terminate = true): void {
    if (this.#terminalError) return;
    this.#setTerminalError(error);
    if (terminate) {
      this.#beginForcedShutdown();
    }
  }

  #setTerminalError(error: Error): void {
    if (this.#terminalError) return;
    this.#terminalError = error;
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #beginGracefulShutdown(): void {
    if (this.#hasClosed) return;
    this.#child.stdin.end();
    this.#shutdownTimer = setTimeout(() => {
      this.#shutdownTimer = undefined;
      this.#beginForcedShutdown();
    }, this.#shutdownGraceMs);
  }

  #beginForcedShutdown(): void {
    if (this.#hasClosed || this.#shutdownEscalation) return;
    if (this.#shutdownTimer) {
      clearTimeout(this.#shutdownTimer);
      this.#shutdownTimer = undefined;
    }
    this.#shutdownEscalation = "SIGTERM";
    this.#signalProcessGroup("SIGTERM");
    this.#killTimer = setTimeout(() => {
      this.#killTimer = undefined;
      if (this.#hasClosed) return;
      this.#shutdownEscalation = "SIGKILL";
      this.#signalProcessGroup("SIGKILL");
    }, this.#killGraceMs);
  }

  #signalProcessGroup(signal: NodeJS.Signals): void {
    const pid = this.#child.pid;
    if (pid === undefined) return;
    try {
      if (this.#usesProcessGroup) {
        process.kill(-pid, signal);
      } else {
        this.#child.kill(signal);
      }
    } catch (error) {
      if (!isNoSuchProcess(error)) {
        let fallbackError: unknown;
        try {
          this.#child.kill(signal);
        } catch (caught) {
          fallbackError = caught;
        }
        this.#setTerminalError(
          new Error(
            `signal GCS oracle process group with ${signal}: ${String(error)}${fallbackError ? `; direct fallback failed: ${String(fallbackError)}` : ""}`,
          ),
        );
      }
    }
  }

  #clearShutdownTimers(): void {
    if (this.#shutdownTimer) clearTimeout(this.#shutdownTimer);
    if (this.#killTimer) clearTimeout(this.#killTimer);
    this.#shutdownTimer = undefined;
    this.#killTimer = undefined;
  }

  #forcedShutdownError(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Error {
    const escalation =
      this.#shutdownEscalation === "SIGKILL"
        ? `sent SIGTERM, then SIGKILL after ${this.#killGraceMs}ms`
        : "sent SIGTERM";
    const status =
      code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
    const stderr = this.#stderr.trim();
    return new Error(
      `GCS oracle did not exit within ${this.#shutdownGraceMs}ms after stdin EOF; ${escalation}; closed with ${status}${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

function validTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      "GCS oracle shutdown timeouts must be finite non-negative numbers",
    );
  }
  return value;
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
