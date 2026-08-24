import { resolve } from "node:path";
import type { InitialWorkdirManifest } from "../../core/workdir-manifest";
import type { DomainAutomaticConstructionResult } from "./automatic-domain-construction";
import {
  AutomaticJsonPointerConstructionPlanSchema,
  type AutomaticJsonPointerConstructionPlan,
} from "./automatic-json-pointer-construction";
import {
  AutomaticOutputConstructionPlanSchema,
  type AutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import {
  StructuralExecutionPlanSchema,
  type StructuralExecutionPlan,
} from "./automatic-structural-execution";
import {
  assembleValidatedArtifactPackage,
  type ValidatedArtifactAssemblyAdapter,
} from "./validated-artifact-assembly";
import { sha256Bytes } from "./source-fixture";

type AutomaticJsonPointerConstructionPackageInput = {
  packageDir: string;
  candidate: DomainAutomaticConstructionResult;
  structuralPlan: StructuralExecutionPlan;
  basePlan: AutomaticOutputConstructionPlan;
  pointerPlan: AutomaticJsonPointerConstructionPlan;
  initialManifest: InitialWorkdirManifest;
  sourceBytes: Uint8Array;
  taskId: string;
  taskPrompt: string;
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function bundle(entrypoint: string): Promise<Uint8Array> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, entrypoint)],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success || result.outputs.length !== 1) {
    throw new Error(`automatic JSON Pointer bundle failed: ${result.logs.map((entry) => entry.message).join("; ")}`);
  }
  return new Uint8Array(await result.outputs[0]!.arrayBuffer());
}

function protectedInputs(plan: StructuralExecutionPlan, initialManifest: InitialWorkdirManifest): string[] {
  const initialFiles = initialManifest.entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
  return [...new Set(plan.targets
    .filter((target) => target.role === "input" && target.access === "read-only")
    .flatMap((target) => [
      ...target.paths,
      ...target.prefixes.flatMap((prefix) => initialFiles.filter((entry) => entry.startsWith(`${prefix}/`))),
    ]))].sort((left, right) => left.localeCompare(right, "en"));
}

function generatedOutputs(plan: StructuralExecutionPlan): string[] {
  const outputs = plan.targets.filter((target) => target.role === "output");
  if (outputs.some((target) => target.prefixes.length > 0)) {
    throw new Error("automatic JSON Pointer package requires concrete output bindings");
  }
  return [...new Set(outputs.flatMap((target) => target.paths))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function buildAutomaticJsonPointerConstructionPackage(
  input: AutomaticJsonPointerConstructionPackageInput,
) {
  const structuralPlan = StructuralExecutionPlanSchema.parse(input.structuralPlan);
  const basePlan = AutomaticOutputConstructionPlanSchema.parse(input.basePlan);
  const pointerPlan = AutomaticJsonPointerConstructionPlanSchema.parse(input.pointerPlan);
  if (structuralPlan.skillId !== basePlan.skillId
    || structuralPlan.skillId !== pointerPlan.skillId
    || structuralPlan.skillId !== input.candidate.contract.skillId) {
    throw new Error("automatic JSON Pointer package identity mismatch");
  }
  const protectedPaths = protectedInputs(structuralPlan, input.initialManifest);
  const outputPaths = generatedOutputs(structuralPlan);
  if (protectedPaths.length === 0) throw new Error("automatic JSON Pointer package requires a protected input");
  if (outputPaths.length === 0) throw new Error("automatic JSON Pointer package requires a declared output");

  const [constructorBytes, checkerBytes] = await Promise.all([
    bundle("automatic-json-pointer-construction-runner.ts"),
    bundle("automatic-json-pointer-construction-checker.ts"),
  ]);
  const payloads = {
    "skill-ir": jsonText(input.candidate.baseIr),
    "skill-view": input.sourceBytes,
    "construction-audit": jsonText(input.candidate.audit),
    "domain-contract": jsonText(input.candidate.contract),
    "structural-plan": jsonText(structuralPlan),
    "base-plan": jsonText(basePlan),
    "pointer-plan": jsonText(pointerPlan),
    "initial-manifest": jsonText(input.initialManifest),
    "output-constructor": constructorBytes,
    "output-checker": checkerBytes,
  } as const;
  const digest = (id: keyof typeof payloads) => sha256Bytes(
    typeof payloads[id] === "string" ? Buffer.from(payloads[id], "utf8") : payloads[id],
  );
  const adapter: ValidatedArtifactAssemblyAdapter = {
    schemaVersion: "validated-artifact-assembly-adapter/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: structuralPlan.skillId,
    adapterId: "automatic-json-pointer-construction",
    version: "v1",
    compiler: {
      id: "automatic-json-pointer-construction",
      version: "v1",
      configSha256: digest("pointer-plan"),
    },
    protectedInputs: protectedPaths,
    generatedOutputs: outputPaths,
    executionPlan: {
      schemaVersion: "skill-artifact-execution-plan/v1",
      entrypoint: "validate-outputs",
      nodes: [
        {
          id: "construct-outputs",
          kind: "process",
          dependsOn: [],
          command: {
            interpreter: { env: "SKVM_BUN_BINARY", fallback: "bun" },
            artifactId: "output-constructor",
            args: [
              "--base-plan", "{artifact:base-plan}",
              "--pointer-plan", "{artifact:pointer-plan}",
              "--workdir", "{workdir}",
            ],
            envAllowlist: ["SKVM_BUN_BINARY"],
          },
          timeoutMs: 30_000,
        },
        {
          id: "validate-outputs",
          kind: "validate",
          dependsOn: ["construct-outputs"],
          command: {
            interpreter: { env: "SKVM_BUN_BINARY", fallback: "bun" },
            artifactId: "output-checker",
            args: [
              "--structural-plan", "{artifact:structural-plan}",
              "--base-plan", "{artifact:base-plan}",
              "--pointer-plan", "{artifact:pointer-plan}",
              "--initial-manifest", "{artifact:initial-manifest}",
              "--workdir", "{workdir}",
            ],
            envAllowlist: ["SKVM_BUN_BINARY"],
          },
          timeoutMs: 30_000,
        },
      ],
    },
    artifactLayout: [
      { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" },
      { id: "skill-view", path: "skill.md", kind: "skill-view" },
      { id: "construction-audit", path: "construction-audit.json", kind: "validation-notes" },
      { id: "domain-contract", path: "domain-contract.json", kind: "schema" },
      { id: "structural-plan", path: "structural-plan.json", kind: "validation-policy" },
      { id: "base-plan", path: "base-construction-plan.json", kind: "tool-plan" },
      { id: "pointer-plan", path: "json-pointer-construction-plan.json", kind: "tool-plan" },
      { id: "initial-manifest", path: "initial-workdir-manifest.json", kind: "validation-notes" },
      { id: "output-constructor", path: "output-constructor.js", kind: "script" },
      { id: "output-checker", path: "output-checker.js", kind: "check" },
    ],
  };
  return assembleValidatedArtifactPackage({
    adapter,
    provenanceInputs: {
      sourceClosure: [{ path: "skill.md", sha256: digest("skill-view") }],
      baseIr: { path: "skill-ir.json", sha256: digest("skill-ir") },
      sourceAudit: { path: "construction-audit.json", sha256: digest("construction-audit") },
      resourceContract: { path: "domain-contract.json", sha256: digest("domain-contract") },
      taskContract: {
        taskIds: [input.taskId],
        promptDigest: sha256Bytes(Buffer.from(input.taskPrompt, "utf8")),
      },
    },
    artifactPayloads: (Object.entries(payloads) as Array<[keyof typeof payloads, string | Uint8Array]>)
      .map(([id, bytes]) => ({ id, bytes })),
  }, input.packageDir);
}
