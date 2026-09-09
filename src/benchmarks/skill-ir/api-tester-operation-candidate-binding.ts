import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema, parseSafeRelativePath } from "./artifact-package";

export const API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY =
  "skill-ir-api-tester-operation-candidate-binding-002" as const;
export const API_TESTER_OPERATION_CANDIDATE_BINDING_PATH =
  "benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json" as const;
export const API_TESTER_OPERATION_CANDIDATE_BINDING_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-candidate-binding/v1" as const;
export const API_TESTER_OPERATION_EXPERIMENT_VERIFIER_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-experiment-verifier/v1" as const;

const SUPPORT_CONTRACT_ID = "api-tester-openapi-subset-v2" as const;
const PARENT_CANDIDATE_PATH =
  "benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json" as const;
const PRODUCTION_ENTRY = "src/skill-ir/api-tester-operation-input-run.ts" as const;
const REQUIRED_ADDED_RUNTIME_PATHS = [
  "src/benchmarks/skill-ir/source-fixture.ts",
  "src/skill-ir/api-tester-production-contract.ts",
] as const;
const OUTER_VERIFIER_PATHS = [
  "src/benchmarks/skill-ir/api-tester-operation-candidate-binding-run.ts",
  "src/benchmarks/skill-ir/api-tester-operation-candidate-binding.ts",
] as const;

const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();
const RuntimeModuleSchema = DigestRefSchema.extend({ isEntry: z.boolean() }).strict();
const ImportEdgeSchema = z.object({ importer: SafeRelativePathSchema, path: SafeRelativePathSchema }).strict();
const UnresolvedImportSchema = z.object({
  importer: SafeRelativePathSchema,
  specifier: z.string(),
  reason: z.enum(["dynamic-non-literal", "relative-target-missing", "unsupported-import-form"]),
}).strict();

const LocalRuntimeImportAuditBaseSchema = z.object({
  rootEntries: z.array(SafeRelativePathSchema).min(1),
  localRuntimeModules: z.array(RuntimeModuleSchema).min(1),
  runtimeLocalImports: z.array(ImportEdgeSchema),
  typeOnlyLocalImports: z.array(ImportEdgeSchema),
  builtinModules: z.array(z.string().min(1)),
  thirdPartyPackages: z.array(z.string().min(1)),
  unresolvedImports: z.array(UnresolvedImportSchema),
}).strict();

function refineLocalRuntimeImportAudit(
  audit: z.infer<typeof LocalRuntimeImportAuditBaseSchema>,
  context: z.RefinementCtx,
): void {
  const sortedUnique = (values: string[]) =>
    new Set(values).size === values.length && JSON.stringify(values) === JSON.stringify([...values].sort(compareText));
  const modulePaths = audit.localRuntimeModules.map((module) => module.path);
  if (!sortedUnique(modulePaths)) {
    context.addIssue({ code: "custom", path: ["localRuntimeModules"], message: "runtime module paths must be unique and sorted" });
  }
  if (!sortedUnique(audit.rootEntries) || !sortedUnique(audit.builtinModules) || !sortedUnique(audit.thirdPartyPackages)) {
    context.addIssue({ code: "custom", path: [], message: "runtime import audit sets must be unique and sorted" });
  }
  const edgeKey = (edge: z.infer<typeof ImportEdgeSchema>) => `${edge.importer}\0${edge.path}`;
  for (const [key, edges] of [["runtimeLocalImports", audit.runtimeLocalImports], ["typeOnlyLocalImports", audit.typeOnlyLocalImports]] as const) {
    const keys = edges.map(edgeKey);
    if (!sortedUnique(keys)) context.addIssue({ code: "custom", path: [key], message: `${key} must be unique and sorted` });
  }
  for (const root of audit.rootEntries) {
    if (!audit.localRuntimeModules.some((module) => module.path === root && module.isEntry)) {
      context.addIssue({ code: "custom", path: ["rootEntries"], message: `runtime root is not marked as an entry: ${root}` });
    }
  }
}

export const LocalRuntimeImportAuditSchema = LocalRuntimeImportAuditBaseSchema.superRefine(refineLocalRuntimeImportAudit);

export type LocalRuntimeImportAudit = z.infer<typeof LocalRuntimeImportAuditSchema>;

const ParentCandidateSchema = z.object({
  identity: z.literal("skill-ir-api-tester-operation-candidate-001"),
  supportContractId: z.literal(SUPPORT_CONTRACT_ID),
  implementation: z.array(z.object({
    role: z.string().min(1),
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  }).strict()).min(1),
  prospective: z.object({
    inputSelection: z.literal("not-started"),
    predictions: z.literal("not-authored"),
    prospectiveRuns: z.literal(0),
    rows: z.tuple([]),
    rowPredictions: z.tuple([]),
  }).passthrough(),
}).passthrough();

export const ApiTesterOperationCandidateBindingSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_CANDIDATE_BINDING_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY),
  frozenAt: z.string().datetime(),
  executionCommit: z.string().regex(/^[0-9a-f]{40}$/u),
  supportContractId: z.literal(SUPPORT_CONTRACT_ID),
  entry: z.object({
    cli: z.literal(PRODUCTION_ENTRY),
    library: z.literal("src/skill-ir/api-tester-operation-input.ts"),
    invocation: z.literal("--root=<input-root> --manifest=<manifest.json> --node=<node>"),
    manifestSchemaVersion: z.literal("skill-ir-api-tester-operation-input-manifest/v1"),
    outputVerifier: z.literal("verifyApiTesterOperationInputOutput"),
  }).strict(),
  parentCandidate: DigestRefSchema.extend({
    path: z.literal(PARENT_CANDIDATE_PATH),
    identity: z.literal("skill-ir-api-tester-operation-candidate-001"),
  }).strict(),
  preservedParentImplementation: z.array(z.object({
    role: z.string().min(1),
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  }).strict()).min(1),
  productionDependencies: LocalRuntimeImportAuditBaseSchema.extend({
    package: DigestRefSchema,
    lock: DigestRefSchema,
  }).strict().superRefine(refineLocalRuntimeImportAudit),
  addedRuntimeDependencies: z.array(DigestRefSchema).min(REQUIRED_ADDED_RUNTIME_PATHS.length),
  outerVerifier: z.object({
    schemaVersion: z.literal(API_TESTER_OPERATION_EXPERIMENT_VERIFIER_SCHEMA_VERSION),
    implementation: z.array(DigestRefSchema).length(OUTER_VERIFIER_PATHS.length),
  }).strict(),
  runtime: z.object({
    bun: z.string().regex(/^\d+\.\d+\.\d+$/u),
    node: z.string().regex(/^v\d+\.\d+\.\d+$/u),
  }).strict(),
  changes: z.object({
    supportContract: z.literal(false),
    operationAlgorithm: z.literal(false),
    candidate001: z.literal(false),
    dependencyBindingOnly: z.literal(true),
  }).strict(),
  prospective: z.object({
    inputSelection: z.literal("not-started"),
    predictions: z.literal("not-authored"),
    prospectiveRuns: z.literal(0),
    rows: z.tuple([]),
    rowPredictions: z.tuple([]),
  }).strict(),
  accounting: z.object({
    runtime: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
}).strict().superRefine((binding, context) => {
  if (binding.productionDependencies.unresolvedImports.length > 0) {
    context.addIssue({ code: "custom", path: ["productionDependencies", "unresolvedImports"], message: "candidate runtime imports must all resolve" });
  }
  const runtimeByPath = new Map(binding.productionDependencies.localRuntimeModules.map((module) => [module.path, module]));
  for (const parent of binding.preservedParentImplementation) {
    const runtime = runtimeByPath.get(parent.path);
    if (!runtime || runtime.sha256 !== parent.sha256) {
      context.addIssue({ code: "custom", path: ["preservedParentImplementation"], message: `parent implementation is not preserved: ${parent.path}` });
    }
  }
  const parentPaths = new Set(binding.preservedParentImplementation.map((file) => file.path));
  const expectedAdded = binding.productionDependencies.localRuntimeModules
    .filter((module) => !parentPaths.has(module.path))
    .map(({ path, sha256 }) => ({ path, sha256 }));
  if (canonical(expectedAdded) !== canonical(binding.addedRuntimeDependencies)) {
    context.addIssue({ code: "custom", path: ["addedRuntimeDependencies"], message: "runtime closure mismatch: added runtime dependency set drifted" });
  }
  for (const required of REQUIRED_ADDED_RUNTIME_PATHS) {
    if (!binding.addedRuntimeDependencies.some((dependency) => dependency.path === required)) {
      context.addIssue({ code: "custom", path: ["addedRuntimeDependencies"], message: `runtime closure mismatch: required runtime dependency missing: ${required}` });
    }
  }
  if (JSON.stringify(binding.outerVerifier.implementation.map((file) => file.path)) !== JSON.stringify(OUTER_VERIFIER_PATHS)) {
    context.addIssue({ code: "custom", path: ["outerVerifier", "implementation"], message: "outer verifier implementation order drifted" });
  }
});

export type ApiTesterOperationCandidateBinding = z.infer<typeof ApiTesterOperationCandidateBindingSchema>;

type ImportReference = {
  specifier: string | null;
  typeOnly: boolean;
  reason: "dynamic-non-literal" | "unsupported-import-form" | null;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function pathWithin(parent: string, candidate: string): boolean {
  const local = relative(resolve(parent), resolve(candidate));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(rootDir: string, path: string, label: string): string {
  const safe = parseSafeRelativePath(portable(path));
  const root = resolve(rootDir);
  const absolute = resolve(root, safe);
  if (!pathWithin(root, absolute) || absolute === root) throw new Error(`${label} escapes repository root: ${safe}`);
  return absolute;
}

async function regularFile(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function resolveLocalImport(rootDir: string, importer: string, specifier: string): Promise<string | null> {
  const importerAbsolute = contained(rootDir, importer, "runtime importer");
  const raw = resolve(dirname(importerAbsolute), specifier);
  if (!pathWithin(rootDir, raw) || resolve(rootDir) === raw) return null;
  const candidates = new Set<string>([raw]);
  if (!extname(raw)) {
    for (const suffix of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]) candidates.add(`${raw}${suffix}`);
    for (const name of ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs"]) candidates.add(join(raw, name));
  } else if ([".js", ".mjs", ".cjs"].includes(extname(raw))) {
    candidates.add(raw.slice(0, -extname(raw).length) + ".ts");
    candidates.add(raw.slice(0, -extname(raw).length) + ".tsx");
  }
  for (const candidate of candidates) {
    if (await regularFile(candidate)) return parseSafeRelativePath(portable(relative(resolve(rootDir), candidate)));
  }
  return null;
}

function modulePackage(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0] ?? specifier;
}

function importReferences(sourceText: string, path: string): ImportReference[] {
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const references: ImportReference[] = [];
  const addLiteral = (node: ts.Expression | undefined, typeOnly: boolean) => {
    if (node && ts.isStringLiteralLike(node)) references.push({ specifier: node.text, typeOnly, reason: null });
    else references.push({ specifier: null, typeOnly, reason: "dynamic-non-literal" });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const namedOnly = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        && !clause.name && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly);
      addLiteral(node.moduleSpecifier, Boolean(clause?.isTypeOnly || namedOnly));
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const namedOnly = node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0
        && node.exportClause.elements.every((element) => element.isTypeOnly);
      addLiteral(node.moduleSpecifier, Boolean(node.isTypeOnly || namedOnly));
      return;
    }
    if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) addLiteral(node.moduleReference.expression, false);
      else references.push({ specifier: null, typeOnly: false, reason: "unsupported-import-form" });
      return;
    }
    if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      addLiteral(node.arguments[0], false);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function uniqueSorted<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()]
    .sort((left, right) => compareText(key(left), key(right)));
}

export async function auditLocalRuntimeImports(options: {
  rootDir: string;
  entryPaths: string[];
}): Promise<LocalRuntimeImportAudit> {
  const rootDir = resolve(options.rootDir);
  const rootEntries = uniqueSorted(options.entryPaths.map((path) => parseSafeRelativePath(portable(path))), (value) => value);
  const rootSet = new Set(rootEntries);
  const pending = [...rootEntries];
  const visited = new Set<string>();
  const localRuntimeModules: z.infer<typeof RuntimeModuleSchema>[] = [];
  const runtimeLocalImports: z.infer<typeof ImportEdgeSchema>[] = [];
  const typeOnlyLocalImports: z.infer<typeof ImportEdgeSchema>[] = [];
  const builtins: string[] = [];
  const thirdParties: string[] = [];
  const unresolvedImports: z.infer<typeof UnresolvedImportSchema>[] = [];
  const builtinSet = new Set(builtinModules.flatMap((module) => [module, `node:${module}`]));

  while (pending.length > 0) {
    const importer = pending.shift()!;
    if (visited.has(importer)) continue;
    visited.add(importer);
    const importerAbsolute = contained(rootDir, importer, "runtime module");
    if (!await regularFile(importerAbsolute)) throw new Error(`runtime module is missing or not a regular file: ${importer}`);
    const bytes = await readFile(importerAbsolute);
    localRuntimeModules.push({ path: importer, sha256: sha256(bytes), isEntry: rootSet.has(importer) });
    for (const reference of importReferences(bytes.toString("utf8"), importer)) {
      if (reference.reason || reference.specifier === null) {
        unresolvedImports.push({ importer, specifier: reference.specifier ?? "<non-literal>", reason: reference.reason ?? "unsupported-import-form" });
        continue;
      }
      const specifier = reference.specifier;
      if (specifier.startsWith(".")) {
        const target = await resolveLocalImport(rootDir, importer, specifier);
        if (!target) {
          unresolvedImports.push({ importer, specifier, reason: "relative-target-missing" });
          continue;
        }
        const edge = { importer, path: target };
        if (reference.typeOnly) typeOnlyLocalImports.push(edge);
        else {
          runtimeLocalImports.push(edge);
          pending.push(target);
        }
      } else if (builtinSet.has(specifier)) {
        builtins.push(specifier);
      } else {
        thirdParties.push(modulePackage(specifier));
      }
    }
  }

  return LocalRuntimeImportAuditSchema.parse({
    rootEntries,
    localRuntimeModules: uniqueSorted(localRuntimeModules, (module) => module.path),
    runtimeLocalImports: uniqueSorted(runtimeLocalImports, (edge) => `${edge.importer}\0${edge.path}`),
    typeOnlyLocalImports: uniqueSorted(typeOnlyLocalImports, (edge) => `${edge.importer}\0${edge.path}`),
    builtinModules: uniqueSorted(builtins, (value) => value),
    thirdPartyPackages: uniqueSorted(thirdParties, (value) => value),
    unresolvedImports: uniqueSorted(unresolvedImports, (value) => `${value.importer}\0${value.specifier}\0${value.reason}`),
  });
}

export async function verifyLocalRuntimeImportAudit(options: {
  rootDir: string;
  audit: LocalRuntimeImportAudit;
}): Promise<{ status: "verified"; runtimeModules: number }> {
  const audit = LocalRuntimeImportAuditSchema.parse(options.audit);
  for (const module of audit.localRuntimeModules) {
    const path = contained(options.rootDir, module.path, "bound runtime dependency");
    if (!await regularFile(path) || sha256(await readFile(path)) !== module.sha256) {
      throw new Error(`runtime dependency digest mismatch: ${module.path}`);
    }
  }
  const live = await auditLocalRuntimeImports({ rootDir: options.rootDir, entryPaths: audit.rootEntries });
  if (canonical(live) !== canonical(audit)) throw new Error("runtime closure mismatch");
  return { status: "verified", runtimeModules: audit.localRuntimeModules.length };
}

async function digestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const safe = parseSafeRelativePath(path);
  const absolute = contained(rootDir, safe, "candidate binding file");
  if (!await regularFile(absolute)) throw new Error(`candidate binding file is missing or not regular: ${safe}`);
  return { path: safe, sha256: sha256(await readFile(absolute)) };
}

export async function buildApiTesterOperationCandidateBinding(options: {
  rootDir: string;
  frozenAt: string;
  executionCommit: string;
  bunVersion: string;
  nodeVersion: string;
}): Promise<ApiTesterOperationCandidateBinding> {
  const rootDir = resolve(options.rootDir);
  const parentBytes = await readFile(contained(rootDir, PARENT_CANDIDATE_PATH, "parent candidate"));
  const parent = ParentCandidateSchema.parse(JSON.parse(parentBytes.toString("utf8")));
  const audit = await auditLocalRuntimeImports({ rootDir, entryPaths: [PRODUCTION_ENTRY] });
  const runtimeByPath = new Map(audit.localRuntimeModules.map((module) => [module.path, module]));
  for (const implementation of parent.implementation) {
    const runtime = runtimeByPath.get(implementation.path);
    if (!runtime || runtime.sha256 !== implementation.sha256) {
      throw new Error(`candidate-001 implementation changed or is absent from runtime closure: ${implementation.path}`);
    }
  }
  const parentPaths = new Set(parent.implementation.map((file) => file.path));
  const addedRuntimeDependencies = audit.localRuntimeModules
    .filter((module) => !parentPaths.has(module.path))
    .map(({ path, sha256: digest }) => ({ path, sha256: digest }));

  return ApiTesterOperationCandidateBindingSchema.parse({
    schemaVersion: API_TESTER_OPERATION_CANDIDATE_BINDING_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY,
    frozenAt: options.frozenAt,
    executionCommit: options.executionCommit,
    supportContractId: SUPPORT_CONTRACT_ID,
    entry: {
      cli: PRODUCTION_ENTRY,
      library: "src/skill-ir/api-tester-operation-input.ts",
      invocation: "--root=<input-root> --manifest=<manifest.json> --node=<node>",
      manifestSchemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
      outputVerifier: "verifyApiTesterOperationInputOutput",
    },
    parentCandidate: {
      path: PARENT_CANDIDATE_PATH,
      sha256: sha256(parentBytes),
      identity: parent.identity,
    },
    preservedParentImplementation: parent.implementation,
    productionDependencies: {
      ...audit,
      package: await digestRef(rootDir, "package.json"),
      lock: await digestRef(rootDir, "bun.lock"),
    },
    addedRuntimeDependencies,
    outerVerifier: {
      schemaVersion: API_TESTER_OPERATION_EXPERIMENT_VERIFIER_SCHEMA_VERSION,
      implementation: await Promise.all(OUTER_VERIFIER_PATHS.map((path) => digestRef(rootDir, path))),
    },
    runtime: { bun: options.bunVersion, node: options.nodeVersion },
    changes: {
      supportContract: false,
      operationAlgorithm: false,
      candidate001: false,
      dependencyBindingOnly: true,
    },
    prospective: {
      inputSelection: "not-started",
      predictions: "not-authored",
      prospectiveRuns: 0,
      rows: [],
      rowPredictions: [],
    },
    accounting: {
      runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
  });
}

export async function verifyApiTesterOperationCandidateBindingAgainstLiveTree(options: {
  rootDir: string;
  binding: ApiTesterOperationCandidateBinding;
  bunVersion: string;
  nodeVersion: string;
}): Promise<{ status: "verified"; runtimeModules: number; addedRuntimeDependencies: number }> {
  const binding = ApiTesterOperationCandidateBindingSchema.parse(options.binding);
  if (binding.runtime.bun !== options.bunVersion || binding.runtime.node !== options.nodeVersion) {
    throw new Error("candidate binding runtime mismatch");
  }
  const { package: _package, lock: _lock, ...runtimeAudit } = binding.productionDependencies;
  await verifyLocalRuntimeImportAudit({ rootDir: options.rootDir, audit: runtimeAudit });
  const expected = await buildApiTesterOperationCandidateBinding({
    rootDir: options.rootDir,
    frozenAt: binding.frozenAt,
    executionCommit: binding.executionCommit,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
  });
  if (canonical(expected) !== canonical(binding)) throw new Error("candidate binding live closure mismatch");
  return {
    status: "verified",
    runtimeModules: binding.productionDependencies.localRuntimeModules.length,
    addedRuntimeDependencies: binding.addedRuntimeDependencies.length,
  };
}

function gitBytes(rootDir: string, gitExecutable: string, revision: string, path: string): Buffer {
  const safe = parseSafeRelativePath(path);
  const child = spawnSync(gitExecutable, [
    "-c", `safe.directory=${portable(resolve(rootDir))}`,
    "cat-file", "--filters", `--path=${safe}`, `${revision}:${safe}`,
  ], { cwd: rootDir, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  if (child.status !== 0 || !child.stdout) {
    throw new Error(`candidate execution commit file unavailable: ${safe}: ${child.stderr?.toString("utf8").trim() ?? "unknown"}`);
  }
  return child.stdout;
}

export async function verifyApiTesterOperationCandidateBindingExecutionCommit(options: {
  rootDir: string;
  binding: ApiTesterOperationCandidateBinding;
  gitExecutable: string;
}): Promise<{ status: "verified"; executionCommit: string; files: number }> {
  const binding = ApiTesterOperationCandidateBindingSchema.parse(options.binding);
  const refs = uniqueSorted([
    ...binding.productionDependencies.localRuntimeModules.map(({ path, sha256: digest }) => ({ path, sha256: digest })),
    binding.productionDependencies.package,
    binding.productionDependencies.lock,
    { path: binding.parentCandidate.path, sha256: binding.parentCandidate.sha256 },
    ...binding.outerVerifier.implementation,
  ], (reference) => reference.path);
  for (const reference of refs) {
    const commitSha256 = sha256(gitBytes(options.rootDir, options.gitExecutable, binding.executionCommit, reference.path));
    const workingSha256 = sha256(await readFile(contained(options.rootDir, reference.path, "candidate execution file")));
    if (commitSha256 !== reference.sha256 || workingSha256 !== reference.sha256) {
      throw new Error(`candidate execution commit digest mismatch: ${reference.path}`);
    }
  }
  return { status: "verified", executionCommit: binding.executionCommit, files: refs.length };
}

export async function verifyApiTesterOperationCandidateBinding(options: {
  rootDir: string;
  bindingPath: string;
  bunVersion: string;
  nodeVersion: string;
  gitExecutable: string;
}): Promise<{
  status: "verified";
  identity: typeof API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY;
  executionCommit: string;
  runtimeModules: number;
  addedRuntimeDependencies: number;
  prospectiveRuns: 0;
}> {
  const bytes = await readFile(contained(options.rootDir, options.bindingPath, "candidate binding"));
  const binding = ApiTesterOperationCandidateBindingSchema.parse(JSON.parse(bytes.toString("utf8")));
  const live = await verifyApiTesterOperationCandidateBindingAgainstLiveTree({
    rootDir: options.rootDir,
    binding,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
  });
  await verifyApiTesterOperationCandidateBindingExecutionCommit({
    rootDir: options.rootDir,
    binding,
    gitExecutable: options.gitExecutable,
  });
  return {
    status: "verified",
    identity: binding.identity,
    executionCommit: binding.executionCommit,
    runtimeModules: live.runtimeModules,
    addedRuntimeDependencies: live.addedRuntimeDependencies,
    prospectiveRuns: binding.prospective.prospectiveRuns,
  };
}
