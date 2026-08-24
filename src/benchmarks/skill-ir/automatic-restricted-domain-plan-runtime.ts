import { resolve } from "node:path";
import type { InitialWorkdirManifest } from "../../core/workdir-manifest";
import type { DomainAutomaticConstructionResult } from "./automatic-domain-construction";
import {
  RestrictedDomainPlanSchema,
  validateRestrictedDomainPlanBindings,
  type RestrictedDomainPlan,
} from "./automatic-restricted-domain-plan";
import {
  StructuralExecutionPlanSchema,
  type StructuralExecutionPlan,
} from "./automatic-structural-execution";
import {
  assembleValidatedArtifactPackage,
  type ValidatedArtifactAssemblyAdapter,
} from "./validated-artifact-assembly";
import { sha256Bytes } from "./source-fixture";

type RestrictedDomainPlanPackageInput = {
  packageDir: string;
  candidate: DomainAutomaticConstructionResult;
  structuralPlan: StructuralExecutionPlan;
  domainPlan: RestrictedDomainPlan;
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
    throw new Error(`restricted Domain Plan bundle failed: ${result.logs.map((entry) => entry.message).join("; ")}`);
  }
  return new Uint8Array(await result.outputs[0]!.arrayBuffer());
}

export function deriveRestrictedDomainPlanBindings(plan: StructuralExecutionPlan, initialManifest: InitialWorkdirManifest) {
  const initialFiles = initialManifest.entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
  const readablePaths = [...new Set(plan.targets
    .filter((target) => target.role === "input" && target.access === "read-only")
    .flatMap((target) => [
      ...target.paths.filter((path) => initialFiles.includes(path)),
      ...target.prefixes.flatMap((prefix) => initialFiles.filter((path) => path.startsWith(`${prefix}/`))),
    ]))].sort((left, right) => left.localeCompare(right, "en"));
  const outputs = plan.targets.filter((target) => target.role === "output");
  if (outputs.some((target) => target.prefixes.length > 0)) {
    throw new Error("restricted Domain Plan package requires concrete output bindings");
  }
  const writablePaths = [...new Set(outputs.flatMap((target) => target.paths))]
    .sort((left, right) => left.localeCompare(right, "en"));
  return { readablePaths, writablePaths };
}

export async function buildRestrictedDomainPlanPackage(input: RestrictedDomainPlanPackageInput) {
  const structuralPlan = StructuralExecutionPlanSchema.parse(input.structuralPlan);
  const domainPlan = RestrictedDomainPlanSchema.parse(input.domainPlan);
  if (structuralPlan.skillId !== input.candidate.contract.skillId) {
    throw new Error("restricted Domain Plan package identity mismatch");
  }
  const bindings = deriveRestrictedDomainPlanBindings(structuralPlan, input.initialManifest);
  if (bindings.readablePaths.length === 0) throw new Error("restricted Domain Plan package requires a protected input");
  if (bindings.writablePaths.length === 0) throw new Error("restricted Domain Plan package requires a declared output");
  validateRestrictedDomainPlanBindings(domainPlan, bindings);

  const [runnerBytes, checkerBytes] = await Promise.all([
    bundle("automatic-restricted-domain-plan-runner.ts"),
    bundle("automatic-restricted-domain-plan-checker.ts"),
  ]);
  const payloads = {
    "skill-ir": jsonText(input.candidate.baseIr),
    "skill-view": input.sourceBytes,
    "construction-audit": jsonText(input.candidate.audit),
    "domain-contract": jsonText(input.candidate.contract),
    "structural-plan": jsonText(structuralPlan),
    "domain-plan": jsonText(domainPlan),
    "domain-bindings": jsonText(bindings),
    "initial-manifest": jsonText(input.initialManifest),
    "domain-runner": runnerBytes,
    "output-checker": checkerBytes,
  } as const;
  const digest = (id: keyof typeof payloads) => sha256Bytes(
    typeof payloads[id] === "string" ? Buffer.from(payloads[id], "utf8") : payloads[id],
  );
  const adapter: ValidatedArtifactAssemblyAdapter = {
    schemaVersion: "validated-artifact-assembly-adapter/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: structuralPlan.skillId,
    adapterId: "automatic-restricted-domain-plan",
    version: "v1",
    compiler: {
      id: "automatic-restricted-domain-plan",
      version: "v1",
      configSha256: digest("domain-plan"),
    },
    protectedInputs: bindings.readablePaths,
    generatedOutputs: bindings.writablePaths,
    executionPlan: {
      schemaVersion: "skill-artifact-execution-plan/v1",
      entrypoint: "validate-outputs",
      nodes: [
        {
          id: "execute-domain-plan",
          kind: "process",
          dependsOn: [],
          command: {
            interpreter: { env: "SKVM_BUN_BINARY", fallback: "bun" },
            artifactId: "domain-runner",
            args: [
              "--domain-plan", "{artifact:domain-plan}",
              "--bindings", "{artifact:domain-bindings}",
              "--workdir", "{workdir}",
            ],
            envAllowlist: ["SKVM_BUN_BINARY"],
          },
          timeoutMs: 30_000,
        },
        {
          id: "validate-outputs",
          kind: "validate",
          dependsOn: ["execute-domain-plan"],
          command: {
            interpreter: { env: "SKVM_BUN_BINARY", fallback: "bun" },
            artifactId: "output-checker",
            args: [
              "--structural-plan", "{artifact:structural-plan}",
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
      { id: "domain-plan", path: "restricted-domain-plan.json", kind: "tool-plan" },
      { id: "domain-bindings", path: "domain-bindings.json", kind: "validation-notes" },
      { id: "initial-manifest", path: "initial-workdir-manifest.json", kind: "validation-notes" },
      { id: "domain-runner", path: "domain-runner.js", kind: "script" },
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
