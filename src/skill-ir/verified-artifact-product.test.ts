import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";
import {
  VerifiedArtifactWorkflowConfigSchema,
  runVerifiedArtifactWorkflow,
  validateVerifiedArtifactProduct,
} from "./verified-artifact-product";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function write(root: string, relativePath: string, content: string): Promise<{ path: string; sha256: string }> {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return { path: relativePath.replaceAll("\\", "/"), sha256: sha256Bytes(Buffer.from(content, "utf8")) };
}

async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), "verified-artifact-product-root-"));
  temporaryDirectories.push(rootDir);
  const sourceText = `---
name: manifest-summary
description: Summarize a public JSON manifest deterministically
---
# Manifest summary
## Workflow
1. Read the public manifest.
2. Produce the declared summary.
## Rules
- Do not modify inputs.
`;
  const description = {
    schemaVersion: "skill-ir-task-description/v1" as const,
    descriptionId: "manifest-summary-task",
    taskKind: "analysis-report" as const,
    inputs: [
      { id: "manifest", path: "manifest.json", format: "json" as const, access: "read-only" as const, required: true },
      { id: "interface", path: "summary-interface.json", format: "json" as const, access: "read-only" as const, required: true },
    ],
    outputs: [{
      id: "summary",
      path: "summary.json",
      format: "json" as const,
      required: true,
      structure: { kind: "json-object" as const, requiredFields: ["name", "normalizedName"], allowAdditionalFields: false },
    }],
    passCriteria: [
      { id: "inputs-stable", predicate: "input-integrity" as const, targetRefs: ["manifest", "interface"], statement: "Inputs remain unchanged." },
      { id: "summary-shape", predicate: "json-shape" as const, targetRefs: ["summary"], statement: "The summary has the declared fields." },
      { id: "name-fidelity", predicate: "content-fidelity" as const, targetRefs: ["manifest", "summary"], statement: "The normalized name is derived from the public manifest name." },
    ],
  };
  const plan = {
    schemaVersion: "skill-ir-restricted-domain-plan/v1" as const,
    planId: "manifest-summary-candidate",
    steps: [
      { id: "manifest", op: "read-json" as const, path: "manifest.json" },
      { id: "name", op: "json-pointer" as const, source: "manifest", pointer: "/name" },
      {
        id: "write-summary",
        op: "write-json" as const,
        path: "summary.json",
        fields: [
          { key: "name", value: { kind: "ref" as const, ref: "name" } },
          { key: "normalizedName", value: { kind: "ref" as const, ref: "name" } },
        ],
      },
    ],
    audit: { paidCalls: 1 as const, retries: 0 as const, heldOutAccesses: 0 as const, evaluatorPayloadAccesses: 0 as const, skillSpecificBranches: 0 as const },
  };
  const patchText = `import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
function argument(name: string): string {
  const value = process.argv.slice(2).find((entry) => entry.startsWith(name + "="))?.slice(name.length + 1);
  if (!value) throw new Error("missing argument");
  return value;
}
const workDir = path.resolve(argument("--workdir"));
const interfacePath = argument("--interface");
const manifest = JSON.parse(await readFile(path.join(workDir, "manifest.json"), "utf8"));
const contract = JSON.parse(await readFile(path.join(workDir, interfacePath), "utf8"));
const output = path.join(workDir, contract.output);
await writeFile(output, JSON.stringify({ name: manifest.name, normalizedName: String(manifest.name).trim().toLowerCase() }, null, 2) + "\\n", "utf8");
process.stdout.write(JSON.stringify({ status: "patched", outputs: 1 }) + "\\n");
`;
  const checkerText = `import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function checkVerifiedArtifact(options: { workDir: string; initialWorkdirManifest?: { path: string; sha256: string } }) {
  if (!options.initialWorkdirManifest) return { status: "fail", detail: "initial manifest reference is required" };
  const manifest = JSON.parse(await readFile(options.initialWorkdirManifest.path, "utf8"));
  if (manifest.entries.some((entry: { path: string }) => entry.path === "summary.json")) {
    return { status: "fail", detail: "initial manifest must precede preview outputs" };
  }
  const value = JSON.parse(await readFile(join(options.workDir, "summary.json"), "utf8"));
  return { status: value.normalizedName === "alpha project" ? "pass" : "fail", detail: "normalized public name" };
}
`;

  const source = await write(rootDir, "SKILL.md", sourceText);
  const taskDescription = await write(rootDir, "task-description.json", jsonText(description));
  const automaticPlan = await write(rootDir, "automatic-plan.json", jsonText(plan));
  const reviewPatch = await write(rootDir, "review-patch.ts", patchText);
  const checker = await write(rootDir, "checker.ts", checkerText);
  const workDir = join(rootDir, "workdir");
  await mkdir(workDir, { recursive: true });
  await writeFile(join(workDir, "manifest.json"), jsonText({ name: " Alpha Project " }), "utf8");
  await writeFile(join(workDir, "summary-interface.json"), jsonText({ output: "summary.json" }), "utf8");

  const baseConfig = {
    schemaVersion: "skill-ir-verified-artifact-workflow-config/v1" as const,
    workflowId: "manifest-summary-product",
    source: {
      ...source,
      repository: "https://example.invalid/manifest-summary",
      commit: "0123456789abcdef0123456789abcdef01234567",
      upstreamPath: "SKILL.md",
    },
    taskDescription: {
      ...taskDescription,
      authoring: {
        measurementStartedAt: "2026-08-29T01:00:00.000Z",
        measurementCompletedAt: "2026-08-29T01:02:00.000Z",
        humanMinutes: 2,
      },
    },
    review: {
      automaticPlan,
      patch: reviewPatch,
      publicInterfacePath: "summary-interface.json",
      coreBranchDelta: 0 as const,
      physicalLoc: patchText.split(/\r?\n/u).filter((line) => line.trim()).length,
    },
    production: {
      oneTimeModelTokens: { status: "measured" as const, value: 10 },
      originalRuntime: {
        status: "measured" as const,
        samples: 2,
        aggregateModelTokens: 200,
        aggregateDurationMs: 2000,
        evidence: source,
      },
    },
  };
  return { rootDir, workDir, baseConfig, checker };
}

describe("verified artifact product workflow", () => {
  test("runs B-default through one shared chain and binds a real acceptance receipt", async () => {
    const { rootDir, workDir, baseConfig } = await fixture();
    const outDir = join(rootDir, "user-product");
    const config = VerifiedArtifactWorkflowConfigSchema.parse({
      ...baseConfig,
      quality: { mode: "user-accepted" },
    });
    const result = await runVerifiedArtifactWorkflow({
      rootDir,
      workDir,
      outDir,
      config,
      accept: async (review) => {
        expect(review.candidate.status).toBe("review-required");
        expect(review.delta).toEqual({ created: ["summary.json"], modified: [], deleted: [], exactOutputSet: true });
        expect(review.outputs).toHaveLength(1);
        return {
          decision: "accepted",
          acceptedAt: "2026-08-29T01:10:00.000Z",
          humanMinutes: 3,
          note: "Reviewed the exact output delta.",
        };
      },
    });

    expect(result.stageOrder).toEqual(["compile", "review-or-accept", "package", "run", "cost"]);
    expect(result.candidate.status).toBe("review-required");
    expect(result.qualityEvidence).toMatchObject({
      qualityEvidence: "user-accepted",
      checkerAbsent: true,
      decision: "accepted",
      humanMinutes: 3,
    });
    expect(result.qualityEvidence.artifact.closureSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.qualityEvidence.sourceInputs).toHaveLength(4);
    expect(result.qualityEvidence.workdirInputs.map((entry) => entry.path)).toEqual(["manifest.json", "summary-interface.json"]);
    expect(result.qualityEvidence.outputs.map((entry) => entry.path)).toEqual(["summary.json"]);
    const artifactManifest = JSON.parse(await readFile(join(outDir, "artifact/package-manifest.json"), "utf8"));
    const artifactProvenance = JSON.parse(await readFile(
      join(outDir, "artifact", artifactManifest.provenance.path),
      "utf8",
    ));
    expect(artifactProvenance.inputs.sourceAudit.path).toBe("artifacts/source-audit.json");
    expect(JSON.parse(await readFile(join(outDir, "artifact/artifacts/source-audit.json"), "utf8"))).toMatchObject({
      status: "digest-only",
      semanticSourceAudit: "not-established",
      automaticCandidateStatus: "non-executable",
    });
    expect(result.cost).toMatchObject({
      qualityEvidence: "user-accepted",
      claim: "token-saving-under-user-accepted-quality",
      researchEligibility: "not-eligible",
      production: { oneTime: { acceptance: { humanMinutes: 3 } }, recurring: { acceptanceHumanMinutesPerRun: 0 } },
      breakEven: { status: "computed", calls: 1 },
      totalCostBreakEven: { status: "not-computable", reason: "no human-time valuation policy is frozen" },
    });
    expect(JSON.parse(await readFile(join(workDir, "summary.json"), "utf8"))).toEqual({
      name: " Alpha Project ",
      normalizedName: "alpha project",
    });
    await expect(validateVerifiedArtifactProduct(outDir)).resolves.toMatchObject({
      qualityEvidence: { qualityEvidence: "user-accepted" },
    });

    await writeFile(join(outDir, "quality-evidence.json"), "{}\n", "utf8");
    await expect(validateVerifiedArtifactProduct(outDir)).rejects.toThrow("quality evidence digest mismatch");
  });

  test("canonicalizes the packaged skill view so Git checkout preserves its closure", async () => {
    const { rootDir, workDir, baseConfig } = await fixture();
    const sourcePath = join(rootDir, "SKILL.md");
    const crlfSource = (await readFile(sourcePath, "utf8")).replace(/\r?\n/gu, "\r\n");
    await writeFile(sourcePath, crlfSource, "utf8");
    const source = {
      ...baseConfig.source,
      sha256: sha256Bytes(Buffer.from(crlfSource, "utf8")),
    };
    const outDir = join(rootDir, "git-stable-product");

    await runVerifiedArtifactWorkflow({
      rootDir,
      workDir,
      outDir,
      config: {
        ...baseConfig,
        source,
        quality: { mode: "user-accepted" },
        production: {
          ...baseConfig.production,
          originalRuntime: {
            ...baseConfig.production.originalRuntime,
            evidence: { path: source.path, sha256: source.sha256 },
          },
        },
      },
      accept: async () => ({
        decision: "accepted",
        acceptedAt: "2026-08-29T01:10:00.000Z",
        humanMinutes: 1,
        note: "Accepted.",
      }),
    });

    expect(await readFile(join(outDir, "artifact/skill.md"), "utf8")).not.toContain("\r\n");
    await expect(validateVerifiedArtifactProduct(outDir)).resolves.toBeDefined();
  });

  test("uses the same artifact/runtime/cost chain for A-optional and changes only quality evidence", async () => {
    const first = await fixture();
    const user = await runVerifiedArtifactWorkflow({
      rootDir: first.rootDir,
      workDir: first.workDir,
      outDir: join(first.rootDir, "user-product"),
      config: { ...first.baseConfig, quality: { mode: "user-accepted" } },
      accept: async () => ({
        decision: "accepted",
        acceptedAt: "2026-08-29T01:10:00.000Z",
        humanMinutes: 3,
        note: "Accepted.",
      }),
    });

    const second = await fixture();
    const machine = await runVerifiedArtifactWorkflow({
      rootDir: second.rootDir,
      workDir: second.workDir,
      outDir: join(second.rootDir, "machine-product"),
      config: { ...second.baseConfig, quality: { mode: "machine-checked", checker: second.checker } },
    });

    expect(JSON.parse(await readFile(join(second.rootDir, "machine-product/artifact/package-manifest.json"), "utf8")))
      .toEqual(JSON.parse(await readFile(join(first.rootDir, "user-product/artifact/package-manifest.json"), "utf8")));
    expect(machine.artifact.closureSha256).toBe(user.artifact.closureSha256);
    expect(machine.stageOrder).toEqual(user.stageOrder);
    expect(machine.qualityEvidence).toMatchObject({
      qualityEvidence: "machine-checked",
      status: "pass",
      researchDisposition: "eligible-for-authority-review",
    });
    expect(machine.cost).toMatchObject({
      qualityEvidence: "machine-checked",
      claim: "token-saving-under-machine-checked-quality",
      researchEligibility: "eligible-for-authority-review",
      production: { recurring: { acceptanceHumanMinutesPerRun: 0 } },
    });
  });

  test("fails closed when the accepted input bytes drift before the production run", async () => {
    const { rootDir, workDir, baseConfig } = await fixture();
    await expect(runVerifiedArtifactWorkflow({
      rootDir,
      workDir,
      outDir: join(rootDir, "drift-product"),
      config: { ...baseConfig, quality: { mode: "user-accepted" } },
      accept: async () => {
        await writeFile(join(workDir, "manifest.json"), jsonText({ name: "tampered" }), "utf8");
        return {
          decision: "accepted",
          acceptedAt: "2026-08-29T01:10:00.000Z",
          humanMinutes: 1,
          note: "This must fail before run.",
        };
      },
    })).rejects.toThrow("workdir input digest drift after review");
  });

  test("does not call a zero-recurring baseline token-saving", async () => {
    const { rootDir, workDir, baseConfig } = await fixture();
    const result = await runVerifiedArtifactWorkflow({
      rootDir,
      workDir,
      outDir: join(rootDir, "no-saving-product"),
      config: {
        ...baseConfig,
        production: {
          ...baseConfig.production,
          originalRuntime: {
            ...baseConfig.production.originalRuntime,
            aggregateModelTokens: 0,
          },
        },
        quality: { mode: "user-accepted" },
      },
      accept: async () => ({
        decision: "accepted",
        acceptedAt: "2026-08-29T01:10:00.000Z",
        humanMinutes: 1,
        note: "Accepted for a no-savings claim test.",
      }),
    });
    expect(result.cost).toMatchObject({
      claim: "token-savings-not-reached",
      breakEven: { status: "not-reached", calls: null },
    });
  });

  test("fails closed when imported recurring-cost evidence is not digest-bound", async () => {
    const { rootDir, workDir, baseConfig } = await fixture();
    await expect(runVerifiedArtifactWorkflow({
      rootDir,
      workDir,
      outDir: join(rootDir, "cost-evidence-drift-product"),
      config: {
        ...baseConfig,
        production: {
          ...baseConfig.production,
          originalRuntime: {
            ...baseConfig.production.originalRuntime,
            evidence: { ...baseConfig.production.originalRuntime.evidence, sha256: "0".repeat(64) },
          },
        },
        quality: { mode: "user-accepted" },
      },
      accept: async () => ({
        decision: "accepted",
        acceptedAt: "2026-08-29T01:10:00.000Z",
        humanMinutes: 1,
        note: "This must not bypass imported-cost evidence validation.",
      }),
    })).rejects.toThrow("digest mismatch");
  });
});
