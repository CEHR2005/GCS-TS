import { execPath } from "node:process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GcsOracleClient } from "./oracle-client";

const validDocument = JSON.stringify({ version: 5 });

function nodeOracle(source: string): GcsOracleClient {
  return new GcsOracleClient({ command: execPath, args: ["-e", source] });
}

function responseOracle(line: string): GcsOracleClient {
  return nodeOracle(`
    process.stdin.once("data", () => {
      process.stdout.write(${JSON.stringify(`${line}\n`)});
      process.stdin.unref();
    });
  `);
}

describe("GcsOracleClient protocol failures", () => {
  it.each([
    ["malformed JSON", "{"],
    ["missing id", JSON.stringify({ ok: true, document: {} })],
    ["invalid ok", JSON.stringify({ id: "case", ok: "yes", document: {} })],
    [
      "missing failure message",
      JSON.stringify({ id: "case", ok: false, category: "invalid_gcs" }),
    ],
  ])("rejects %s", async (_name, line) => {
    const oracle = responseOracle(line);
    try {
      await expect(oracle.normalize("case", validDocument)).rejects.toThrow();
    } finally {
      await oracle.close().catch(() => undefined);
    }
  });

  it("rejects a duplicate request id", async () => {
    const oracle = responseOracle(
      JSON.stringify({ id: "case", ok: true, document: {} }),
    );
    const first = oracle.normalize("case", validDocument);
    await expect(oracle.normalize("case", validDocument)).rejects.toThrow(
      "duplicate request id: case",
    );
    await expect(first).resolves.toMatchObject({ id: "case", ok: true });
    await oracle.close();
  });

  it("reports spawn failures", async () => {
    const oracle = new GcsOracleClient({
      command: "/definitely/missing/gcs-oracle",
      args: [],
    });
    const response = oracle.normalize("case", validDocument);
    await expect(response).rejects.toThrow("start GCS oracle");
    await expect(oracle.close()).rejects.toThrow("start GCS oracle");
  });

  it("allows idempotent close", async () => {
    const oracle = nodeOracle(`process.stdin.resume()`);
    await expect(
      Promise.all([oracle.close(), oracle.close()]),
    ).resolves.toEqual([undefined, undefined]);
  });
});

describe("GcsOracleClient bounded shutdown", () => {
  it.runIf(process.platform !== "win32")(
    "kills the complete process group after EOF and SIGTERM are ignored",
    async () => {
      const childSource = `
        process.on("SIGTERM", () => {});
        setInterval(() => {}, 1000);
        setTimeout(() => process.exit(0), 1200);
      `;
      const oracle = new GcsOracleClient({
        command: execPath,
        args: [
          "-e",
          `
            const { spawn } = require("node:child_process");
            const child = spawn(process.execPath, ["-e", ${JSON.stringify(childSource)}], {
              stdio: "ignore",
            });
            process.on("SIGTERM", () => {});
            process.stdin.once("data", (chunk) => {
              const request = JSON.parse(chunk.toString());
              process.stdout.write(JSON.stringify({
                id: request.id,
                ok: true,
                document: { parentPid: process.pid, childPid: child.pid },
              }) + "\\n");
            });
            setInterval(() => {}, 1000);
            setTimeout(() => process.exit(0), 1200);
          `,
        ],
        shutdownGraceMs: 50,
        killGraceMs: 50,
      });
      const response = await oracle.normalize("case", validDocument);
      if (!response.ok) throw new Error(response.message);
      const parentPid = response.document.parentPid;
      const childPid = response.document.childPid;
      if (typeof parentPid !== "number" || typeof childPid !== "number") {
        throw new Error("test oracle returned invalid process ids");
      }

      const started = Date.now();
      await expect(oracle.close()).rejects.toThrow(/SIGTERM.*SIGKILL/s);
      expect(Date.now() - started).toBeLessThan(1_000);
      await expectProcessTerminated(parentPid);
      await expectProcessTerminated(childPid);
    },
    5_000,
  );
});

async function expectProcessTerminated(pid: number): Promise<void> {
  const deadline = Date.now() + 1_000;
  let lastState = "unknown";
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (isNoSuchProcess(error)) return;
      throw error;
    }
    lastState = linuxProcessState(pid) ?? "reaped";
    if (lastState === "reaped") return;
    if (lastState === "Z") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `process ${pid} survived process-group shutdown in state ${lastState}`,
  );
}

function linuxProcessState(pid: number): string | undefined {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
  const commandEnd = stat.lastIndexOf(") ");
  return commandEnd === -1
    ? "invalid-stat"
    : (stat[commandEnd + 2] ?? "missing");
}

function isNoSuchProcess(error: unknown): boolean {
  return isErrorCode(error, "ESRCH");
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
