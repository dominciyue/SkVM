import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  VerifiedArtifactCollectionPlanSchema,
  executeVerifiedArtifactCollectionPlan,
} from "../../skill-ir/verified-artifact-collection-plan";
import { sha256Bytes } from "./source-fixture";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const ZeroAccountingSchema = z.object({
  paidModelCalls: z.literal(0),
  apiCalls: z.literal(0),
  retries: z.literal(0),
  heldOutAccesses: z.literal(0),
  evaluatorPayloadAccesses: z.literal(0),
  scorerAccesses: z.literal(0),
}).strict();

export const VerifiedArtifactCollectionQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-collection-qualification/v1"),
  qualificationId: z.literal("verified-artifact-collection-v1"),
  status: z.literal("passed"),
  operations: z.tuple([
    z.literal("enumerate-json-object-keys"),
    z.literal("sort-and-deduplicate-strings"),
  ]),
  componentIdentity: z.array(z.object({
    path: z.string().min(1),
    sha256: DigestSchema,
    bytes: z.number().int().positive(),
  }).strict()).length(3),
  cases: z.array(z.object({
    caseId: z.enum(["package-inventory", "api-tester"]),
    workdirExecuted: z.literal(true),
    protectedInputsPreserved: z.literal(true),
    operations: z.array(z.enum([
      "enumerate-json-object-keys",
      "sort-and-deduplicate-strings",
    ])).min(1),
    outputPath: z.string().min(1),
    outputSha256: DigestSchema,
    executedSteps: z.number().int().positive(),
    observed: z.array(z.string().min(1)).min(1),
  }).strict()).length(2),
  reuse: z.object({
    caseCount: z.literal(2),
    sharedImplementation: z.literal(true),
    coreBranchDelta: z.literal(0),
    status: z.literal("passed"),
  }).strict(),
  effort: z.object({
    measurement: z.literal("non-empty physical lines; development artifacts, not automatic optimizer output"),
    historical: z.object({
      planPhysicalLoc: z.literal(53),
      patchPhysicalLoc: z.literal(58),
      combinedPhysicalLoc: z.literal(111),
    }).strict(),
    current: z.object({
      planPhysicalLoc: z.literal(75),
      patchPhysicalLoc: z.literal(44),
      combinedPhysicalLoc: z.literal(119),
    }).strict(),
    delta: z.object({
      patchPhysicalLoc: z.literal(-14),
      combinedPhysicalLoc: z.literal(8),
    }).strict(),
    totalAdapterEffortReduced: z.literal(false),
    conclusion: z.literal("The executable review patch is 14 physical LOC smaller, but the plan plus patch is 8 physical LOC larger; this stage does not establish lower total adaptation effort."),
  }).strict(),
  closureNormalization: z.object({
    sourceAuthority: z.literal("original-byte-digest"),
    derivedSkillView: z.literal("valid UTF-8 with CRLF changed to LF only"),
    bomPreserved: z.literal(true),
    loneCarriageReturnPreserved: z.literal(true),
    terminalNewlinePreserved: z.literal(true),
    invalidUtf8: z.literal("rejected"),
  }).strict(),
  accounting: ZeroAccountingSchema,
  claimBoundary: z.object({
    crossFieldCounts: z.literal("not-implemented"),
    semanticParity: z.literal("not-established"),
    automaticEligibility: z.literal("not-established"),
    readinessChanged: z.literal(false),
    statement: z.literal("This zero-paid qualification establishes real-workdir execution and two-case reuse for exactly two collection primitives. It does not establish automatic plan generation, full semantic parity, machine-checked product quality, or readiness promotion."),
  }).strict(),
}).strict();

export type VerifiedArtifactCollectionQualification = z.infer<
  typeof VerifiedArtifactCollectionQualificationSchema
>;

const PackageRoot = "benchmarks/skill-ir/pilots/package-inventory-probe";

function physicalLoc(text: string): number {
  return text.split(/\r?\n/u).filter((line) => line.trim()).length;
}

async function digestFile(rootDir: string, path: string) {
  const bytes = await readFile(join(rootDir, ...path.split("/")));
  return { path, sha256: sha256Bytes(bytes), bytes: bytes.byteLength };
}

function apiTesterPlan() {
  return VerifiedArtifactCollectionPlanSchema.parse({
    schemaVersion: "skill-ir-verified-artifact-collection-plan/v1",
    planId: "api-tester-output-keys",
    basePlan: {
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "api-tester-output-keys-base",
      steps: [
        { id: "adapter", op: "read-json", path: "artifact-adapter.json" },
        { id: "outputs", op: "json-pointer", source: "adapter", pointer: "/outputs" },
        {
          id: "write-summary",
          op: "write-json",
          path: "api-output-keys.json",
          fields: [
            { key: "outputMap", value: { kind: "ref", ref: "outputs" } },
            { key: "outputKeys", value: { kind: "literal", value: "review-required" } },
          ],
        },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    },
    steps: [
      {
        id: "enumerate-output-keys",
        op: "enumerate-json-object-keys",
        source: { path: "api-output-keys.json", pointer: "/outputMap" },
        target: { path: "api-output-keys.json", pointer: "/outputKeys" },
      },
      {
        id: "sort-output-keys",
        op: "sort-and-deduplicate-strings",
        sources: [{ path: "api-output-keys.json", pointer: "/outputKeys" }],
        target: { path: "api-output-keys.json", pointer: "/outputKeys" },
      },
    ],
    audit: { paidCalls: 0, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  });
}

async function executePackageCase(rootDir: string, runRoot: string) {
  const workDir = join(runRoot, "package-inventory");
  await mkdir(workDir, { recursive: true });
  const inputSource = join(rootDir, ...`${PackageRoot}/public-workdir/package.json`.split("/"));
  const inputPath = join(workDir, "package.json");
  await cp(inputSource, inputPath);
  const before = await readFile(inputPath);
  const plan = VerifiedArtifactCollectionPlanSchema.parse(JSON.parse(
    await readFile(join(rootDir, ...`${PackageRoot}/reviewed-collection-plan.json`.split("/")), "utf8"),
  ));
  const execution = await executeVerifiedArtifactCollectionPlan({
    plan,
    workDir,
    taskDescription: {
      inputs: [{ path: "package.json", access: "read-only" }],
      outputs: [{ path: "package-inventory.json" }],
    },
  });
  const after = await readFile(inputPath);
  if (!before.equals(after)) throw new Error("package-inventory protected input changed");
  const outputBytes = await readFile(join(workDir, "package-inventory.json"));
  const output = JSON.parse(outputBytes.toString("utf8"));
  if (JSON.stringify(output.productionDependencies) !== JSON.stringify(["alpha-lib", "zeta-lib"])
    || JSON.stringify(output.developmentDependencies) !== JSON.stringify(["alpha-lib", "beta-tool"])
    || JSON.stringify(output.allDependencies) !== JSON.stringify(["alpha-lib", "beta-tool", "zeta-lib"])) {
    throw new Error("package-inventory collection output drift");
  }
  return {
    caseId: "package-inventory" as const,
    workdirExecuted: true as const,
    protectedInputsPreserved: true as const,
    operations: ["enumerate-json-object-keys", "sort-and-deduplicate-strings"] as const,
    outputPath: "package-inventory.json",
    outputSha256: sha256Bytes(outputBytes),
    executedSteps: execution.executedSteps,
    observed: [
      "dependencies and devDependencies object keys were enumerated in the workdir",
      "the two arrays were sorted and their union was deduplicated and sorted",
    ],
  };
}

async function executeApiTesterCase(rootDir: string, runRoot: string) {
  const workDir = join(runRoot, "api-tester");
  await mkdir(workDir, { recursive: true });
  const inputSource = join(rootDir, "benchmarks/skill-ir/pilots/api-tester/artifact-adapter.json");
  const inputPath = join(workDir, "artifact-adapter.json");
  await cp(inputSource, inputPath);
  const before = await readFile(inputPath);
  const execution = await executeVerifiedArtifactCollectionPlan({
    plan: apiTesterPlan(),
    workDir,
    taskDescription: {
      inputs: [{ path: "artifact-adapter.json", access: "read-only" }],
      outputs: [{ path: "api-output-keys.json" }],
    },
  });
  const after = await readFile(inputPath);
  if (!before.equals(after)) throw new Error("api-tester protected input changed");
  const outputBytes = await readFile(join(workDir, "api-output-keys.json"));
  const output = JSON.parse(outputBytes.toString("utf8"));
  if (JSON.stringify(output.outputKeys) !== JSON.stringify(["generator", "plan", "report"])) {
    throw new Error("api-tester collection output drift");
  }
  return {
    caseId: "api-tester" as const,
    workdirExecuted: true as const,
    protectedInputsPreserved: true as const,
    operations: ["enumerate-json-object-keys", "sort-and-deduplicate-strings"] as const,
    outputPath: "api-output-keys.json",
    outputSha256: sha256Bytes(outputBytes),
    executedSteps: execution.executedSteps,
    observed: ["the adapter output-map keys were enumerated, deduplicated, and sorted in the workdir"],
  };
}

async function checkedLoc(rootDir: string, path: string, expected: number): Promise<number> {
  const actual = physicalLoc(await readFile(join(rootDir, ...path.split("/")), "utf8"));
  if (actual !== expected) throw new Error(`${path} physical LOC drift: expected ${expected}, got ${actual}`);
  return actual;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function runVerifiedArtifactCollectionQualification(options: {
  rootDir: string;
  runRoot: string;
  reportPath?: string;
}): Promise<VerifiedArtifactCollectionQualification> {
  const rootDir = resolve(options.rootDir);
  const runRoot = resolve(options.runRoot);
  await mkdir(runRoot, { recursive: true });
  const [packageCase, apiCase] = await Promise.all([
    executePackageCase(rootDir, runRoot),
    executeApiTesterCase(rootDir, runRoot),
  ]);

  const historicalPlanLoc = await checkedLoc(rootDir, `${PackageRoot}/reviewed-plan.json`, 53);
  const historicalPatchLoc = await checkedLoc(rootDir, `${PackageRoot}/review-patch.ts`, 58);
  const currentPlanLoc = await checkedLoc(rootDir, `${PackageRoot}/reviewed-collection-plan.json`, 75);
  const currentPatchLoc = await checkedLoc(rootDir, `${PackageRoot}/review-patch-counts.ts`, 44);
  const report = VerifiedArtifactCollectionQualificationSchema.parse({
    schemaVersion: "skill-ir-verified-artifact-collection-qualification/v1",
    qualificationId: "verified-artifact-collection-v1",
    status: "passed",
    operations: ["enumerate-json-object-keys", "sort-and-deduplicate-strings"],
    componentIdentity: await Promise.all([
      digestFile(rootDir, "src/skill-ir/verified-artifact-collection-plan.ts"),
      digestFile(rootDir, "src/skill-ir/verified-artifact-collection-plan-runner.ts"),
      digestFile(rootDir, "src/skill-ir/artifact-closure-normalization.ts"),
    ]),
    cases: [packageCase, apiCase],
    reuse: { caseCount: 2, sharedImplementation: true, coreBranchDelta: 0, status: "passed" },
    effort: {
      measurement: "non-empty physical lines; development artifacts, not automatic optimizer output",
      historical: {
        planPhysicalLoc: historicalPlanLoc,
        patchPhysicalLoc: historicalPatchLoc,
        combinedPhysicalLoc: historicalPlanLoc + historicalPatchLoc,
      },
      current: {
        planPhysicalLoc: currentPlanLoc,
        patchPhysicalLoc: currentPatchLoc,
        combinedPhysicalLoc: currentPlanLoc + currentPatchLoc,
      },
      delta: {
        patchPhysicalLoc: currentPatchLoc - historicalPatchLoc,
        combinedPhysicalLoc: currentPlanLoc + currentPatchLoc - historicalPlanLoc - historicalPatchLoc,
      },
      totalAdapterEffortReduced: false,
      conclusion: "The executable review patch is 14 physical LOC smaller, but the plan plus patch is 8 physical LOC larger; this stage does not establish lower total adaptation effort.",
    },
    closureNormalization: {
      sourceAuthority: "original-byte-digest",
      derivedSkillView: "valid UTF-8 with CRLF changed to LF only",
      bomPreserved: true,
      loneCarriageReturnPreserved: true,
      terminalNewlinePreserved: true,
      invalidUtf8: "rejected",
    },
    accounting: {
      paidModelCalls: 0,
      apiCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      scorerAccesses: 0,
    },
    claimBoundary: {
      crossFieldCounts: "not-implemented",
      semanticParity: "not-established",
      automaticEligibility: "not-established",
      readinessChanged: false,
      statement: "This zero-paid qualification establishes real-workdir execution and two-case reuse for exactly two collection primitives. It does not establish automatic plan generation, full semantic parity, machine-checked product quality, or readiness promotion.",
    },
  });
  if (options.reportPath) await writeJsonAtomic(resolve(options.reportPath), report);
  return report;
}

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rootDir = resolve(flag(args, "root") ?? process.cwd());
  const runRoot = flag(args, "run-root");
  const reportPath = flag(args, "report");
  if (!runRoot || !reportPath) throw new Error("collection qualification requires --run-root and --report");
  const report = await runVerifiedArtifactCollectionQualification({
    rootDir,
    runRoot: resolve(rootDir, runRoot),
    reportPath: resolve(rootDir, reportPath),
  });
  process.stdout.write(`${JSON.stringify({ status: report.status, reuse: report.reuse, accounting: report.accounting }, null, 2)}\n`);
}
