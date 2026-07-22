import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SkillIRSchema, type SkillIR } from "./schema";
import {
  SkillIRSourceAuditSchema,
  verifySkillIRSourceAudit,
  type SkillIRSourceAudit,
} from "./source-audit";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function minimalIR(): SkillIR {
  return SkillIRSchema.parse({
    schemaVersion: "skill-ir/v1",
    id: "audited-skill",
    name: "Audited Skill",
    category: ["workflow"],
    intent: "Transform a visible input into an audited output.",
    source: { kind: "file", path: "source/SKILL.md", sha256: "a".repeat(64) },
    inputs: [{ id: "input", description: "Visible input", required: true }],
    outputs: [{ id: "output", description: "Visible output", required: true }],
    preconditions: [],
    steps: [{
      id: "step-run",
      title: "Run",
      description: "Run the transformation.",
      kind: "execute",
      required: true,
      dependsOn: [],
      toolRefs: [],
      produces: ["output"],
      successCheckRefs: [],
      failureModes: [],
    }],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  });
}

function auditFor(sourceDigest: string, tasksDigest: string): SkillIRSourceAudit {
  return SkillIRSourceAuditSchema.parse({
    schemaVersion: "skill-ir-source-audit/v1",
    skillId: "audited-skill",
    sources: [
      {
        id: "skill-source",
        kind: "markdown",
        path: "source/SKILL.md",
        sha256: sourceDigest,
      },
      {
        id: "task-contract",
        kind: "json",
        path: "tasks.json",
        sha256: tasksDigest,
        allowedPointers: ["/tasks/0/prompt"],
      },
    ],
    mappings: [
      {
        targetRef: "category",
        construction: "source-explicit",
        evidence: [{ sourceId: "skill-source", locator: { kind: "line-range", start: 1, end: 2 } }],
      },
      {
        targetRef: "intent",
        construction: "source-explicit",
        evidence: [{ sourceId: "skill-source", locator: { kind: "line-range", start: 1, end: 2 } }],
      },
      {
        targetRef: "input:input",
        construction: "task-contract",
        evidence: [{ sourceId: "task-contract", locator: { kind: "json-pointer", pointer: "/tasks/0/prompt" } }],
      },
      {
        targetRef: "output:output",
        construction: "task-contract",
        evidence: [{ sourceId: "task-contract", locator: { kind: "json-pointer", pointer: "/tasks/0/prompt" } }],
      },
      {
        targetRef: "step:step-run",
        construction: "source-explicit",
        evidence: [{ sourceId: "skill-source", locator: { kind: "line-range", start: 2, end: 2 } }],
      },
    ],
    excludedEvidenceClasses: ["evaluator-payload", "held-out", "runtime-output", "profile-feedback"],
  });
}

async function fixture(): Promise<{
  root: string;
  ir: SkillIR;
  audit: SkillIRSourceAudit;
}> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-source-audit-"));
  await mkdir(join(root, "source"), { recursive: true });
  const source = "# Audited Skill\nRun the transformation.\n";
  const tasks = `${JSON.stringify({
    tasks: [
      { split: "development", prompt: "Read input and write output.", eval: [{ payload: { expected: "gold" } }] },
      { split: "held-out", prompt: "HELD_OUT_CANARY" },
    ],
  }, null, 2)}\n`;
  await writeFile(join(root, "source/SKILL.md"), source, "utf8");
  await writeFile(join(root, "tasks.json"), tasks, "utf8");
  const ir = minimalIR();
  if (ir.source.kind !== "file") throw new Error("test fixture requires a file-backed source");
  ir.source.sha256 = sha256(source);
  return { root, ir, audit: auditFor(sha256(source), sha256(tasks)) };
}

describe("Skill IR source audit", () => {
  test("rejects absolute, parent-traversing, and backslash source paths", async () => {
    const { audit } = await fixture();
    for (const unsafe of ["../SKILL.md", "/tmp/SKILL.md", "C:\\tmp\\SKILL.md", "source\\SKILL.md"]) {
      const candidate = structuredClone(audit) as SkillIRSourceAudit;
      candidate.sources[0]!.path = unsafe;
      expect(() => SkillIRSourceAuditSchema.parse(candidate)).toThrow();
    }
  });

  test("accepts complete digest-bound mappings to public source and development prompts", async () => {
    const { root, ir, audit } = await fixture();
    expect(await verifySkillIRSourceAudit(ir, audit, root)).toEqual({ errors: [], warnings: [] });
  });

  test("rejects missing or duplicate semantic target mappings", async () => {
    const { root, ir, audit } = await fixture();
    audit.mappings.pop();
    audit.mappings.push({ ...audit.mappings[0]! });
    const report = await verifySkillIRSourceAudit(ir, audit, root);
    expect(report.errors).toContain("duplicate source-audit mapping for category");
    expect(report.errors).toContain("missing source-audit mapping for step:step-run");
  });

  test("rejects evaluator, held-out, threshold, fixture, and unapproved JSON pointers", async () => {
    const forbidden = [
      "/tasks/0/eval/0/payload",
      "/tasks/1/prompt",
      "/tasks/0/passThreshold",
      "/tasks/0/fixtures/document.txt",
      "/tasks/0/prompt/expected",
    ];
    for (const pointer of forbidden) {
      const { root, ir, audit } = await fixture();
      const taskSource = audit.sources.find((source) => source.id === "task-contract")!;
      if (taskSource.kind === "json") taskSource.allowedPointers = [pointer];
      audit.mappings[1]!.evidence[0] = {
        sourceId: "task-contract",
        locator: { kind: "json-pointer", pointer },
      };
      const report = await verifySkillIRSourceAudit(ir, audit, root);
      expect(report.errors.some((error) => error.includes("forbidden task evidence"))).toBe(true);
    }
  });

  test("rejects digest drift and out-of-range source lines", async () => {
    const { root, ir, audit } = await fixture();
    audit.sources[0]!.sha256 = "f".repeat(64);
    audit.mappings[0]!.evidence[0] = {
      sourceId: "skill-source",
      locator: { kind: "line-range", start: 1, end: 99 },
    };
    const report = await verifySkillIRSourceAudit(ir, audit, root);
    expect(report.errors.some((error) => error.includes("digest mismatch"))).toBe(true);
    expect(report.errors.some((error) => error.includes("line range"))).toBe(true);
  });
});
