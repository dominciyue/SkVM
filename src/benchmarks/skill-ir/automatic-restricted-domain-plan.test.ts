import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  RestrictedDomainPlanSchema,
  executeRestrictedDomainPlan,
  validateRestrictedDomainPlanBindings,
} from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function write(root: string, path: string, content: string): Promise<void> {
  const absolute = join(root, ...path.split("/"));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

function inventoryPlan() {
  return RestrictedDomainPlanSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan/v1",
    planId: "generic-variable-inventory",
    steps: [
      { id: "definitions", op: "parse-key-value-lines", path: ".env", keyPattern: "^[A-Z][A-Z0-9_]*$" },
      {
        id: "references",
        op: "regex-find-files",
        includePathPattern: "^src/.*\\.js$",
        contentPattern: "process\\.env\\.(?<name>[A-Z][A-Z0-9_]*)",
        flags: "g",
        captures: ["name"],
      },
      { id: "reference-names", op: "pluck", source: "references", field: "name" },
      { id: "used", op: "set-operation", operator: "intersection", left: "definitions", right: "reference-names" },
      { id: "unused", op: "set-operation", operator: "difference", left: "definitions", right: "reference-names" },
      { id: "undefined", op: "set-operation", operator: "difference", left: "reference-names", right: "definitions" },
      {
        id: "write-report",
        op: "write-json",
        path: "report.json",
        fields: [
          { key: "definedAndUsed", value: { kind: "ref", ref: "used" } },
          { key: "definedUnconfirmedUnused", value: { kind: "ref", ref: "unused" } },
          { key: "usedUndefined", value: { kind: "ref", ref: "undefined" } },
        ],
      },
    ],
    audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  });
}

describe("restricted Domain Plan", () => {
  test("executes one value-free plan across two workdirs and preserves protected inputs", async () => {
    const plan = inventoryPlan();
    validateRestrictedDomainPlanBindings(plan, {
      readablePaths: [".env", "src/config.js"],
      writablePaths: ["report.json"],
    });
    const fixtures = [
      {
        env: "ALPHA=1\nBETA=2\n",
        source: "const b = process.env.BETA; const c = process.env.GAMMA;\n",
        expected: { definedAndUsed: ["BETA"], definedUnconfirmedUnused: ["ALPHA"], usedUndefined: ["GAMMA"] },
      },
      {
        env: "DELTA=1\nEPSILON=2\n",
        source: "const d = process.env.DELTA; const z = process.env.ZETA;\n",
        expected: { definedAndUsed: ["DELTA"], definedUnconfirmedUnused: ["EPSILON"], usedUndefined: ["ZETA"] },
      },
    ];
    for (const fixture of fixtures) {
      const workDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-"));
      temporaryDirectories.push(workDir);
      await write(workDir, ".env", fixture.env);
      await write(workDir, "src/config.js", fixture.source);
      const before = sha256Bytes(await readFile(join(workDir, ".env")));
      const result = await executeRestrictedDomainPlan({
        workDir,
        plan,
        readablePaths: [".env", "src/config.js"],
        writablePaths: ["report.json"],
      });
      expect(result).toMatchObject({
        status: "complete",
        executedSteps: 7,
        writtenPaths: ["report.json"],
        skillSpecificBranches: 0,
      });
      expect(JSON.parse(await readFile(join(workDir, "report.json"), "utf8"))).toEqual(fixture.expected);
      expect(sha256Bytes(await readFile(join(workDir, ".env")))).toBe(before);
    }
    expect(JSON.stringify(plan)).not.toContain("ALPHA");
    expect(JSON.stringify(plan)).not.toContain("DELTA");
  });

  test("supports public classification, conditional copy, and JSON-safe text templating", async () => {
    const plan = RestrictedDomainPlanSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "generic-text-classification",
      steps: [
        { id: "document", op: "read-text", path: "document.txt" },
        { id: "is-target", op: "regex-test", source: "document", pattern: "^Target", flags: "m" },
        {
          id: "class",
          op: "choose",
          condition: "is-target",
          whenTrue: { kind: "literal", value: "target" },
          whenFalse: { kind: "literal", value: "other" },
        },
        {
          id: "write-review",
          op: "write-text-template",
          path: "review.md",
          template: "result={{class}}\n",
          bindings: [{ token: "class", value: { kind: "ref", ref: "class" }, encoding: "json" }],
        },
        { id: "copy-target", op: "copy-text", source: "document", path: "deliverable.md", when: "is-target" },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    });
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-text-"));
    temporaryDirectories.push(workDir);
    await write(workDir, "document.txt", "Target document\nBody\n");
    await executeRestrictedDomainPlan({
      workDir,
      plan,
      readablePaths: ["document.txt"],
      writablePaths: ["review.md", "deliverable.md"],
    });
    expect(await readFile(join(workDir, "review.md"), "utf8").then((value) => value.trim())).toBe('result="target"');
    expect(await readFile(join(workDir, "deliverable.md"), "utf8")).toBe("Target document\nBody\n");
  });

  test("fails closed for arbitrary code, unsafe paths, undeclared output, and invalid register flow", () => {
    expect(RestrictedDomainPlanSchema.safeParse({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "unsafe",
      steps: [{ id: "shell", op: "shell", command: "rm -rf ." }],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    }).success).toBe(false);
    expect(RestrictedDomainPlanSchema.safeParse({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "unsafe-path",
      steps: [{ id: "read", op: "read-text", path: "../secret.txt" }],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    }).success).toBe(false);
    const plan = inventoryPlan();
    expect(() => validateRestrictedDomainPlanBindings(plan, {
      readablePaths: [".env", "src/config.js"],
      writablePaths: ["different.json"],
    })).toThrow("undeclared output");
    const broken = structuredClone(plan);
    const operation = broken.steps.find((entry) => entry.id === "used")! as { left: string };
    operation.left = "future-register";
    expect(() => RestrictedDomainPlanSchema.parse(broken)).toThrow("unknown or forward register");
  });
});
