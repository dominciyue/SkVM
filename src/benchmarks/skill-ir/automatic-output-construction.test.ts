import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { StructuralExecutionPlan } from "./automatic-structural-execution";
import {
  compileAutomaticOutputConstructionPlan,
  AutomaticOutputConstructionPlanSchema,
  evaluateAutomaticOutputRelations,
  evaluateAutomaticOutputReuseGate,
  executeAutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(root, ...relativePath.split("/"));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

function structuralPlan(): StructuralExecutionPlan {
  return {
    schemaVersion: "skill-ir-structural-execution-plan/v1",
    skillId: "projection-test",
    targets: [
      { id: "source-a", role: "input", access: "read-only", required: true, format: "json", paths: ["source-a.json"], prefixes: [] },
      { id: "source-b", role: "input", access: "read-only", required: true, format: "json", paths: ["source-b.json"], prefixes: [] },
      { id: "mutable-source", role: "input", access: "read-write", required: true, format: "json", paths: ["mutable.json"], prefixes: [] },
      {
        id: "result",
        role: "output",
        required: true,
        format: "json",
        paths: ["out/result.json"],
        prefixes: [],
        structure: {
          kind: "json-object",
          requiredFields: ["studyId", "ambiguous", "missing", "mutableOnly"],
          allowAdditionalFields: false,
        },
      },
      {
        id: "note",
        role: "output",
        required: true,
        format: "markdown",
        paths: ["out/note.md"],
        prefixes: [],
        structure: { kind: "markdown", requiredSemanticRoles: ["summary"] },
      },
    ],
    predicates: [],
    audit: { paidCalls: 0, heldOutAccesses: 0, skillSpecificBranches: 0 },
  };
}

describe("automatic output construction", () => {
  test("discovers and executes only unique source-field projections on a real workdir", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-output-construction-"));
    temporaryDirectories.push(workDir);
    await write(workDir, "source-a.json", "{\"studyId\":\"study-1\",\"ambiguous\":\"a\"}\n");
    await write(workDir, "source-b.json", "{\"ambiguous\":\"b\"}\n");
    await write(workDir, "mutable.json", "{\"mutableOnly\":\"must-not-be-an-oracle\"}\n");
    const sourceDigest = sha256Bytes(await readFile(join(workDir, "source-a.json")));

    const plan = await compileAutomaticOutputConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
    });

    expect(plan.status).toBe("partial");
    expect(plan.outputs).toEqual([{
      targetRef: "result",
      path: "out/result.json",
      assignments: [{
        targetJsonPointer: "/studyId",
        source: { targetRef: "source-a", path: "source-a.json", jsonPointer: "/studyId" },
        discovery: "unique-top-level-field-name",
      }],
    }]);
    expect(plan.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetRef: "result", field: "ambiguous", reason: "ambiguous-source-field" }),
      expect.objectContaining({ targetRef: "result", field: "missing", reason: "source-field-missing" }),
      expect.objectContaining({ targetRef: "result", field: "mutableOnly", reason: "source-field-missing" }),
      expect.objectContaining({ targetRef: "note", reason: "unsupported-output-format" }),
    ]));

    const execution = await executeAutomaticOutputConstructionPlan(workDir, plan);
    expect(execution).toMatchObject({
      status: "partial",
      generatedFiles: ["out/result.json"],
      generatedFieldCount: 1,
      paidCalls: 0,
      heldOutAccesses: 0,
      skillSpecificBranches: 0,
    });
    expect(JSON.parse(await readFile(join(workDir, "out/result.json"), "utf8"))).toEqual({ studyId: "study-1" });
    expect(await Bun.file(join(workDir, "out/note.md")).exists()).toBe(false);
    expect(sha256Bytes(await readFile(join(workDir, "source-a.json")))).toBe(sourceDigest);

    expect((await evaluateAutomaticOutputRelations(workDir, plan)).status).toBe("pass");
    await write(workDir, "out/result.json", "{\"studyId\":\"mismatch\"}\n");
    expect(await evaluateAutomaticOutputRelations(workDir, plan)).toMatchObject({
      status: "fail",
      errors: [{ code: "SOURCE_FIELD_PROJECTION_MISMATCH", relationIndex: 0 }],
    });
  });

  test("requires one generic primitive to pass in at least two distinct cases", () => {
    expect(evaluateAutomaticOutputReuseGate([
      { caseId: "case-a", primitive: "source-field-projection", status: "pass", skillSpecificBranches: 0 },
    ])).toEqual({
      status: "blocked-single-case",
      primitive: "source-field-projection",
      distinctPassingCases: 1,
      requiredDistinctCases: 2,
      coreBranchDelta: 0,
    });
    expect(evaluateAutomaticOutputReuseGate([
      { caseId: "case-a", primitive: "source-field-projection", status: "pass", skillSpecificBranches: 0 },
      { caseId: "case-b", primitive: "source-field-projection", status: "pass", skillSpecificBranches: 0 },
    ])).toEqual({
      status: "passed",
      primitive: "source-field-projection",
      distinctPassingCases: 2,
      requiredDistinctCases: 2,
      coreBranchDelta: 0,
    });
    expect(() => evaluateAutomaticOutputReuseGate([
      { caseId: "case-a", primitive: "source-field-projection", status: "pass", skillSpecificBranches: 1 },
      { caseId: "case-b", primitive: "source-field-projection", status: "pass", skillSpecificBranches: 0 },
    ])).toThrow("skill-specific branch");
  });

  test("rejects undeclared construction operations instead of accepting a skill adapter", () => {
    const invalid = {
      schemaVersion: "skill-ir-automatic-output-construction-plan/v1",
      skillId: "projection-test",
      primitive: "source-field-projection",
      status: "partial",
      outputs: [],
      unresolved: [{ targetRef: "result", path: "out/result.json", reason: "source-field-missing" }],
      operation: { kind: "projection-test-special-case" },
      audit: { paidCalls: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    };
    expect(AutomaticOutputConstructionPlanSchema.safeParse(invalid).success).toBe(false);
  });
});
