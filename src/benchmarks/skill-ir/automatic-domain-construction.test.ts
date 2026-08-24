import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillIRSchema } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import { sha256Bytes } from "./source-fixture";
import {
  DomainAutomaticConstructionInputSchema,
  ThinTaskDescriptionSchema,
  constructDomainSkillCandidates,
  verifyDomainConstructionBindings,
} from "./automatic-domain-construction";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const taskDescription = {
  schemaVersion: "skill-ir-task-description/v1" as const,
  descriptionId: "sample-report-task",
  taskKind: "analysis-report" as const,
  inputs: [{
    id: "workspace",
    path: "workspace/",
    format: "directory" as const,
    access: "read-only" as const,
    required: true,
  }],
  outputs: [{
    id: "report",
    path: "report.json",
    format: "json" as const,
    required: true,
    structure: {
      kind: "json-object" as const,
      requiredFields: ["facts", "uncertainties"],
      allowAdditionalFields: false,
    },
  }],
  passCriteria: [
    {
      id: "inputs-stable",
      predicate: "input-integrity" as const,
      targetRefs: ["workspace"],
      statement: "The input workspace remains unchanged.",
    },
    {
      id: "report-shape",
      predicate: "json-shape" as const,
      targetRefs: ["report"],
      statement: "The report contains the declared top-level fields.",
    },
    {
      id: "facts-grounded",
      predicate: "source-grounding" as const,
      targetRefs: ["workspace", "report"],
      statement: "Every reported fact is grounded in an observable workspace file.",
    },
  ],
};

async function fixture(options: { declarationPrefix?: string } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-construction-"));
  temporaryDirectories.push(rootDir);
  const sourceText = `---
name: sample-helper
description: Inspect a workspace and generate a safe report
---
# Sample helper
## Workflow
1. Read the target workspace.
2. Analyze observable facts.
3. Generate the report.
## Output
- report.json
## Rules
- Never modify source files.
`;
  const declarationText = `${options.declarationPrefix ?? ""}${JSON.stringify(taskDescription, null, 2)}\n`;
  await writeFile(join(rootDir, "SKILL.md"), sourceText, "utf8");
  await writeFile(join(rootDir, "task-description.json"), declarationText, "utf8");
  return {
    rootDir,
    input: {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1" as const,
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(sourceText)),
        repository: "https://example.invalid/sample",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: "skills/sample/SKILL.md",
      },
      taskDescription: {
        path: "task-description.json",
        sha256: sha256Bytes(Buffer.from(declarationText)),
        authoring: {
          measurementStartedAt: "2026-08-24T06:22:53.702Z",
          measurementCompletedAt: "2026-08-24T06:24:53.702Z",
          humanMinutes: 2,
        },
      },
    },
  };
}

describe("automatic domain construction", () => {
  test("keeps the declaration thin, strict, and free of answer-bearing evaluation fields", () => {
    expect(ThinTaskDescriptionSchema.parse(taskDescription)).toEqual(taskDescription);
    for (const forbidden of [
      { scorer: "custom" },
      { evaluator: "custom" },
      { gold: { answer: 1 } },
      { heldOut: "tasks.json" },
    ]) {
      expect(() => ThinTaskDescriptionSchema.parse({ ...taskDescription, ...forbidden })).toThrow();
    }
    expect(() => ThinTaskDescriptionSchema.parse({
      ...taskDescription,
      passCriteria: [{
        ...taskDescription.passCriteria[0],
        statement: "Compare with the gold answer.",
      }],
    })).toThrow();
  });

  test("generates a domain contract, task-ABI IR, and deterministically verifiable plan", async () => {
    const { rootDir, input } = await fixture();
    const first = await constructDomainSkillCandidates(rootDir, input);
    const second = await constructDomainSkillCandidates(rootDir, input);

    expect(second).toEqual(first);
    expect(first.audit).toEqual({
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      readPaths: ["SKILL.md", "task-description.json"],
    });
    expect(first.thinness).toMatchObject({
      status: "within-limit",
      maxLoc: 80,
      maxSemanticEntries: 40,
    });
    expect(first.contract).toMatchObject({
      schemaVersion: "skill-ir-domain-contract-candidate/v1",
      skillId: "sample-helper",
      taskDescriptionId: "sample-report-task",
      inputs: [{ id: "workspace", path: "workspace/" }],
      outputs: [{ id: "report", path: "report.json" }],
    });

    const ir = SkillIRSchema.parse(first.baseIr);
    expect(validateSkillIR(ir).errors).toEqual([]);
    expect(ir.inputs.map((entry) => entry.id)).toEqual(["workspace"]);
    expect(ir.outputs.map((entry) => entry.id)).toEqual(["report"]);
    expect(ir.checks.map((entry) => entry.id)).toEqual([
      "check-inputs-stable",
      "check-report-shape",
      "check-facts-grounded",
    ]);
    expect(first.validationPlan.predicates.map((entry) => [entry.criterionId, entry.loweringStatus])).toEqual([
      ["inputs-stable", "generic-deterministic"],
      ["report-shape", "generic-deterministic"],
      ["facts-grounded", "domain-runtime-required"],
    ]);
    expect(first.validationPlan.deterministicGate.status).toBe("passed");
    expect(first.semanticParity).toEqual({
      status: "not-established",
      reason: "shadow comparison does not execute task outputs or a qualified domain runtime",
    });
  });

  test("keeps source, declaration, automation, and remaining-human accounts distinct", async () => {
    const { rootDir, input } = await fixture();
    const result = await constructDomainSkillCandidates(rootDir, input);

    expect(result.semanticAccounting.fromSkillSource.units.map((entry) => entry.kind)).toContain("workflow-step");
    expect(result.semanticAccounting.fromTaskDeclaration.units.map((entry) => entry.kind)).toEqual([
      "input", "output", "pass-criterion", "pass-criterion", "pass-criterion",
    ]);
    expect(result.semanticAccounting.automationProduced).toMatchObject({
      contractBindings: 5,
      irTaskAbiBindings: 2,
      validationPredicates: 3,
      genericDeterministicPredicates: 2,
    });
    expect(result.semanticAccounting.stillRequiresHuman).toEqual([
      {
        id: "runtime-facts-grounded",
        kind: "domain-runtime",
        targetRefs: ["workspace", "report"],
        reason: "facts-grounded requires a domain runtime implementation: Every reported fact is grounded in an observable workspace file.",
      },
      {
        id: "package-report",
        kind: "artifact-compiler",
        targetRefs: ["report"],
        reason: "no qualified compiler emits report.json and binds its domain-runtime validation",
      },
    ]);
    expect(result.packageCandidate.status).toBe("non-executable");
  });

  test("independently revalidates cross-artifact bindings and detects tampering", async () => {
    const { rootDir, input } = await fixture();
    const result = await constructDomainSkillCandidates(rootDir, input);
    expect(verifyDomainConstructionBindings(result, taskDescription).errors).toEqual([]);
    expect(verifyDomainConstructionBindings({
      ...result,
      contract: { ...result.contract, outputs: [] },
    }, taskDescription).errors).toContain("domain contract output bindings differ from the task declaration");
  });

  test("marks an over-budget declaration heavy without rejecting or hiding it", async () => {
    const { rootDir, input } = await fixture({ declarationPrefix: "\n".repeat(81) });
    const result = await constructDomainSkillCandidates(rootDir, input);
    expect(result.thinness).toMatchObject({ status: "declaration-heavy", loc: expect.any(Number) });
    expect(result.thinness.reasons.some((reason) => reason.startsWith("loc ") && reason.endsWith(" exceeds 80"))).toBe(true);
    expect(result.validationPlan.deterministicGate.status).toBe("failed");
  });

  test("fails closed on declaration digest drift and unsafe paths", async () => {
    const { rootDir, input } = await fixture();
    await expect(constructDomainSkillCandidates(rootDir, {
      ...input,
      taskDescription: { ...input.taskDescription, sha256: "0".repeat(64) },
    })).rejects.toThrow("task description digest mismatch");
    expect(() => DomainAutomaticConstructionInputSchema.parse({
      ...input,
      taskDescription: { ...input.taskDescription, path: "../manual/base-ir.json" },
    })).toThrow();
  });
});
