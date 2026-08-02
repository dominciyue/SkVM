import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { validateSkillIR } from "../../skill-ir/validate";
import {
  compileApiTesterValidatedArtifact,
  compileApiTesterValidatedArtifactVariants,
  loadApiTesterArtifactCompilerInput,
  type ApiTesterArtifactCompilerInput,
} from "./api-tester-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const rootDir = process.cwd();
const pilotDir = "benchmarks/skill-ir/pilots/api-tester";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function packageText(root: string): Promise<string> {
  const files: string[] = [];
  const walk = async (current = "") => {
    for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
      const path = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk();
  return (await Promise.all(files.sort().map(async (path) =>
    `${path}\n${await readFile(join(root, path), "utf8")}`))).join("\n---FILE---\n");
}

describe("API Tester validated artifact compiler", () => {
  test("binds a profile-empty base IR to public source, development prompts, interface, and resources", async () => {
    const [irValue, auditValue] = await Promise.all([
      readFile(join(rootDir, pilotDir, "base-ir.json"), "utf8").then(JSON.parse),
      readFile(join(rootDir, pilotDir, "base-ir-source-audit.json"), "utf8").then(JSON.parse),
    ]);
    const ir = SkillIRSchema.parse(irValue);
    const audit = SkillIRSourceAuditSchema.parse(auditValue);

    expect(ir.profile).toEqual([]);
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] });
    expect(await verifySkillIRSourceAudit(ir, audit, rootDir)).toEqual({ errors: [], warnings: [] });
  });

  test("compiles both declarative input variants without changing the catalog", async () => {
    for (const variantId of ["openapi-yaml", "openapi-json"] as const) {
      const outDir = await tempDir(`api-tester-${variantId}-`);
      await compileApiTesterValidatedArtifact(
        await loadApiTesterArtifactCompilerInput(rootDir, variantId),
        outDir,
      );
      const validated = await validateValidatedArtifactPackage(outDir);

      expect(validated.manifest.catalog).toBe("validated-skill-artifact/v1");
      expect(validated.manifest.skillId).toBe("api-tester");
      expect(validated.manifest.protectedInputs).toEqual([
        variantId === "openapi-yaml" ? "api/openapi.yaml" : "api/openapi.json",
        "api-test-interface.json",
      ]);
      expect(validated.executionPlan.nodes.map((node) => node.kind)).toEqual(["process", "validate"]);
      expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toEqual(expect.arrayContaining([
        "skill-ir", "skill-view", "script", "check", "schema", "tool-plan", "validation-notes",
      ]));
    }
  });

  test("is byte-for-byte deterministic and excludes forbidden evidence canaries", async () => {
    const first = await tempDir("api-tester-artifact-first-");
    const second = await tempDir("api-tester-artifact-second-");
    const input = await loadApiTesterArtifactCompilerInput(rootDir, "openapi-yaml");
    const poisoned = {
      ...input,
      taskContract: {
        ...input.taskContract,
        evaluatorPayload: "EVALUATOR_CANARY_82914",
        gold: "GOLD_CANARY_82914",
        heldout: "HELDOUT_CANARY_82914",
        rawModel: "RAW_MODEL_CANARY_82914",
        secret: "SECRET_CANARY_82914",
      },
    } as ApiTesterArtifactCompilerInput;

    await compileApiTesterValidatedArtifact(poisoned, first);
    await compileApiTesterValidatedArtifact(poisoned, second);
    const text = await packageText(first);

    expect(text).toBe(await packageText(second));
    for (const canary of ["EVALUATOR_CANARY_82914", "GOLD_CANARY_82914", "HELDOUT_CANARY_82914",
      "RAW_MODEL_CANARY_82914", "SECRET_CANARY_82914"]) {
      expect(text).not.toContain(canary);
    }
  });

  test("materializes both declared variants as independently valid packages", async () => {
    const outRoot = await tempDir("api-tester-artifact-variants-");

    const report = await compileApiTesterValidatedArtifactVariants(rootDir, outRoot);

    expect(report.map((entry) => entry.variantId)).toEqual(["openapi-json", "openapi-yaml"]);
    for (const entry of report) {
      expect(entry.packageBytes).toBeGreaterThan(0);
      expect((await validateValidatedArtifactPackage(entry.packageDir)).manifest.protectedInputs[0])
        .toBe(entry.variantId === "openapi-yaml" ? "api/openapi.yaml" : "api/openapi.json");
    }
  });
});
