import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../../core/workdir-manifest";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import { RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import { buildRestrictedDomainPlanPackage } from "./automatic-restricted-domain-plan-runtime";
import { compileStructuralExecutionPlan } from "./automatic-structural-execution";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";
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

describe("restricted Domain Plan validated artifact", () => {
  test("runs the generic process in a catalog-valid package and validates the real workdir", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-package-"));
    temporaryDirectories.push(rootDir);
    const source = `---
name: domain-package
description: Produce a public variable inventory
---
# Domain package
## Workflow
1. Read the environment and sources.
2. Write the report.
`;
    const description = `${JSON.stringify({
      schemaVersion: "skill-ir-task-description/v1",
      descriptionId: "domain-package-task",
      taskKind: "analysis-report",
      inputs: [
        { id: "environment", path: ".env", format: "text", access: "read-only", required: true },
        { id: "source", path: "src/config.js", format: "source-file", access: "read-only", required: true },
      ],
      outputs: [{
        id: "report",
        path: "report.json",
        format: "json",
        required: true,
        structure: { kind: "json-object", requiredFields: ["definedAndUsed"], allowAdditionalFields: false },
      }],
      passCriteria: [
        { id: "inputs-stable", predicate: "input-integrity", targetRefs: ["environment", "source"], statement: "Inputs remain stable." },
        { id: "outputs-exact", predicate: "exact-output-set", targetRefs: ["report"], statement: "Only the report is created." },
        { id: "report-shape", predicate: "json-shape", targetRefs: ["report"], statement: "The report has the declared field." },
      ],
    }, null, 2)}\n`;
    await write(rootDir, "SKILL.md", source);
    await write(rootDir, "task-description.json", description);
    const candidate = await constructDomainSkillCandidates(rootDir, {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(source)),
        repository: "https://example.invalid/domain-package",
        commit: "0".repeat(40),
        upstreamPath: "SKILL.md",
      },
      taskDescription: {
        path: "task-description.json",
        sha256: sha256Bytes(Buffer.from(description)),
        authoring: {
          measurementStartedAt: "2026-08-24T00:00:00.000Z",
          measurementCompletedAt: "2026-08-24T00:01:00.000Z",
          humanMinutes: 1,
        },
      },
    });
    const structuralPlan = compileStructuralExecutionPlan(candidate, []);
    const workDir = join(rootDir, "workdir");
    await write(workDir, ".env", "PORT=3000\n");
    await write(workDir, "src/config.js", "const port = process.env.PORT;\n");
    const initialManifest = InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: await snapshotWorkdir(workDir),
    });
    const plan = RestrictedDomainPlanSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "domain-package-plan",
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
        { id: "names", op: "pluck", source: "references", field: "name" },
        { id: "used", op: "set-operation", operator: "intersection", left: "definitions", right: "names" },
        { id: "write", op: "write-json", path: "report.json", fields: [{ key: "definedAndUsed", value: { kind: "ref", ref: "used" } }] },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    });
    const packageRecord = await buildRestrictedDomainPlanPackage({
      packageDir: join(rootDir, "package"),
      candidate,
      structuralPlan,
      domainPlan: plan,
      initialManifest,
      sourceBytes: Buffer.from(source),
      taskId: "domain-package-dev-001",
      taskPrompt: "Produce the report.",
    });
    expect(packageRecord.executionPlan.nodes.map((entry) => [entry.id, entry.kind])).toEqual([
      ["execute-domain-plan", "process"],
      ["validate-outputs", "validate"],
    ]);
    const result = await runValidatedArtifactPlan({ package: packageRecord, workDir });
    expect(result.status).toBe("complete");
    expect(result.validation?.status).toBe("pass");
    expect(JSON.parse(await readFile(join(workDir, "report.json"), "utf8"))).toEqual({ definedAndUsed: ["PORT"] });
    expect(await readFile(join(workDir, ".env"), "utf8")).toBe("PORT=3000\n");
    expect(result.modelGenerationTokens).toBe(0);
  });
});
