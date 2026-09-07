import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  SafeRelativePathSchema,
  Sha256Schema,
  parseSafeRelativePath,
} from "../benchmarks/skill-ir/artifact-package";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";
import {
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
  ApiTesterProductionBindingSchemaV2,
  ApiTesterProductionContractSchemaV2,
  buildApiTesterProductionContractV2,
  parseApiTesterProductionDocumentV2,
  type ApiTesterProductionBindingV2,
  type ApiTesterProductionContractV2,
} from "./api-tester-production-contract-v2";
import {
  API_TESTER_PRODUCTION_PROGRAM_VERSION_V2,
  ApiTesterProductionValidationReportSchemaV2,
  buildApiTesterProductionCheckerSourceV2,
  buildApiTesterProductionGeneratorSourceV2,
  type ApiTesterProductionValidationReportV2,
} from "./api-tester-production-programs-v2";

export const API_TESTER_PRODUCTION_IDENTITY_V2 =
  "skill-ir-api-tester-production-binding-successor-development-001" as const;
export const API_TESTER_PRODUCTION_PACKAGE_MANIFEST_SCHEMA_VERSION_V2 =
  "skill-ir-api-tester-production-package-manifest/v2" as const;
export const API_TESTER_PRODUCTION_PACKAGE_PROVENANCE_SCHEMA_VERSION_V2 =
  "skill-ir-api-tester-production-package-provenance/v2" as const;
export const API_TESTER_PRODUCTION_RUN_REPORT_SCHEMA_VERSION_V2 =
  "skill-ir-api-tester-production-run-report/v2" as const;

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const ProtectedInputSchema = z.object({
  path: SafeRelativePathSchema,
  format: z.enum(["json", "yaml"]),
  sha256: Sha256Schema,
}).strict();

export const ApiTesterProductionPackageManifestSchemaV2 = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_PACKAGE_MANIFEST_SCHEMA_VERSION_V2),
  identity: z.literal(API_TESTER_PRODUCTION_IDENTITY_V2),
  bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  binding: DigestRefSchema,
  publicContract: DigestRefSchema,
  provenance: DigestRefSchema,
  validationPolicy: DigestRefSchema,
  programs: z.object({
    generator: DigestRefSchema,
    checker: DigestRefSchema,
  }).strict(),
  protectedInput: ProtectedInputSchema,
  generatedOutputs: z.tuple([SafeRelativePathSchema, SafeRelativePathSchema]),
  resourcePolicy: z.object({
    network: z.literal(false),
    packageInstall: z.literal(false),
    shell: z.literal(false),
    allowedRuntime: z.literal("node"),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const packagePaths = [
    manifest.binding.path,
    manifest.publicContract.path,
    manifest.provenance.path,
    manifest.validationPolicy.path,
    manifest.programs.generator.path,
    manifest.programs.checker.path,
  ];
  if (new Set(packagePaths).size !== packagePaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production v2 package paths must be unique" });
  }
  if (manifest.programs.generator.sha256 === manifest.programs.checker.sha256) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production v2 generator and checker must be distinct" });
  }
  if (new Set(manifest.generatedOutputs).size !== manifest.generatedOutputs.length
    || manifest.generatedOutputs.includes(manifest.protectedInput.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production v2 input/output paths must be distinct" });
  }
});

export type ApiTesterProductionPackageManifestV2 = z.infer<
  typeof ApiTesterProductionPackageManifestSchemaV2
>;

export const ApiTesterProductionPackageProvenanceSchemaV2 = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_PACKAGE_PROVENANCE_SCHEMA_VERSION_V2),
  identity: z.literal(API_TESTER_PRODUCTION_IDENTITY_V2),
  bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  construction: z.literal("ordinary-input-output-parameters"),
  bindingSha256: Sha256Schema,
  input: ProtectedInputSchema,
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  programVersion: z.literal(API_TESTER_PRODUCTION_PROGRAM_VERSION_V2),
  checkerIndependence: z.object({
    separateEntrypoint: z.literal(true),
    importsGenerator: z.literal(false),
    comparesGoldPlanBytes: z.literal(false),
  }).strict(),
  forbiddenEvidenceClasses: z.tuple([
    z.literal("task-prompt"),
    z.literal("task-fixture-registry"),
    z.literal("evaluator-payload"),
    z.literal("held-out"),
    z.literal("runtime-output"),
    z.literal("profile-feedback"),
    z.literal("secret-value"),
  ]),
}).strict();

export type ApiTesterProductionPackageProvenanceV2 = z.infer<
  typeof ApiTesterProductionPackageProvenanceSchemaV2
>;

const OutputEvidenceSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ApiTesterProductionRunReportSchemaV2 = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_RUN_REPORT_SCHEMA_VERSION_V2),
  status: z.literal("passed"),
  identity: z.literal(API_TESTER_PRODUCTION_IDENTITY_V2),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  binding: z.object({
    bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
    sha256: Sha256Schema,
    inputPath: SafeRelativePathSchema,
    inputFormat: z.enum(["json", "yaml"]),
    inputSha256: Sha256Schema,
  }).strict(),
  package: z.object({
    path: z.literal("artifact"),
    manifestSha256: Sha256Schema,
    generator: DigestRefSchema,
    checker: DigestRefSchema,
  }).strict(),
  outputs: z.object({
    plan: OutputEvidenceSchema,
    report: OutputEvidenceSchema,
    validationReport: OutputEvidenceSchema,
  }).strict(),
  validation: ApiTesterProductionValidationReportSchemaV2,
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export type ApiTesterProductionRunReportV2 = z.infer<typeof ApiTesterProductionRunReportSchemaV2>;

export type ApiTesterProductionPackageV2 = {
  packageDir: string;
  manifest: ApiTesterProductionPackageManifestV2;
  provenance: ApiTesterProductionPackageProvenanceV2;
  binding: ApiTesterProductionBindingV2;
  contract: ApiTesterProductionContractV2;
};

export type PreparedApiTesterProductionArtifactV2 = ApiTesterProductionPackageV2 & {
  outDir: string;
  workDir: string;
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const result = relative(resolve(parent), resolve(candidate));
  return result === "" || (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result));
}

function contained(rootDir: string, candidate: string, label: string): { absolute: string; relative: string } {
  const root = resolve(rootDir);
  const absolute = resolve(isAbsolute(candidate) ? candidate : join(root, candidate));
  if (!pathIsWithin(root, absolute)) throw new Error(`${label} escapes its root: ${candidate}`);
  const local = portable(relative(root, absolute));
  if (!local) throw new Error(`${label} must identify a file below its root`);
  return { absolute, relative: parseSafeRelativePath(local) };
}

async function assertDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
}

async function assertNoSymlinkTraversal(
  rootDir: string,
  relativePath: string,
  options: { requireFile: boolean },
): Promise<void> {
  await assertDirectory(resolve(rootDir), "path root");
  const parts = parseSafeRelativePath(relativePath).split("/");
  let current = resolve(rootDir);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${relativePath}`);
      if (index < parts.length - 1 && !stat.isDirectory()) {
        throw new Error(`path parent must be a directory: ${relativePath}`);
      }
      if (index === parts.length - 1 && options.requireFile && !stat.isFile()) {
        throw new Error(`path must be a regular file: ${relativePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !options.requireFile) return;
      throw error;
    }
  }
}

async function ensureEmptyDirectory(directory: string, label: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await assertDirectory(directory, label);
  if ((await readdir(directory)).length > 0) throw new Error(`${label} must be empty: ${directory}`);
}

async function assertOutputAbsent(workDir: string, relativePath: string): Promise<void> {
  await assertNoSymlinkTraversal(workDir, relativePath, { requireFile: false });
  try {
    await lstat(join(workDir, relativePath));
    throw new Error(`production output already exists: ${relativePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function digestRef(
  packageDir: string,
  path: string,
  bytes: Uint8Array | string,
): Promise<{ path: string; sha256: string }> {
  const safe = parseSafeRelativePath(path);
  const content = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  const target = join(packageDir, safe);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, content);
  return { path: safe, sha256: sha256Bytes(content) };
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const path = current ? `${current}/${entry.name}` : entry.name;
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`Production v2 package contains a symbolic link: ${path}`);
    if (stat.isDirectory()) files.push(...await listFiles(root, path));
    else if (stat.isFile()) files.push(path);
    else throw new Error(`Production v2 package contains unsupported entry: ${path}`);
  }
  return files.sort();
}

async function verifyRef(packageDir: string, ref: { path: string; sha256: string }): Promise<Uint8Array> {
  const bytes = await readFile(join(packageDir, parseSafeRelativePath(ref.path)));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`Production v2 package digest mismatch for ${ref.path}`);
  return bytes;
}

async function compilePackageV2(input: {
  packageDir: string;
  binding: ApiTesterProductionBindingV2;
  contract: ApiTesterProductionContractV2;
  inputSha256: string;
}): Promise<ApiTesterProductionPackageV2> {
  await mkdir(input.packageDir, { recursive: true });
  const bindingBytes = jsonText(input.binding);
  const contractBytes = jsonText(input.contract);
  const generatorBytes = buildApiTesterProductionGeneratorSourceV2();
  const checkerBytes = buildApiTesterProductionCheckerSourceV2();
  const validationPolicyBytes = jsonText({
    schemaVersion: "skill-ir-api-tester-production-validation-policy/v2",
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    checks: [
      "input-grounding",
      "artifact-shape",
      "operation-coverage",
      "array-encoding",
      "schema-derived-cases",
      "security-response",
      "independence-verification",
      "report-grounding",
    ],
    checker: "independent-public-contract-v2",
    comparesGoldPlanBytes: false,
  });
  const [binding, publicContract, generator, checker, validationPolicy] = await Promise.all([
    digestRef(input.packageDir, "binding.json", bindingBytes),
    digestRef(input.packageDir, "public-contract.json", contractBytes),
    digestRef(input.packageDir, "artifacts/scripts/api-test-generate.mjs", generatorBytes),
    digestRef(input.packageDir, "artifacts/checks/api-test-check.mjs", checkerBytes),
    digestRef(input.packageDir, "validation-policy.json", validationPolicyBytes),
  ]);
  const provenanceValue = ApiTesterProductionPackageProvenanceSchemaV2.parse({
    schemaVersion: API_TESTER_PRODUCTION_PACKAGE_PROVENANCE_SCHEMA_VERSION_V2,
    identity: API_TESTER_PRODUCTION_IDENTITY_V2,
    bindingId: input.binding.bindingId,
    construction: "ordinary-input-output-parameters",
    bindingSha256: binding.sha256,
    input: { ...input.binding.input, sha256: input.inputSha256 },
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    programVersion: API_TESTER_PRODUCTION_PROGRAM_VERSION_V2,
    checkerIndependence: {
      separateEntrypoint: true,
      importsGenerator: false,
      comparesGoldPlanBytes: false,
    },
    forbiddenEvidenceClasses: [
      "task-prompt",
      "task-fixture-registry",
      "evaluator-payload",
      "held-out",
      "runtime-output",
      "profile-feedback",
      "secret-value",
    ],
  });
  const provenance = await digestRef(
    input.packageDir,
    "package-provenance.json",
    jsonText(provenanceValue),
  );
  const manifest = ApiTesterProductionPackageManifestSchemaV2.parse({
    schemaVersion: API_TESTER_PRODUCTION_PACKAGE_MANIFEST_SCHEMA_VERSION_V2,
    identity: API_TESTER_PRODUCTION_IDENTITY_V2,
    bindingId: input.binding.bindingId,
    binding,
    publicContract,
    provenance,
    validationPolicy,
    programs: { generator, checker },
    protectedInput: { ...input.binding.input, sha256: input.inputSha256 },
    generatedOutputs: [input.binding.outputs.plan, input.binding.outputs.report],
    resourcePolicy: { network: false, packageInstall: false, shell: false, allowedRuntime: "node" },
  });
  await writeFile(join(input.packageDir, "package-manifest.json"), jsonText(manifest), "utf8");
  return validateApiTesterProductionArtifactV2(input.packageDir);
}

export async function validateApiTesterProductionArtifactV2(
  packageDir: string,
): Promise<ApiTesterProductionPackageV2> {
  const root = resolve(packageDir);
  await assertDirectory(root, "API Tester production v2 package");
  const manifest = ApiTesterProductionPackageManifestSchemaV2.parse(
    await readJson(join(root, "package-manifest.json")),
  );
  const refs = [
    manifest.binding,
    manifest.publicContract,
    manifest.provenance,
    manifest.validationPolicy,
    manifest.programs.generator,
    manifest.programs.checker,
  ];
  const [bindingBytes, contractBytes, provenanceBytes] = await Promise.all([
    verifyRef(root, manifest.binding),
    verifyRef(root, manifest.publicContract),
    verifyRef(root, manifest.provenance),
    ...refs.slice(3).map((ref) => verifyRef(root, ref)),
  ]);
  const binding = ApiTesterProductionBindingSchemaV2.parse(JSON.parse(Buffer.from(bindingBytes).toString("utf8")));
  const contract = ApiTesterProductionContractSchemaV2.parse(JSON.parse(Buffer.from(contractBytes).toString("utf8")));
  const provenance = ApiTesterProductionPackageProvenanceSchemaV2.parse(
    JSON.parse(Buffer.from(provenanceBytes).toString("utf8")),
  );
  if (manifest.bindingId !== binding.bindingId || provenance.bindingId !== binding.bindingId
    || provenance.bindingSha256 !== manifest.binding.sha256
    || manifest.protectedInput.path !== binding.input.path
    || manifest.protectedInput.format !== binding.input.format
    || provenance.input.sha256 !== manifest.protectedInput.sha256
    || JSON.stringify(manifest.generatedOutputs) !== JSON.stringify([binding.outputs.plan, binding.outputs.report])
    || contract.supportContractId !== provenance.supportContractId) {
    throw new Error("Production v2 package identity or binding mismatch");
  }
  const declared = new Set(["package-manifest.json", ...refs.map((ref) => ref.path)]);
  const actual = await listFiles(root);
  const missing = [...declared].filter((path) => !actual.includes(path));
  const extra = actual.filter((path) => !declared.has(path));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Production v2 package closure mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`);
  }
  return { packageDir: root, manifest, provenance, binding, contract };
}

export async function prepareApiTesterProductionArtifactV2(options: {
  rootDir: string;
  bindingPath: string;
  workDir: string;
  outDir: string;
}): Promise<PreparedApiTesterProductionArtifactV2> {
  const rootDir = resolve(options.rootDir);
  const workDir = resolve(options.workDir);
  const outDir = resolve(options.outDir);
  await Promise.all([
    assertDirectory(rootDir, "production v2 root"),
    assertDirectory(workDir, "production v2 workdir"),
  ]);
  if (pathIsWithin(workDir, outDir) || pathIsWithin(outDir, workDir)) {
    throw new Error("production v2 workdir and output directory must not overlap");
  }
  const bindingLocation = contained(rootDir, options.bindingPath, "production v2 binding");
  await assertNoSymlinkTraversal(rootDir, bindingLocation.relative, { requireFile: true });
  const bindingBytes = await readFile(bindingLocation.absolute);
  const binding = ApiTesterProductionBindingSchemaV2.parse(JSON.parse(bindingBytes.toString("utf8")));
  await assertNoSymlinkTraversal(workDir, binding.input.path, { requireFile: true });
  await Promise.all([
    assertOutputAbsent(workDir, binding.outputs.plan),
    assertOutputAbsent(workDir, binding.outputs.report),
  ]);
  await ensureEmptyDirectory(outDir, "production v2 output directory");
  const inputBytes = await readFile(join(workDir, binding.input.path));
  const inputSha256 = sha256Bytes(inputBytes);
  const contract = buildApiTesterProductionContractV2(parseApiTesterProductionDocumentV2(
    inputBytes.toString("utf8"),
    binding.input.format,
  ));
  const packageDir = join(outDir, "artifact");
  const compiled = await compilePackageV2({ packageDir, binding, contract, inputSha256 });
  return { ...compiled, outDir, workDir };
}

async function runProgram(input: {
  nodeExecutable: string;
  program: string;
  args: string[];
  cwd: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([input.nodeExecutable, input.program, ...input.args], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), 30_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeApiTesterProductionArtifactV2(options: {
  packageDir: string;
  workDir: string;
  outDir: string;
  nodeExecutable: string;
}): Promise<ApiTesterProductionRunReportV2> {
  const artifact = await validateApiTesterProductionArtifactV2(options.packageDir);
  const workDir = resolve(options.workDir);
  const outDir = resolve(options.outDir);
  await assertDirectory(workDir, "production v2 workdir");
  if (resolve(artifact.packageDir, "..") !== outDir) {
    throw new Error("Production v2 package/output directory mismatch");
  }
  await assertNoSymlinkTraversal(workDir, artifact.binding.input.path, { requireFile: true });
  await Promise.all([
    assertOutputAbsent(workDir, artifact.binding.outputs.plan),
    assertOutputAbsent(workDir, artifact.binding.outputs.report),
  ]);
  const inputPath = join(workDir, artifact.binding.input.path);
  const beforeInput = await readFile(inputPath);
  if (sha256Bytes(beforeInput) !== artifact.manifest.protectedInput.sha256) {
    throw new Error("Production v2 protected input digest mismatch before execution");
  }
  const commonArgs = [
    "--binding", join(artifact.packageDir, artifact.manifest.binding.path),
    "--contract", join(artifact.packageDir, artifact.manifest.publicContract.path),
    "--workdir", workDir,
    "--input-sha256", artifact.manifest.protectedInput.sha256,
  ];
  const generation = await runProgram({
    nodeExecutable: options.nodeExecutable,
    program: join(artifact.packageDir, artifact.manifest.programs.generator.path),
    args: commonArgs,
    cwd: workDir,
  });
  if (generation.exitCode !== 0 || generation.stderr.trim() || generation.stdout.trim()) {
    throw new Error(`API Tester production v2 generator failed (${generation.exitCode}): ${generation.stderr.trim() || generation.stdout.trim()}`);
  }
  const checked = await runProgram({
    nodeExecutable: options.nodeExecutable,
    program: join(artifact.packageDir, artifact.manifest.programs.checker.path),
    args: commonArgs,
    cwd: workDir,
  });
  let validation: ApiTesterProductionValidationReportV2;
  try {
    validation = ApiTesterProductionValidationReportSchemaV2.parse(JSON.parse(checked.stdout));
  } catch (error) {
    throw new Error(`API Tester production v2 checker returned invalid evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
  const validationText = jsonText(validation);
  const validationPath = join(outDir, "validation-report.json");
  await writeFile(validationPath, validationText, { encoding: "utf8", flag: "wx" });
  const afterInput = await readFile(inputPath);
  if (sha256Bytes(afterInput) !== artifact.manifest.protectedInput.sha256) {
    throw new Error("Production v2 protected input digest mismatch after execution");
  }
  if (checked.exitCode !== 0 || checked.stderr.trim() || validation.status !== "pass") {
    throw new Error(`API Tester production v2 checker failed (${checked.exitCode}): ${validation.errors.join(", ") || checked.stderr.trim()}`);
  }
  const [planBytes, reportBytes, manifestBytes] = await Promise.all([
    readFile(join(workDir, artifact.binding.outputs.plan)),
    readFile(join(workDir, artifact.binding.outputs.report)),
    readFile(join(artifact.packageDir, "package-manifest.json")),
  ]);
  return ApiTesterProductionRunReportSchemaV2.parse({
    schemaVersion: API_TESTER_PRODUCTION_RUN_REPORT_SCHEMA_VERSION_V2,
    status: "passed",
    identity: API_TESTER_PRODUCTION_IDENTITY_V2,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    binding: {
      bindingId: artifact.binding.bindingId,
      sha256: artifact.manifest.binding.sha256,
      inputPath: artifact.binding.input.path,
      inputFormat: artifact.binding.input.format,
      inputSha256: artifact.manifest.protectedInput.sha256,
    },
    package: {
      path: "artifact",
      manifestSha256: sha256Bytes(manifestBytes),
      generator: artifact.manifest.programs.generator,
      checker: artifact.manifest.programs.checker,
    },
    outputs: {
      plan: { path: artifact.binding.outputs.plan, sha256: sha256Bytes(planBytes) },
      report: { path: artifact.binding.outputs.report, sha256: sha256Bytes(reportBytes) },
      validationReport: { path: "validation-report.json", sha256: sha256Bytes(Buffer.from(validationText, "utf8")) },
    },
    validation,
    accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
    claimBoundary: "This development-only v2 binding proves deterministic construction and independent public-contract checking for bounded local refs and primitive arrays within api-tester-openapi-subset-v2. It does not prove arbitrary OpenAPI, held-out behavior, human savings, readiness, cross-profile transfer, or an optimized LLM.",
  });
}

export async function runApiTesterProductionArtifactV2(options: {
  rootDir: string;
  bindingPath: string;
  workDir: string;
  outDir: string;
  nodeExecutable: string;
}): Promise<ApiTesterProductionRunReportV2> {
  const prepared = await prepareApiTesterProductionArtifactV2(options);
  return executeApiTesterProductionArtifactV2({
    packageDir: prepared.packageDir,
    workDir: prepared.workDir,
    outDir: prepared.outDir,
    nodeExecutable: options.nodeExecutable,
  });
}
