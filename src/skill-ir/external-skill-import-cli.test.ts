import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseExternalSkillImportCliArguments } from "./external-skill-import-cli";

describe("external skill import cli", () => {
  test("requires the four explicit paths and rejects unknown flags", () => {
    expect(() => parseExternalSkillImportCliArguments(["--recipe=x"])).toThrow("required");
    expect(() => parseExternalSkillImportCliArguments(["--recipe=x", "--source-root=s", "--asset-root=a", "--out=o", "--oops=x"])).toThrow("unknown");
    expect(parseExternalSkillImportCliArguments(["--recipe=x", "--source-root=s", "--asset-root=a", "--out=o"], "D:/cwd")).toMatchObject({ recipePath: expect.stringMatching(/D:[\\/]cwd[\\/]x/), sourceRoot: expect.stringMatching(/D:[\\/]cwd[\\/]s/), assetRoot: expect.stringMatching(/D:[\\/]cwd[\\/]a/), out: expect.stringMatching(/D:[\\/]cwd[\\/]o/) });
  });

  test("runs the CLI and returns machine-readable completion metadata", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-cli-"));
    try {
      const sourceRoot = join(root, "source"); const assetRoot = join(root, "assets"); await mkdir(sourceRoot, { recursive: true }); await mkdir(assetRoot, { recursive: true });
      await writeFile(join(sourceRoot, "SKILL.md"), "# Basic\n", "utf8"); await writeFile(join(sourceRoot, "LICENSE"), "MIT\n", "utf8");
      const recipe = { schemaVersion: "skill-ir-external-skill-import-recipe/v1", importId: "basic-import", workflowId: "basic-workflow", provenance: { repository: "https://example.invalid/basic", commit: "b".repeat(40), upstreamPath: "SKILL.md", licenseExpression: "MIT" }, files: [{ id: "skill", root: "source", inputPath: "SKILL.md", targetPath: "source/SKILL.md", role: "source-skill" }, { id: "license", root: "source", inputPath: "LICENSE", targetPath: "source/LICENSE", role: "license" }, { id: "task", root: "asset", inputPath: "task.json", targetPath: "recipe/task-description.json", role: "task-description" }, { id: "plan", root: "asset", inputPath: "plan.json", targetPath: "recipe/automatic-plan.json", role: "automatic-plan" }, { id: "patch", root: "asset", inputPath: "patch.ts", targetPath: "recipe/review/patch.ts", role: "review-patch" }], references: { sourceSkillId: "skill", licenseFileId: "license", taskDescriptionFileId: "task", automaticPlanFileId: "plan", reviewPatchFileId: "patch", reviewDependencyIds: [], checkerFileId: null, checkerDependencyIds: [], evidenceFileIds: [] }, taskDescriptionAuthoring: { measurementStartedAt: "2026-09-01T00:00:00.000Z", measurementCompletedAt: "2026-09-01T00:01:00.000Z", humanMinutes: 1 }, review: { publicInterfacePath: "interface.json", coreBranchDelta: 0, physicalLoc: 1, humanMinutes: 1 }, production: { oneTimeModelTokens: { status: "measured", value: 0 }, originalRuntime: { status: "missing", reason: "not measured" } }, quality: { mode: "user-accepted" } };
      const task = { schemaVersion: "skill-ir-task-description/v1", descriptionId: "basic-task", taskKind: "analysis-report", inputs: [{ id: "input", path: "input.json", format: "json", access: "read-only", required: true }], outputs: [{ id: "output", path: "output.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["value"], allowAdditionalFields: false } }], passCriteria: [{ id: "stable", predicate: "input-integrity", targetRefs: ["input"], statement: "Input remains unchanged." }] };
      await writeFile(join(assetRoot, "task.json"), JSON.stringify(task) + "\n", "utf8"); await writeFile(join(assetRoot, "plan.json"), "{}\n", "utf8"); await writeFile(join(assetRoot, "patch.ts"), "export const patch = true;\n", "utf8");
      const recipePath = join(root, "recipe.json"); await writeFile(recipePath, JSON.stringify(recipe) + "\n", "utf8");
      const { runExternalSkillImportCli } = await import("./external-skill-import-cli");
      const result = await runExternalSkillImportCli(["--recipe=" + recipePath, "--source-root=" + sourceRoot, "--asset-root=" + assetRoot, "--out=" + join(root, "bundle")], process.cwd());
      expect(result.status).toBe("complete"); expect(result.manifestPath).toBe("import-manifest.json");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("is executable as a Bun CLI and writes only JSON to stdout", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-cli-process-"));
    try {
      const fixture = join(import.meta.dir, "fixtures/external-import-basic");
      const child = Bun.spawn([
        process.execPath,
        join(import.meta.dir, "external-skill-import-cli.ts"),
        "--recipe=" + join(fixture, "recipe.json"),
        "--source-root=" + join(fixture, "source"),
        "--asset-root=" + join(fixture, "assets"),
        "--out=" + join(root, "bundle"),
      ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toMatchObject({ status: "complete", importId: "external-import-basic", manifestPath: "import-manifest.json" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
