import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkvmInvocation } from "../../bin/skvm-route.js";

describe("skvm executable routing", () => {
  test("uses the source artifact entrypoint in a checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-route-source-"));
    try {
      await mkdir(join(root, "src", "cli"), { recursive: true });
      await writeFile(join(root, "src", "cli", "artifact.ts"), "export {};\n");
      const invocation = resolveSkvmInvocation({
        here: join(root, "bin"),
        argv: ["artifact", "--help"],
        platform: "linux",
      });
      expect(invocation).toEqual({
        cmd: "bun",
        args: ["run", join(root, "src", "cli", "artifact.ts"), "--help"],
        env: process.env,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("uses the packaged artifact companion and preserves legacy routing", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-route-package-"));
    try {
      const bin = join(root, "bin");
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "skvm"), "binary");
      await writeFile(join(bin, "skvm-artifact"), "binary");
      const artifact = resolveSkvmInvocation({ here: bin, argv: ["artifact", "--preset=x"], platform: "linux" });
      expect(artifact.cmd).toBe(join(bin, "skvm-artifact"));
      expect(artifact.args).toEqual(["--preset=x"]);
      const legacy = resolveSkvmInvocation({ here: bin, argv: ["--help"], platform: "linux" });
      expect(legacy.cmd).toBe(join(bin, "skvm"));
      expect(legacy.args).toEqual(["--help"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runs the source checkout shim as a real process", () => {
    const shim = join(process.cwd(), "bin", "skvm.js");
    const result = spawnSync(process.execPath, [shim, "artifact", "--help"], {
      encoding: "utf8",
      env: { ...process.env, SKVM_BUN_BIN: process.execPath },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skvm artifact");
    expect(result.stderr).toBe("");
  });

  test("bootstraps the packaged companion before bundled dependencies initialize", async () => {
    const buildScript = await readFile(join(process.cwd(), "scripts", "build-all-targets.sh"), "utf8");
    expect(buildScript).toContain(
      "--banner='process.env.PI_PACKAGE_DIR ||= process.env.SKVM_INSTALL_ROOT || process.cwd();'",
    );
  });
});
