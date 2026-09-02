import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ExternalSkillImportManifestSchema,
  ExternalSkillImportRecipeSchema,
  importExternalSkill,
  verifyExternalSkillImportBundle,
} from "./external-skill-import";
import { runVerifiedArtifactWorkflow, validateVerifiedArtifactProduct } from "./verified-artifact-product";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";

const digest = "a".repeat(64);
const commit = "b".repeat(40);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function minimalRecipe() {
  return {
    schemaVersion: "skill-ir-external-skill-import-recipe/v1",
    importId: "basic-import",
    workflowId: "basic-workflow",
    provenance: {
      repository: "https://example.invalid/basic",
      commit,
      upstreamPath: "SKILL.md",
      licenseExpression: "MIT",
    },
    files: [
      { id: "skill", root: "source", inputPath: "SKILL.md", targetPath: "source/SKILL.md", role: "source-skill" },
      { id: "license", root: "source", inputPath: "LICENSE", targetPath: "source/LICENSE", role: "license" },
      { id: "task", root: "asset", inputPath: "task.json", targetPath: "recipe/task-description.json", role: "task-description" },
      { id: "plan", root: "asset", inputPath: "plan.json", targetPath: "recipe/automatic-plan.json", role: "automatic-plan" },
      { id: "patch", root: "asset", inputPath: "patch.ts", targetPath: "recipe/review/patch.ts", role: "review-patch" },
    ],
    references: {
      sourceSkillId: "skill",
      licenseFileId: "license",
      taskDescriptionFileId: "task",
      automaticPlanFileId: "plan",
      reviewPatchFileId: "patch",
      reviewDependencyIds: [],
      checkerFileId: null,
      checkerDependencyIds: [],
      evidenceFileIds: [],
    },
    taskDescriptionAuthoring: {
      measurementStartedAt: "2026-09-01T00:00:00.000Z",
      measurementCompletedAt: "2026-09-01T00:01:00.000Z",
      humanMinutes: 1,
    },
    review: {
      publicInterfacePath: "interface.json",
      coreBranchDelta: 0,
      physicalLoc: 1,
      humanMinutes: 1,
    },
    production: {
      oneTimeModelTokens: { status: "measured", value: 10 },
      originalRuntime: { status: "missing", reason: "not measured in fixture" },
    },
    quality: { mode: "user-accepted" },
  };
}

describe("external skill import contracts", () => {
  test("accepts a strict minimal recipe and rejects unknown fields", () => {
    const parsed = ExternalSkillImportRecipeSchema.parse(minimalRecipe());
    expect(parsed.importId).toBe("basic-import");
    expect(() => ExternalSkillImportRecipeSchema.parse({ ...minimalRecipe(), unexpected: true })).toThrow();
  });

  test("rejects malformed provenance, duplicate ids/targets, invalid roles, and bad references", () => {
    expect(() => ExternalSkillImportRecipeSchema.parse({
      ...minimalRecipe(),
      provenance: { ...minimalRecipe().provenance, commit: "not-a-commit" },
    })).toThrow();
    const duplicateId = minimalRecipe();
    duplicateId.files[1]!.id = duplicateId.files[0]!.id;
    expect(() => ExternalSkillImportRecipeSchema.parse(duplicateId)).toThrow();
    const duplicateTarget = minimalRecipe();
    duplicateTarget.files[1]!.targetPath = duplicateTarget.files[0]!.targetPath;
    expect(() => ExternalSkillImportRecipeSchema.parse(duplicateTarget)).toThrow();
    const invalidRole = minimalRecipe();
    invalidRole.files[0]!.role = "checker";
    expect(() => ExternalSkillImportRecipeSchema.parse(invalidRole)).toThrow();
    const wrongRoleReference = minimalRecipe();
    wrongRoleReference.references.sourceSkillId = "task";
    expect(() => ExternalSkillImportRecipeSchema.parse(wrongRoleReference)).toThrow();
  });

  test("manifest schema binds every production file and zero external activity", () => {
    const manifest = {
      schemaVersion: "skill-ir-external-skill-import-manifest/v1",
      importId: "basic-import",
      workflowId: "basic-workflow",
      provenance: minimalRecipe().provenance,
      files: [
        { id: "skill", role: "source-skill", path: "source/SKILL.md", bytes: 2, sha256: digest },
        { id: "license", role: "license", path: "source/LICENSE", bytes: 2, sha256: digest },
        { id: "task", role: "task-description", path: "recipe/task.json", bytes: 2, sha256: digest },
        { id: "plan", role: "automatic-plan", path: "recipe/plan.json", bytes: 2, sha256: digest },
        { id: "patch", role: "review-patch", path: "recipe/patch.ts", bytes: 2, sha256: digest },
      ],
      workflowConfig: { path: "workflow-config.json", bytes: 2, sha256: digest },
      closureSha256: digest,
      accounting: { networkAccesses: 0, modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
      runtime: "existing-skvm-product-cli-required",
      automaticDiscovery: false,
      costRecomputed: false,
    };
    expect(ExternalSkillImportManifestSchema.parse(manifest).runtime).toBe("existing-skvm-product-cli-required");
    expect(() => ExternalSkillImportManifestSchema.parse({ ...manifest, automaticDiscovery: true })).toThrow();
  });

  test("imports exact declared bytes and verifies a portable bundle closure", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-test-"));
    temporaryDirectories.push(root);
    const sourceRoot = join(root, "prepared-source"); const assetRoot = join(root, "prepared-assets"); const out = join(root, "bundle");
    await mkdir(sourceRoot, { recursive: true }); await mkdir(assetRoot, { recursive: true });
    const task = { schemaVersion: "skill-ir-task-description/v1", descriptionId: "basic-task", taskKind: "analysis-report", inputs: [{ id: "input", path: "input.json", format: "json", access: "read-only", required: true }], outputs: [{ id: "output", path: "output.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["value"], allowAdditionalFields: false } }], passCriteria: [{ id: "stable", predicate: "input-integrity", targetRefs: ["input"], statement: "Input remains unchanged." }] };
    await writeFile(join(sourceRoot, "SKILL.md"), "# Basic skill\\n", "utf8"); await writeFile(join(sourceRoot, "LICENSE"), "MIT\\n", "utf8");
    await writeFile(join(assetRoot, "task.json"), JSON.stringify(task) + "\\n", "utf8"); await writeFile(join(assetRoot, "plan.json"), "{}\\n", "utf8"); await writeFile(join(assetRoot, "patch.ts"), "export const patch = true;\\n", "utf8");
    const recipe = minimalRecipe();
    const result = await importExternalSkill({ recipe, sourceRoot, assetRoot, out });
    expect(result.bundleDir).toBe(out);
    expect(result.manifest.files.map((file) => file.path)).toEqual([
      "source/SKILL.md", "source/LICENSE", "recipe/task-description.json", "recipe/automatic-plan.json", "recipe/review/patch.ts",
    ]);
    expect(JSON.parse(await readFile(join(out, "workflow-config.json"), "utf8"))).toMatchObject({
      source: { path: "source/SKILL.md" }, taskDescription: { path: "recipe/task-description.json" }, review: { patch: { path: "recipe/review/patch.ts" } },
    });
    await expect(verifyExternalSkillImportBundle(out)).resolves.toMatchObject({ importId: "basic-import" });
  });

  test("fails closed for unsafe paths, missing inputs, and a pre-existing output", async () => {
    const unsafe = minimalRecipe(); unsafe.files[0]!.inputPath = "../SKILL.md";
    expect(() => ExternalSkillImportRecipeSchema.parse(unsafe)).toThrow();
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-negative-")); temporaryDirectories.push(root);
    const sourceRoot = join(root, "source"); const assetRoot = join(root, "assets"); const out = join(root, "bundle");
    await mkdir(sourceRoot, { recursive: true }); await mkdir(assetRoot, { recursive: true }); await mkdir(out, { recursive: true });
    await expect(importExternalSkill({ recipe: minimalRecipe(), sourceRoot, assetRoot, out })).rejects.toThrow("output bundle already exists");
    await rm(out, { recursive: true, force: true });
    await expect(importExternalSkill({ recipe: minimalRecipe(), sourceRoot, assetRoot, out })).rejects.toThrow("missing declared input");
  });

  test("verifier rejects extra files and digest drift", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-verify-")); temporaryDirectories.push(root);
    const sourceRoot = join(root, "source"); const assetRoot = join(root, "assets"); const out = join(root, "bundle");
    await mkdir(sourceRoot, { recursive: true }); await mkdir(assetRoot, { recursive: true });
    await writeFile(join(sourceRoot, "SKILL.md"), "# Basic skill\n", "utf8"); await writeFile(join(sourceRoot, "LICENSE"), "MIT\n", "utf8");
    const task = { schemaVersion: "skill-ir-task-description/v1", descriptionId: "basic-task", taskKind: "analysis-report", inputs: [{ id: "input", path: "input.json", format: "json", access: "read-only", required: true }], outputs: [{ id: "output", path: "output.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["value"], allowAdditionalFields: false } }], passCriteria: [{ id: "stable", predicate: "input-integrity", targetRefs: ["input"], statement: "Input remains unchanged." }] };
    await writeFile(join(assetRoot, "task.json"), JSON.stringify(task) + "\n", "utf8"); await writeFile(join(assetRoot, "plan.json"), "{}\n", "utf8"); await writeFile(join(assetRoot, "patch.ts"), "export const patch = true;\n", "utf8");
    await importExternalSkill({ recipe: minimalRecipe(), sourceRoot, assetRoot, out });
    await writeFile(join(out, "extra.txt"), "extra\n", "utf8");
    await expect(verifyExternalSkillImportBundle(out)).rejects.toThrow("missing or extra");
    await rm(join(out, "extra.txt")); await writeFile(join(out, "source/SKILL.md"), "tampered\n", "utf8");
    await expect(verifyExternalSkillImportBundle(out)).rejects.toThrow("digest mismatch");
  });

  test("rejects undeclared local/dynamic imports and non-compact evidence", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-audit-")); temporaryDirectories.push(root);
    const sourceRoot = join(root, "source"); const assetRoot = join(root, "assets"); await mkdir(sourceRoot, { recursive: true }); await mkdir(assetRoot, { recursive: true });
    await writeFile(join(sourceRoot, "SKILL.md"), "# Basic\n", "utf8"); await writeFile(join(sourceRoot, "LICENSE"), "MIT\n", "utf8");
    const task = { schemaVersion: "skill-ir-task-description/v1", descriptionId: "basic-task", taskKind: "analysis-report", inputs: [{ id: "input", path: "input.json", format: "json", access: "read-only", required: true }], outputs: [{ id: "output", path: "output.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["value"], allowAdditionalFields: false } }], passCriteria: [{ id: "stable", predicate: "input-integrity", targetRefs: ["input"], statement: "Input remains unchanged." }] };
    await writeFile(join(assetRoot, "task.json"), JSON.stringify(task) + "\n", "utf8"); await writeFile(join(assetRoot, "plan.json"), "{}\n", "utf8");
    await writeFile(join(assetRoot, "patch.ts"), "import { missing } from \"./not-declared\"; export const patch = missing;\n", "utf8");
    await expect(importExternalSkill({ recipe: minimalRecipe(), sourceRoot, assetRoot, out: join(root, "bad-local") })).rejects.toThrow("undeclared local import");
    await writeFile(join(assetRoot, "patch.ts"), "const load = import(\"./not-declared\"); export const patch = load;\n", "utf8");
    await expect(importExternalSkill({ recipe: minimalRecipe(), sourceRoot, assetRoot, out: join(root, "bad-dynamic") })).rejects.toThrow("dynamic import");
    await writeFile(join(assetRoot, "patch.ts"), "export const patch = true;\n", "utf8"); await writeFile(join(assetRoot, "evidence.json"), JSON.stringify({ modelOutput: "forbidden" }) + "\n", "utf8");
    const evidenceRecipe: any = minimalRecipe(); evidenceRecipe.files.push({ id: "evidence", root: "asset", inputPath: "evidence.json", targetPath: "recipe/evidence/report.json", role: "evidence" }); evidenceRecipe.references.evidenceFileIds = ["evidence"];
    await expect(importExternalSkill({ recipe: evidenceRecipe, sourceRoot, assetRoot, out: join(root, "bad-evidence") })).rejects.toThrow("forbidden raw/model/workdir");
  });

  test("runs the imported non-Magpie fixture through the existing product workflow after relocation", async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "external-import-product-")); temporaryDirectories.push(root);
    const fixtureRoot = join(import.meta.dir, "fixtures/external-import-basic");
    const sourceRoot = join(fixtureRoot, "source"); const assetRoot = join(fixtureRoot, "assets"); const out = join(root, "bundle"); const workDir = join(root, "workdir");
    await mkdir(workDir, { recursive: true });
    await writeFile(join(workDir, "manifest.json"), JSON.stringify({ name: " Alpha Project " }) + "\n", "utf8");
    await writeFile(join(workDir, "summary-interface.json"), JSON.stringify({ output: "summary.json" }) + "\n", "utf8");
    const recipe = JSON.parse(await readFile(join(fixtureRoot, "recipe.json"), "utf8"));
    const imported = await importExternalSkill({ recipe, sourceRoot, assetRoot, out });
    const relocated = join(root, "relocated-bundle"); await rename(out, relocated); await expect(verifyExternalSkillImportBundle(relocated)).resolves.toBeDefined();
    const result = await runVerifiedArtifactWorkflow({ rootDir: relocated, workDir, outDir: join(root, "product"), config: imported.workflowConfig, accept: async () => ({ decision: "accepted", acceptedAt: "2026-09-01T00:02:00.000Z", humanMinutes: 1, note: "fixture acceptance" }) });
    expect(result.stageOrder).toEqual(["compile", "review-or-accept", "package", "run", "cost"]);
    await expect(validateVerifiedArtifactProduct(join(root, "product"))).resolves.toBeDefined();
    const productionSource = await readFile(join(import.meta.dir, "external-skill-import.ts"), "utf8");
    expect(productionSource.toLowerCase()).not.toContain("magpie");
  });
});
