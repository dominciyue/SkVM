import { describe, expect, test } from "bun:test";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  test("runs a v2 API Tester binding through the source CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-artifact-cli-v2-"));
    try {
      const fixture = join(
        process.cwd(),
        "src",
        "skill-ir",
        "fixtures",
        "api-tester-production-v2",
        "local-ref-arrays",
      );
      const workDir = join(root, "workdir");
      await cp(fixture, workDir, { recursive: true });
      const entrypoint = join(process.cwd(), "src", "cli", "artifact.ts");
      const result = spawnSync(process.execPath, [
        entrypoint,
        "--preset=api-tester",
        "--binding=workdir/binding.json",
        `--root=${root}`,
        "--workdir=workdir",
        "--out=output",
        "--completed-at=2026-09-07T00:00:00.000Z",
      ], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const stdout = JSON.parse(result.stdout);
      const report = JSON.parse(await readFile(join(root, "output", "cli-report.json"), "utf8"));
      expect(stdout).toEqual(report);
      expect(report).toMatchObject({
        schemaVersion: "skill-ir-artifact-cli-result/v2",
        status: "passed",
        preset: "api-tester",
        binding: {
          schemaVersion: "skill-ir-api-tester-production-binding/v2",
          supportContractId: "api-tester-openapi-subset-v2",
          bindingId: "local-ref-arrays-api",
        },
        quality: { result: "pass" },
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an unknown API Tester binding version through the source CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-artifact-cli-unknown-version-"));
    try {
      await writeFile(join(root, "binding.json"), `${JSON.stringify({
        schemaVersion: "skill-ir-api-tester-production-binding/v999",
        bindingId: "unknown-version-api",
        input: { path: "openapi.yaml", format: "yaml" },
        outputs: { plan: "generated/plan.json", report: "generated/report.md" },
      }, null, 2)}\n`, "utf8");
      const entrypoint = join(process.cwd(), "src", "cli", "artifact.ts");
      const result = spawnSync(process.execPath, [
        entrypoint,
        "--preset=api-tester",
        "--binding=binding.json",
        `--root=${root}`,
        "--workdir=workdir",
        "--out=output",
        "--completed-at=2026-09-07T00:00:00.000Z",
      ], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("unsupported API Tester production binding schemaVersion");
      await expect(access(join(root, "output"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bootstraps the packaged companion before bundled dependencies initialize", async () => {
    const buildScript = await readFile(join(process.cwd(), "scripts", "build-all-targets.sh"), "utf8");
    expect(buildScript).toContain(
      "--banner='process.env.PI_PACKAGE_DIR ||= process.env.SKVM_INSTALL_ROOT || process.cwd();'",
    );
  });
});
