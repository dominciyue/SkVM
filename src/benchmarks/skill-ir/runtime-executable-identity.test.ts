import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  bindQualifiedRuntimeExecutableCommand,
  qualifyCurrentRuntimeExecutable,
  resolveQualifiedRuntimeExecutable,
} from "./runtime-executable-identity";
import { sha256Bytes } from "./source-fixture";

describe("shared runtime executable identity", () => {
  test("binds the current absolute Bun executable after a real version spawn", async () => {
    const identity = await qualifyCurrentRuntimeExecutable();

    expect(identity.resolution).toBe("process.execPath");
    expect(identity.executable.sha256).toBe(sha256Bytes(await readFile(process.execPath)));
    expect(identity.executable.bytes).toBeGreaterThan(0);
    expect(identity.executable.bunVersion).toBe(Bun.version);
    expect(identity.smoke).toEqual(expect.objectContaining({
      args: ["--version"],
      exitCode: 0,
      observedVersion: Bun.version,
    }));
    expect(JSON.stringify(identity)).not.toContain(process.execPath);

    const executable = await resolveQualifiedRuntimeExecutable(identity);
    expect(executable).toBe(process.execPath);
    expect(isAbsolute(executable)).toBe(true);
    const command = bindQualifiedRuntimeExecutableCommand(
      ["bun", "run", "skvm", "run", "--task=task.json"],
      executable,
    );
    expect(command[0]).toBe(process.execPath);
    expect(command[0]).not.toBe("bun");
  });

  test("fails closed on executable digest drift and non-Bun command binding", async () => {
    const identity = await qualifyCurrentRuntimeExecutable();
    await expect(resolveQualifiedRuntimeExecutable({
      ...identity,
      executable: { ...identity.executable, sha256: "0".repeat(64) },
    })).rejects.toThrow("runtime executable identity drift");
    expect(() => bindQualifiedRuntimeExecutableCommand(["node", "script.ts"], process.execPath))
      .toThrow("literal bun command");
  });
});
