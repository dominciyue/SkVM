import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runMagpieExternalImportShadow } from "./external-skill-import-magpie-shadow";

describe("Magpie external import shadow", () => {
  test("imports and executes exactly one frozen public case", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const runRoot = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "magpie-external-shadow-"));
    try {
      const sourceRoot = join(runRoot, "source"); const assetRoot = join(runRoot, "assets"); const workDir = join(runRoot, "workdir"); const bundleDir = join(runRoot, "bundle"); const outDir = join(runRoot, "product");
      await mkdir(join(sourceRoot, "step-0-preflight/case-1-clean-pass"), { recursive: true });
      const copy = async (from: string, to: string) => { await mkdir(join(assetRoot, to, ".."), { recursive: true }); await Bun.write(join(assetRoot, to), await Bun.file(join(rootDir, from)).arrayBuffer()); };
      await Bun.write(join(sourceRoot, "SKILL.md"), await Bun.file(join(rootDir, "benchmarks/skill-ir/pilots/magpie-release-audit/public/SKILL.md")).arrayBuffer());
      await Bun.write(join(sourceRoot, "LICENSE.upstream"), await Bun.file(join(rootDir, "benchmarks/skill-ir/pilots/magpie-release-audit/public/LICENSE.upstream")).arrayBuffer());
      await Bun.write(join(sourceRoot, "step-0-preflight/case-1-clean-pass/report.md"), await Bun.file(join(rootDir, "benchmarks/skill-ir/pilots/magpie-release-audit/public/step-0-preflight/case-1-clean-pass/report.md")).arrayBuffer());
      const assetPaths = ["benchmarks/skill-ir/pilots/magpie-release-audit/product-task-description.json", "benchmarks/skill-ir/pilots/magpie-release-audit/reviewed-plan.json", "src/benchmarks/skill-ir/verified-artifact-product-magpie-patch.ts", "src/benchmarks/skill-ir/magpie-release-audit-artifact-patch.ts", "src/benchmarks/skill-ir/external-skill-import-magpie-checker.ts", "results/skill-ir/magpie-release-audit-public-efficiency-003/report.json"];
      for (const path of assetPaths) await copy(path, path);
      const result = await runMagpieExternalImportShadow({ rootDir, recipePath: join(rootDir, "benchmarks/skill-ir/pilots/magpie-release-audit/external-import-recipe.json"), sourceRoot, assetRoot, workDir, outDir, bundleDir });
      expect(result.report.productExecution.outputSha256).toBe("3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e");
      expect(result.report.historicalEvidence.originalRowsRerun).toBe(0);
      expect(result.report.researchEligibility).toBe("not-eligible");
      const manifestText = await readFile(join(bundleDir, "import-manifest.json"), "utf8");
      expect(manifestText).not.toMatch(/(?:^|["\s])[A-Za-z]:[\\/]/mu);
      expect(manifestText).not.toMatch(/\\\\[^\\\s]+\\/u);
      expect(manifestText).not.toMatch(/secret|api[_-]?key/iu);
    } finally { await rm(runRoot, { recursive: true, force: true }); }
  }, 60_000);
});
