import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AutomaticOutputConstructionPlanSchema,
  compileAutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import {
  AutomaticJsonPointerConstructionPlanSchema,
  JsonPointerCopyDeclarationSchema,
  compileAutomaticJsonPointerConstructionPlan,
  evaluateAutomaticJsonPointerRelations,
  evaluateAutomaticJsonPointerReuseGate,
  executeAutomaticJsonPointerConstructionPlan,
} from "./automatic-json-pointer-construction";
import type { StructuralExecutionPlan } from "./automatic-structural-execution";
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
    skillId: "json-pointer-test",
    targets: [
      { id: "study", role: "input", access: "read-only", required: true, format: "json", paths: ["study.json"], prefixes: [] },
      { id: "mutable", role: "input", access: "read-write", required: true, format: "json", paths: ["mutable.json"], prefixes: [] },
      {
        id: "report",
        role: "output",
        required: true,
        format: "json",
        paths: ["out/report.json"],
        prefixes: [],
        structure: {
          kind: "json-object",
          requiredFields: ["studyId", "independentReplicateUnit", "measurementUnit", "manualField"],
          allowAdditionalFields: false,
        },
      },
    ],
    predicates: [],
    audit: { paidCalls: 0, heldOutAccesses: 0, skillSpecificBranches: 0 },
  };
}

function declaration() {
  return JsonPointerCopyDeclarationSchema.parse({
    schemaVersion: "skill-ir-json-pointer-copy-declaration/v1",
    operations: [
      {
        operation: "copy-json-value",
        source: { targetRef: "study", path: "study.json", jsonPointer: "/treatment/assignedToEntityType" },
        target: { targetRef: "report", path: "out/report.json", jsonPointer: "/independentReplicateUnit" },
      },
      {
        operation: "copy-json-value",
        source: { targetRef: "study", path: "study.json", jsonPointer: "/response/observedOnEntityType" },
        target: { targetRef: "report", path: "out/report.json", jsonPointer: "/measurementUnit" },
      },
    ],
  });
}

describe("automatic JSON Pointer output construction", () => {
  test("copies nested public JSON values without serializing them into the plan", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-json-pointer-"));
    temporaryDirectories.push(workDir);
    await write(workDir, "study.json", JSON.stringify({
      studyId: "study-1",
      treatment: { assignedToEntityType: "cage" },
      response: { observedOnEntityType: "cell" },
    }));
    await write(workDir, "mutable.json", "{\"secret\":\"must-not-be-read\"}\n");
    const sourceDigest = sha256Bytes(await readFile(join(workDir, "study.json")));
    const basePlan = await compileAutomaticOutputConstructionPlan({ workDir, structuralPlan: structuralPlan() });
    expect(basePlan.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetRef: "report", field: "independentReplicateUnit" }),
      expect.objectContaining({ targetRef: "report", field: "measurementUnit" }),
      expect.objectContaining({ targetRef: "report", field: "manualField" }),
    ]));

    const plan = await compileAutomaticJsonPointerConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
      basePlan,
      declaration: declaration(),
    });
    expect(plan.status).toBe("partial");
    expect(plan.resolvedUnresolved).toHaveLength(2);
    expect(plan.remainingUnresolved).toEqual([
      expect.objectContaining({ targetRef: "report", field: "manualField", reason: "source-field-missing" }),
    ]);
    expect(JSON.stringify(plan)).not.toContain("cage");
    expect(JSON.stringify(plan)).not.toContain("cell");
    expect(AutomaticJsonPointerConstructionPlanSchema.parse(plan)).toEqual(plan);

    const execution = await executeAutomaticJsonPointerConstructionPlan(workDir, basePlan, plan);
    expect(execution).toMatchObject({
      status: "partial",
      baseProjectedFieldCount: 1,
      pointerCopiedFieldCount: 2,
      remainingUnresolvedCount: 1,
      paidCalls: 0,
      heldOutAccesses: 0,
      skillSpecificBranches: 0,
    });
    expect(JSON.parse(await readFile(join(workDir, "out/report.json"), "utf8"))).toEqual({
      studyId: "study-1",
      independentReplicateUnit: "cage",
      measurementUnit: "cell",
    });
    expect(sha256Bytes(await readFile(join(workDir, "study.json")))).toBe(sourceDigest);

    expect((await evaluateAutomaticJsonPointerRelations(workDir, plan)).status).toBe("pass");
    const output = JSON.parse(await readFile(join(workDir, "out/report.json"), "utf8"));
    output.measurementUnit = "mouse";
    await write(workDir, "out/report.json", `${JSON.stringify(output)}\n`);
    expect(await evaluateAutomaticJsonPointerRelations(workDir, plan)).toMatchObject({
      status: "fail",
      errors: [{ code: "JSON_POINTER_COPY_MISMATCH", relationIndex: 1 }],
    });
  });

  test("fails closed for literals, unknown operations, mutable sources, and undeclared targets", async () => {
    expect(JsonPointerCopyDeclarationSchema.safeParse({
      schemaVersion: "skill-ir-json-pointer-copy-declaration/v1",
      operations: [{
        operation: "copy-json-value",
        source: { targetRef: "study", path: "study.json", jsonPointer: "/studyId" },
        target: { targetRef: "report", path: "out/report.json", jsonPointer: "/manualField" },
        value: "answer",
      }],
    }).success).toBe(false);
    expect(JsonPointerCopyDeclarationSchema.safeParse({
      schemaVersion: "skill-ir-json-pointer-copy-declaration/v1",
      operations: [{
        operation: "copy-json-value",
        source: { targetRef: "study", path: "../study.json", jsonPointer: "/studyId" },
        target: { targetRef: "report", path: "C:\\report.json", jsonPointer: "/manualField" },
      }],
    }).success).toBe(false);
    const duplicateTarget = structuredClone(declaration());
    duplicateTarget.operations[1]!.target = structuredClone(duplicateTarget.operations[0]!.target);
    expect(JsonPointerCopyDeclarationSchema.safeParse(duplicateTarget).success).toBe(false);
    expect(JsonPointerCopyDeclarationSchema.safeParse({
      schemaVersion: "skill-ir-json-pointer-copy-declaration/v1",
      operations: [{
        operation: "json-selector-lookup",
        source: { targetRef: "study", path: "study.json", jsonPointer: "/studyId" },
        target: { targetRef: "report", path: "out/report.json", jsonPointer: "/manualField" },
      }],
    }).success).toBe(false);

    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-json-pointer-invalid-"));
    temporaryDirectories.push(workDir);
    await write(workDir, "study.json", "{\"studyId\":\"study-1\"}\n");
    await write(workDir, "mutable.json", "{\"secret\":\"answer\"}\n");
    const discoveredBasePlan = await compileAutomaticOutputConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
    });
    const basePlan = AutomaticOutputConstructionPlanSchema.parse({
      schemaVersion: "skill-ir-automatic-output-construction-plan/v1",
      skillId: "json-pointer-test",
      primitive: "source-field-projection",
      status: "partial",
      outputs: [],
      unresolved: [{ targetRef: "report", path: "out/report.json", field: "manualField", reason: "source-field-missing" }],
      audit: { paidCalls: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    });
    const mutableDeclaration = JsonPointerCopyDeclarationSchema.parse({
      schemaVersion: "skill-ir-json-pointer-copy-declaration/v1",
      operations: [{
        operation: "copy-json-value",
        source: { targetRef: "mutable", path: "mutable.json", jsonPointer: "/secret" },
        target: { targetRef: "report", path: "out/report.json", jsonPointer: "/manualField" },
      }],
    });
    await expect(compileAutomaticJsonPointerConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
      basePlan,
      declaration: mutableDeclaration,
    })).rejects.toThrow("read-only JSON input");

    const nonJsonPlan = structuredClone(structuralPlan());
    nonJsonPlan.targets.find((entry) => entry.id === "study")!.format = "source-file";
    await expect(compileAutomaticJsonPointerConstructionPlan({
      workDir,
      structuralPlan: nonJsonPlan,
      basePlan: discoveredBasePlan,
      declaration: declaration(),
    })).rejects.toThrow("read-only JSON input");

    const alreadyResolved = structuredClone(declaration());
    alreadyResolved.operations = [structuredClone(alreadyResolved.operations[0]!)];
    alreadyResolved.operations[0]!.target.jsonPointer = "/studyId";
    await expect(compileAutomaticJsonPointerConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
      basePlan: discoveredBasePlan,
      declaration: alreadyResolved,
    })).rejects.toThrow("existing source-field-missing unresolved");

    const undeclaredTarget = structuredClone(declaration());
    undeclaredTarget.operations[0]!.target.jsonPointer = "/notDeclared";
    await expect(compileAutomaticJsonPointerConstructionPlan({
      workDir,
      structuralPlan: structuralPlan(),
      basePlan,
      declaration: undeclaredTarget,
    })).rejects.toThrow("declared base-plan JSON-object field");
  });

  test("requires the same value-free primitive to pass in two distinct cases", () => {
    expect(evaluateAutomaticJsonPointerReuseGate([
      { caseId: "case-a", primitive: "copy-json-value", status: "pass", skillSpecificBranches: 0 },
    ])).toMatchObject({ status: "blocked-single-case", distinctPassingCases: 1 });
    expect(evaluateAutomaticJsonPointerReuseGate([
      { caseId: "case-a", primitive: "copy-json-value", status: "pass", skillSpecificBranches: 0 },
      { caseId: "case-b", primitive: "copy-json-value", status: "pass", skillSpecificBranches: 0 },
    ])).toEqual({
      status: "passed",
      primitive: "copy-json-value",
      distinctPassingCases: 2,
      requiredDistinctCases: 2,
      coreBranchDelta: 0,
    });
    expect(() => evaluateAutomaticJsonPointerReuseGate([
      { caseId: "case-a", primitive: "copy-json-value", status: "pass", skillSpecificBranches: 1 },
      { caseId: "case-b", primitive: "copy-json-value", status: "pass", skillSpecificBranches: 0 },
    ])).toThrow("skill-specific branch");
  });
});
