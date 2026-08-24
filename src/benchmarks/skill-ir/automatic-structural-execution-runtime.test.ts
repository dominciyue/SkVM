import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../../core/workdir-manifest";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import { compileStructuralExecutionPlan } from "./automatic-structural-execution";
import { buildStructuralValidationPackage } from "./automatic-structural-execution-runtime";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(root, ...relativePath.split("/"));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

describe("automatic structural validated-artifact runtime bridge", () => {
  test("executes the generated checker package and rejects pre-runtime input tampering", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-structural-runtime-"));
    temporaryDirectories.push(rootDir);
    const source = `---
name: structural-runtime
description: Produce a JSON report without modifying inputs
---
# Structural runtime
## Workflow
1. Read inputs.
2. Produce the report.
`;
    const description = `${JSON.stringify({
      schemaVersion: "skill-ir-task-description/v1",
      descriptionId: "structural-runtime-task",
      taskKind: "analysis-report",
      inputs: [{ id: "source", path: "source.txt", format: "text", access: "read-only", required: true }],
      outputs: [{ id: "report", path: "report.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["items"], allowAdditionalFields: false } }],
      passCriteria: [
        { id: "source-stable", predicate: "input-integrity", targetRefs: ["source"], statement: "The source remains unchanged." },
        { id: "report-present", predicate: "output-presence", targetRefs: ["report"], statement: "The report exists." },
        { id: "outputs-exact", predicate: "exact-output-set", targetRefs: ["report"], statement: "Only the report exists." },
        { id: "report-shape", predicate: "json-shape", targetRefs: ["report"], statement: "The report contains items." },
      ],
    }, null, 2)}\n`;
    await write(rootDir, "SKILL.md", source);
    await write(rootDir, "task-description.json", description);
    const candidate = await constructDomainSkillCandidates(rootDir, {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(source)),
        repository: "https://example.invalid/structural-runtime",
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
    const plan = compileStructuralExecutionPlan(candidate, []);
    const workDir = join(rootDir, "workdir");
    await write(workDir, "source.txt", "protected\n");
    const initialManifest = InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: await snapshotWorkdir(workDir),
    });
    await write(workDir, "report.json", "{\"items\":[]}\n");

    const packageRecord = await buildStructuralValidationPackage({
      packageDir: join(rootDir, "package"),
      candidate,
      plan,
      initialManifest,
      sourceBytes: Buffer.from(source),
      taskId: "structural-runtime-dev-001",
      taskPrompt: "Produce the declared report.",
    });
    const passing = await runValidatedArtifactPlan({ package: packageRecord, workDir });
    expect(passing).toMatchObject({
      status: "complete",
      validation: { status: "pass", errors: [] },
      modelGenerationTokens: 0,
      modelRepairTokens: 0,
    });

    await write(workDir, "source.txt", "tampered\n");
    const failing = await runValidatedArtifactPlan({ package: packageRecord, workDir });
    expect(failing.status).toBe("validation-failure");
    expect(failing.validation?.errors).toContainEqual(expect.objectContaining({
      code: "INPUT_MODIFIED",
      contractRef: "source-stable",
      relativePath: "source.txt",
    }));
  });
});
