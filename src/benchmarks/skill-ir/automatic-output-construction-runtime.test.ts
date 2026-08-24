import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../../core/workdir-manifest";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import {
  compileAutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import { buildAutomaticOutputConstructionPackage } from "./automatic-output-construction-runtime";
import { compileStructuralExecutionPlan } from "./automatic-structural-execution";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";
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

describe("automatic output construction validated-artifact package", () => {
  test("runs construction before validation and preserves honest partial failure", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-output-package-"));
    temporaryDirectories.push(rootDir);
    const source = `---
name: output-package
description: Produce a grounded JSON report
---
# Output package
## Workflow
1. Read the public source.
2. Produce the report.
`;
    const description = `${JSON.stringify({
      schemaVersion: "skill-ir-task-description/v1",
      descriptionId: "output-package-task",
      taskKind: "analysis-report",
      inputs: [{ id: "source", path: "source.json", format: "json", access: "read-only", required: true }],
      outputs: [{
        id: "report",
        path: "report.json",
        format: "json",
        required: true,
        structure: { kind: "json-object", requiredFields: ["studyId", "manualField"], allowAdditionalFields: false },
      }],
      passCriteria: [
        { id: "source-stable", predicate: "input-integrity", targetRefs: ["source"], statement: "The source remains unchanged." },
        { id: "outputs-exact", predicate: "exact-output-set", targetRefs: ["report"], statement: "Only the report exists." },
        { id: "report-shape", predicate: "json-shape", targetRefs: ["report"], statement: "The report contains all fields." },
      ],
    }, null, 2)}\n`;
    await write(rootDir, "SKILL.md", source);
    await write(rootDir, "task-description.json", description);
    const candidate = await constructDomainSkillCandidates(rootDir, {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(source)),
        repository: "https://example.invalid/output-package",
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
    await write(workDir, "source.json", "{\"studyId\":\"study-runtime\"}\n");
    const initialManifest = InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: await snapshotWorkdir(workDir),
    });
    const constructionPlan = await compileAutomaticOutputConstructionPlan({ workDir, structuralPlan });

    const packageRecord = await buildAutomaticOutputConstructionPackage({
      packageDir: join(rootDir, "package"),
      candidate,
      structuralPlan,
      constructionPlan,
      initialManifest,
      sourceBytes: Buffer.from(source),
      taskId: "output-package-dev-001",
      taskPrompt: "Produce the declared report.",
    });
    expect(packageRecord.executionPlan.nodes.map((entry) => [entry.id, entry.kind, entry.dependsOn])).toEqual([
      ["construct-outputs", "process", []],
      ["validate-outputs", "validate", ["construct-outputs"]],
    ]);

    const result = await runValidatedArtifactPlan({ package: packageRecord, workDir });
    expect(result.status).toBe("validation-failure");
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "construct-outputs", kind: "process", status: "complete" }),
      expect.objectContaining({ id: "validate-outputs", kind: "validate", status: "complete" }),
    ]));
    expect(result.validation?.errors).toContainEqual(expect.objectContaining({
      code: "JSON_REQUIRED_FIELD_MISSING",
      contractRef: "report-shape",
      relativePath: "report.json",
    }));
    expect(result.validation?.errors.some((entry) => entry.code === "SOURCE_FIELD_PROJECTION_MISMATCH")).toBe(false);
    expect(JSON.parse(await readFile(join(workDir, "report.json"), "utf8"))).toEqual({ studyId: "study-runtime" });
    expect(await readFile(join(workDir, "source.json"), "utf8")).toBe("{\"studyId\":\"study-runtime\"}\n");
    expect(result.modelGenerationTokens).toBe(0);
  });
});
