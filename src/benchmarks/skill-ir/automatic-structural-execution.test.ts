import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../../core/workdir-manifest";
import type { DomainAutomaticConstructionResult } from "./automatic-domain-construction";
import {
  compileStructuralExecutionPlan,
  evaluateCrossArtifactConsistencyPrimitive,
  evaluateStructuralExecutionPlan,
} from "./automatic-structural-execution";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function writeWorkdirFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(root, ...relativePath.split("/"));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

function candidate(): DomainAutomaticConstructionResult {
  return {
    contract: {
      skillId: "structural-test",
      inputs: [
        { id: "source", path: "<source-files>", format: "directory", access: "read-only", required: true },
        { id: "config", path: "config.json", format: "json", access: "read-only", required: true },
      ],
      outputs: [{
        id: "report",
        path: "out/report.json",
        format: "json",
        required: true,
        structure: { kind: "json-object", requiredFields: ["items"], allowAdditionalFields: false },
      }],
      passCriteria: [
        { id: "inputs-stable", predicate: "input-integrity", targetRefs: ["source", "config"], statement: "Inputs remain unchanged." },
        { id: "report-present", predicate: "output-presence", targetRefs: ["report"], statement: "The report exists." },
        { id: "outputs-exact", predicate: "exact-output-set", targetRefs: ["report"], statement: "Only the report is created." },
        { id: "report-shape", predicate: "json-shape", targetRefs: ["report"], statement: "The report has the declared fields." },
        { id: "domain-grounding", predicate: "source-grounding", targetRefs: ["source", "report"], statement: "The report follows source evidence." },
      ],
    },
    validationPlan: {
      predicates: [
        { criterionId: "inputs-stable", predicate: "input-integrity", targetRefs: ["source", "config"], assertion: "Inputs remain unchanged.", loweringStatus: "generic-deterministic" },
        { criterionId: "report-present", predicate: "output-presence", targetRefs: ["report"], assertion: "The report exists.", loweringStatus: "generic-deterministic" },
        { criterionId: "outputs-exact", predicate: "exact-output-set", targetRefs: ["report"], assertion: "Only the report is created.", loweringStatus: "generic-deterministic" },
        { criterionId: "report-shape", predicate: "json-shape", targetRefs: ["report"], assertion: "The report has the declared fields.", loweringStatus: "generic-deterministic" },
        { criterionId: "domain-grounding", predicate: "source-grounding", targetRefs: ["source", "report"], assertion: "The report follows source evidence.", loweringStatus: "domain-runtime-required" },
      ],
    },
  } as DomainAutomaticConstructionResult;
}

async function initialManifest(workDir: string) {
  return InitialWorkdirManifestSchema.parse({
    schemaVersion: "skvm-initial-workdir-manifest/v1",
    entries: await snapshotWorkdir(workDir),
  });
}

describe("automatic structural execution", () => {
  test("lowers exactly the four generic predicates and resolves symbolic paths without skill branches", () => {
    const plan = compileStructuralExecutionPlan(candidate(), [
      { targetRef: "source", paths: ["src/a.ts", "src/b.ts"] },
    ]);

    expect(plan.predicates.map((entry) => entry.predicate)).toEqual([
      "input-integrity",
      "output-presence",
      "exact-output-set",
      "json-shape",
    ]);
    expect(plan.targets.find((entry) => entry.id === "source")?.paths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(plan.audit).toEqual({ paidCalls: 0, heldOutAccesses: 0, skillSpecificBranches: 0 });
  });

  test("executes all four predicates against a real workdir and detects each controlled violation", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-structural-core-"));
    temporaryDirectories.push(workDir);
    await writeWorkdirFile(workDir, "src/a.ts", "export const a = 1;\n");
    await writeWorkdirFile(workDir, "src/b.ts", "export const b = 2;\n");
    await writeWorkdirFile(workDir, "config.json", "{}\n");
    const initial = await initialManifest(workDir);
    const plan = compileStructuralExecutionPlan(candidate(), [
      { targetRef: "source", paths: ["src/a.ts", "src/b.ts"] },
    ]);

    await writeWorkdirFile(workDir, "out/report.json", "{\"items\":[]}\n");
    expect((await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan })).status).toBe("pass");

    await writeWorkdirFile(workDir, "src/a.ts", "tampered\n");
    let report = await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan });
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "INPUT_MODIFIED", contractRef: "inputs-stable", relativePath: "src/a.ts" }));
    await writeWorkdirFile(workDir, "src/a.ts", "export const a = 1;\n");

    await writeWorkdirFile(workDir, "src/new.ts", "export const added = true;\n");
    const literalDirectoryCandidate = candidate();
    literalDirectoryCandidate.contract.inputs[0]!.path = "src";
    const literalDirectoryPlan = compileStructuralExecutionPlan(literalDirectoryCandidate, []);
    report = await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan: literalDirectoryPlan });
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "INPUT_ADDED", contractRef: "inputs-stable", relativePath: "src/new.ts" }));
    await rm(join(workDir, "src/new.ts"));

    await rm(join(workDir, "out/report.json"));
    report = await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan });
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "OUTPUT_MISSING", contractRef: "report-present", relativePath: "out/report.json" }));
    await writeWorkdirFile(workDir, "out/report.json", "{\"items\":[]}\n");

    await writeWorkdirFile(workDir, "extra.txt", "unexpected\n");
    report = await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan });
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "UNEXPECTED_ENTRY", contractRef: "outputs-exact", relativePath: "extra.txt" }));
    await rm(join(workDir, "extra.txt"));

    await writeWorkdirFile(workDir, "out/report.json", "{\"wrong\":true}\n");
    report = await evaluateStructuralExecutionPlan({ workDir, initialManifest: initial, plan });
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "JSON_REQUIRED_FIELD_MISSING", contractRef: "report-shape", relativePath: "out/report.json" }));
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "JSON_ADDITIONAL_FIELD", contractRef: "report-shape", relativePath: "out/report.json" }));
  });

  test("probes cross-artifact consistency through generic JSON pointers only", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-probe-"));
    temporaryDirectories.push(workDir);
    await writeWorkdirFile(workDir, "contract.json", "{\"framework\":\"react-i18next\"}\n");
    await writeWorkdirFile(workDir, "report.json", "{\"framework\":\"react-i18next\"}\n");

    const parameters = {
      schemaVersion: "skill-ir-cross-artifact-consistency-parameters/v1" as const,
      comparisons: [{
        left: { path: "contract.json", jsonPointer: "/framework" },
        right: { path: "report.json", jsonPointer: "/framework" },
        relation: "deep-equal" as const,
      }],
    };
    expect((await evaluateCrossArtifactConsistencyPrimitive(workDir, parameters)).status).toBe("pass");

    await writeWorkdirFile(workDir, "report.json", "{\"framework\":\"other\"}\n");
    const result = await evaluateCrossArtifactConsistencyPrimitive(workDir, parameters);
    expect(result).toMatchObject({ status: "fail", skillSpecificBranches: 0 });
    expect(result.errors[0]?.code).toBe("CROSS_ARTIFACT_MISMATCH");
    expect(await readFile(join(workDir, "contract.json"), "utf8")).toContain("react-i18next");
  });
});
