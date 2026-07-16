import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export type OracleResponse =
  | { id: string; ok: true; document: unknown }
  | { id: string; ok: false; category: string; message: string };

type OracleClientOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
};

type PendingRequest = {
  resolve: (response: OracleResponse) => void;
  reject: (error: Error) => void;
};

export class GcsOracleClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #completedIds = new Set<string>();
  readonly #closed: Promise<void>;
  #resolveClosed!: () => void;
  #stderr = "";
  #terminalError?: Error;
  #closing = false;

  constructor(options: OracleClientOptions = {}) {
    const command = options.command ?? "go";
    const args = options.args ?? [
      "-C",
      "tools/gcs-oracle",
      "run",
      "./cmd/gcs-oracle",
    ];
    this.#closed = new Promise((resolve) => {
      this.#resolveClosed = resolve;
    });
    this.#child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
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
      this.#child.stdin.end();
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
      this.#fail(new Error(`start GCS oracle: ${error.message}`));
      this.#resolveClosed();
    });
    this.#child.on("close", (code, signal) => {
      if (!this.#terminalError && code !== 0) {
        const status =
          code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
        const stderr = this.#stderr.trim();
        this.#fail(
          new Error(
            `GCS oracle process failed with ${status}${stderr ? `: ${stderr}` : ""}`,
          ),
          false,
        );
      }
      if (!this.#terminalError && this.#pending.size > 0) {
        this.#fail(
          new Error(
            `missing response ids: ${[...this.#pending.keys()].join(", ")}`,
          ),
          false,
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
    const response = parseResponse(value);
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
    this.#terminalError = error;
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
    if (terminate && this.#child.exitCode === null) {
      this.#child.kill();
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseResponse(value: Record<string, unknown>): OracleResponse | Error {
  if (typeof value.id !== "string" || typeof value.ok !== "boolean") {
    return new Error("GCS oracle response has an invalid shape");
  }
  if (value.ok) {
    if (!("document" in value)) {
      return new Error(`GCS oracle success ${value.id} is missing document`);
    }
    return { id: value.id, ok: true, document: value.document };
  }
  if (typeof value.category !== "string" || typeof value.message !== "string") {
    return new Error(`GCS oracle failure ${value.id} has an invalid shape`);
  }
  return {
    id: value.id,
    ok: false,
    category: value.category,
    message: value.message,
  };
}
