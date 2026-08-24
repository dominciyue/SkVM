import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillIRSchema } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import { sha256Bytes } from "./source-fixture";
import {
  AutomaticConstructionInputSchema,
  constructSkillCandidates,
} from "./automatic-construction";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-auto-construction-"));
  temporaryDirectories.push(rootDir);
  const sourcePath = "public/source/SKILL.md";
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
- \`report.json\` with the observed facts.

## Rules
- Never modify source files.
- If evidence is missing, report the uncertainty.
`;
  await writeFile(join(rootDir, "public-source.md"), sourceText, "utf8");
  return {
    rootDir,
    input: {
      schemaVersion: "skill-ir-automatic-construction-input/v1" as const,
      source: {
        path: "public-source.md",
        sha256: sha256Bytes(Buffer.from(sourceText, "utf8")),
        repository: "https://example.invalid/sample",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: sourcePath,
      },
    },
  };
}

describe("automatic construction", () => {
  test("accepts public generation inputs only and rejects shadow oracle leakage", async () => {
    const { input } = await fixture();
    expect(() => AutomaticConstructionInputSchema.parse({
      ...input,
      shadowOracles: { baseIrPath: "manual/base-ir.json" },
    })).toThrow();
  });

  test("deterministically constructs four conservative candidates from one public source", async () => {
    const { rootDir, input } = await fixture();
    const first = await constructSkillCandidates(rootDir, input);
    const second = await constructSkillCandidates(rootDir, input);

    expect(second).toEqual(first);
    expect(first.audit).toMatchObject({
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      readPaths: ["public-source.md"],
    });
    expect(first.contract).toMatchObject({
      schemaVersion: "skill-ir-source-contract-candidate/v1",
      skillId: "sample-helper",
      intent: "Inspect a workspace and generate a safe report",
    });
    expect(first.contract.outputs.map((output) => output.sourceText)).toContain(
      "`report.json` with the observed facts.",
    );

    const ir = SkillIRSchema.parse(first.baseIr);
    expect(validateSkillIR(ir).errors).toEqual([]);
    expect(ir.steps).toHaveLength(3);
    expect(ir.steps.every((step) => sourceTextIncludes(first.sourceSnapshot.text, step.description))).toBe(true);
    expect(ir.rules.map((rule) => rule.sourceText)).toEqual([
      "Never modify source files.",
      "If evidence is missing, report the uncertainty.",
    ]);

    expect(first.validationPlan.checks.map((check) => check.id)).toEqual([
      "source-digest",
      "contract-structure",
      "skill-ir-schema",
      "skill-ir-references",
      "source-trace",
      "domain-semantics",
      "package-runtime",
    ]);
    expect(first.validationPlan.checks.at(-2)?.status).toBe("requires-human");
    expect(first.packageCandidate).toMatchObject({
      schemaVersion: "skill-ir-package-candidate/v1",
      status: "non-executable",
      executionPlan: null,
    });
    expect(first.packageCandidate.artifacts.map((artifact) => artifact.path)).toEqual([
      "skill.md",
      "skill-ir.json",
      "source-contract.json",
      "validation-plan.json",
    ]);
  });

  test("fails closed on a source digest mismatch", async () => {
    const { rootDir, input } = await fixture();
    await expect(constructSkillCandidates(rootDir, {
      ...input,
      source: { ...input.source, sha256: "0".repeat(64) },
    })).rejects.toThrow("source digest mismatch");
  });

  test("prefers numbered workflow subheadings over their implementation bullets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-auto-heading-"));
    temporaryDirectories.push(rootDir);
    const sourceText = `---
name: heading-helper
description: Process a task in numbered phases
---
# Heading helper
## Workflow
### 1. Inspect inputs
- Read files.
- Check metadata.
### Phase 2: Produce output
- Write result.
## Output
- result.json
`;
    await writeFile(join(rootDir, "SKILL.md"), sourceText, "utf8");
    const result = await constructSkillCandidates(rootDir, {
      schemaVersion: "skill-ir-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(sourceText, "utf8")),
        repository: "https://example.invalid/heading",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: "SKILL.md",
      },
    });
    expect(result.baseIr.steps.map((step) => step.description)).toEqual([
      "1. Inspect inputs",
      "Phase 2: Produce output",
    ]);
  });

  test("does not claim a source trace when it had to synthesize the fallback step", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-auto-no-workflow-"));
    temporaryDirectories.push(rootDir);
    const sourceText = "---\nname: no-workflow\ndescription: A source without steps\n---\n# No workflow\n";
    await writeFile(join(rootDir, "SKILL.md"), sourceText, "utf8");
    const result = await constructSkillCandidates(rootDir, {
      schemaVersion: "skill-ir-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(sourceText)),
        repository: "https://example.invalid/no-workflow",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: "SKILL.md",
      },
    });
    expect(result.validationPlan.checks.find((check) => check.id === "source-trace")?.status).toBe("failed");
  });
});

function sourceTextIncludes(source: string, value: string): boolean {
  return source.includes(value);
}
