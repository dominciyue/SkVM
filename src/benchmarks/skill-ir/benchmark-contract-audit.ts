import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { sha256Bytes } from "./source-fixture";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const SafeIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (isAbsolute(value) || value.includes("\\")) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".."
  );
}, "path must be a safe POSIX relative path");

const BoundFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: DigestSchema,
}).strict();

const TaskPromptEvidenceSchema = z.object({
  kind: z.literal("task-prompt"),
  taskIds: z.array(SafeIdSchema).min(1),
  quote: z.string().min(1),
}).strict();

const SkillSourceEvidenceSchema = z.object({
  kind: z.literal("skill-source"),
  path: SafeRelativePathSchema,
  quote: z.string().min(1),
}).strict();

const WorkdirFixtureEvidenceSchema = z.object({
  kind: z.literal("workdir-fixture"),
  taskIds: z.array(SafeIdSchema).min(1),
  relativePath: SafeRelativePathSchema,
  quote: z.string().min(1).optional(),
}).strict();

export const BenchmarkContractAuditManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-benchmark-contract-audit/v1"),
  auditId: SafeIdSchema,
  skillId: SafeIdSchema,
  tasks: BoundFileSchema,
  scorer: BoundFileSchema.extend({
    evaluatorId: SafeIdSchema,
  }).strict(),
  sources: z.array(BoundFileSchema),
  scope: z.object({
    split: z.literal("development"),
    taskIds: z.array(SafeIdSchema).min(1),
  }).strict(),
  criteria: z.array(z.object({
    id: SafeIdSchema,
    hardGate: z.boolean(),
    taskIds: z.array(SafeIdSchema).min(1),
    requirementIds: z.array(SafeIdSchema).min(1),
  }).strict()).min(1),
  requirements: z.array(z.object({
    id: SafeIdSchema,
    class: z.enum([
      "presence",
      "schema",
      "closed-enum",
      "deterministic-algorithm",
      "literal",
      "semantic-invariant",
    ]),
    equivalence: z.enum([
      "exact-public-contract",
      "semantic-equivalence",
      "safety-invariant",
    ]),
    criterionIds: z.array(SafeIdSchema).min(1),
    taskIds: z.array(SafeIdSchema).min(1).optional(),
    contractTokens: z.array(z.string().min(1)).min(1),
    scorerAnchors: z.array(z.object({
      quote: z.string().min(1),
    }).strict()).min(1),
    publicEvidence: z.array(z.discriminatedUnion("kind", [
      TaskPromptEvidenceSchema,
      SkillSourceEvidenceSchema,
      WorkdirFixtureEvidenceSchema,
    ])).min(1),
    canaryIds: z.array(SafeIdSchema),
  }).strict()).min(1),
  canaries: z.array(z.object({
    id: SafeIdSchema,
    taskId: SafeIdSchema,
    criterionId: SafeIdSchema,
    role: z.enum(["canonical-valid", "alternative-valid", "invalid-control"]),
    fixturePath: SafeRelativePathSchema,
    fixtureSha256: DigestSchema,
    expectedPass: z.boolean(),
  }).strict()),
}).strict().superRefine((manifest, context) => {
  const requireUnique = (
    values: readonly string[],
    path: Array<string | number>,
    label: string,
  ) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `${label} must be unique`,
      });
    }
  };
  requireUnique(manifest.scope.taskIds, ["scope", "taskIds"], "scope task IDs");
  requireUnique(manifest.criteria.map((criterion) => criterion.id), ["criteria"], "criterion IDs");
  manifest.criteria.forEach((criterion, index) => {
    requireUnique(
      criterion.taskIds,
      ["criteria", index, "taskIds"],
      `criterion ${criterion.id} task IDs`,
    );
  });
  requireUnique(
    manifest.requirements.map((requirement) => requirement.id),
    ["requirements"],
    "requirement IDs",
  );
  manifest.requirements.forEach((requirement, index) => {
    if (requirement.taskIds) {
      requireUnique(
        requirement.taskIds,
        ["requirements", index, "taskIds"],
        `requirement ${requirement.id} task IDs`,
      );
    }
  });
  requireUnique(manifest.canaries.map((canary) => canary.id), ["canaries"], "canary IDs");
  requireUnique(manifest.sources.map((source) => source.path), ["sources"], "source paths");

  manifest.canaries.forEach((canary, index) => {
    const validExpectedPass = canary.role === "invalid-control"
      ? canary.expectedPass === false
      : canary.expectedPass === true;
    if (!validExpectedPass) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canaries", index, "expectedPass"],
        message: `${canary.role} has a contradictory expectedPass`,
      });
    }
  });
});

export type BenchmarkContractAuditManifest = z.infer<
  typeof BenchmarkContractAuditManifestSchema
>;

export type BenchmarkContractAuditIssueCode =
  | "FILE_DIGEST_MISMATCH"
  | "TASK_SCOPE_DRIFT"
  | "CRITERION_REGISTRY_DRIFT"
  | "HARD_GATE_DRIFT"
  | "SCORER_IDENTITY_DRIFT"
  | "REQUIREMENT_COVERAGE_GAP"
  | "SCORER_ANCHOR_MISSING"
  | "PUBLIC_EVIDENCE_MISSING"
  | "EXACT_CONTRACT_NOT_PUBLIC"
  | "MISSING_EQUIVALENCE_CANARY"
  | "CANARY_REFERENCE_INVALID";

export type BenchmarkContractAuditIssue = {
  code: BenchmarkContractAuditIssueCode;
  subjectId: string;
};

export type BenchmarkContractAuditReport = {
  schemaVersion: "skill-ir-benchmark-contract-audit-report/v1";
  auditId: string;
  skillId: string;
  status: "passed" | "failed";
  counts: {
    tasks: number;
    criteria: number;
    requirements: number;
    canaries: number;
  };
  issues: BenchmarkContractAuditIssue[];
  claimBoundary: string;
};

type TaskCriterion = {
  id?: string;
  evaluatorId?: string;
};

type AuditTask = {
  id: string;
  split?: string;
  prompt: string;
  fixtures?: Record<string, string>;
  eval?: TaskCriterion[];
  hardGateIds?: string[];
};

type TaskSet = {
  skillId?: string;
  tasks?: AuditTask[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function addIssue(
  issues: BenchmarkContractAuditIssue[],
  code: BenchmarkContractAuditIssueCode,
  subjectId: string,
): void {
  if (!issues.some((issue) => issue.code === code && issue.subjectId === subjectId)) {
    issues.push({ code, subjectId });
  }
}

export async function hashAuditFixtureDirectory(
  directory: string,
  containmentRoot?: string,
): Promise<string> {
  const root = await realpath(resolve(directory));
  if (containmentRoot !== undefined) {
    const boundary = await realpath(resolve(containmentRoot));
    const relativeToBoundary = relative(boundary, root);
    if (
      isAbsolute(relativeToBoundary) ||
      relativeToBoundary === ".." ||
      relativeToBoundary.startsWith(`..${sep}`)
    ) {
      throw new Error("audit fixture escapes containment root");
    }
  }
  const entries: string[] = [];

  async function visit(current: string): Promise<void> {
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error("audit fixture contains a filesystem link or special file");
    }
    if (stat.isFile()) {
      const relativePath = relative(root, current).split(sep).join("/");
      entries.push(`${relativePath}\0${sha256Bytes(await readFile(current))}`);
      return;
    }
    const children = (await readdir(current, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (child.isSymbolicLink()) {
        throw new Error("audit fixture contains a filesystem link");
      }
      await visit(join(current, child.name));
    }
  }

  await visit(root);
  entries.sort((left, right) => left.localeCompare(right));
  return sha256Bytes(Buffer.from(entries.join("\n"), "utf8"));
}

async function readBoundFile(
  rootDir: string,
  file: { path: string; sha256: string },
  issues: BenchmarkContractAuditIssue[],
): Promise<Buffer> {
  let bytes: Buffer;
  try {
    const realRoot = await realpath(rootDir);
    const candidate = resolve(rootDir, file.path);
    const candidateStat = await lstat(candidate);
    const resolvedCandidate = await realpath(candidate);
    const relativeToRoot = relative(realRoot, resolvedCandidate);
    if (
      candidateStat.isSymbolicLink() ||
      isAbsolute(relativeToRoot) ||
      relativeToRoot === ".." ||
      relativeToRoot.startsWith(`..${sep}`)
    ) {
      throw new Error("bound file escapes root");
    }
    bytes = await readFile(resolvedCandidate);
  } catch {
    addIssue(issues, "FILE_DIGEST_MISMATCH", file.path);
    return Buffer.alloc(0);
  }
  if (sha256Bytes(bytes) !== file.sha256) {
    addIssue(issues, "FILE_DIGEST_MISMATCH", file.path);
  }
  return bytes;
}

function collectTaskCriteria(tasks: readonly AuditTask[]): {
  criterionIds: string[];
  hardGateIds: string[];
} {
  return {
    criterionIds: sortedUnique(tasks.flatMap((task) =>
      (task.eval ?? []).flatMap((criterion) => criterion.id ? [criterion.id] : [])
    )),
    hardGateIds: sortedUnique(tasks.flatMap((task) => task.hardGateIds ?? [])),
  };
}

function evidenceText(
  evidence: BenchmarkContractAuditManifest["requirements"][number]["publicEvidence"][number],
  tasksById: ReadonlyMap<string, AuditTask>,
  sourceTextByPath: ReadonlyMap<string, string>,
  scopedTaskIds: ReadonlySet<string>,
  issues: BenchmarkContractAuditIssue[],
  requirementId: string,
): string {
  if (evidence.kind === "task-prompt") {
    const prompts: string[] = [];
    for (const taskId of evidence.taskIds) {
      const task = tasksById.get(taskId);
      if (
        !task ||
        task.split !== "development" ||
        !scopedTaskIds.has(taskId) ||
        !task.prompt.includes(evidence.quote)
      ) {
        addIssue(issues, "PUBLIC_EVIDENCE_MISSING", requirementId);
        continue;
      }
      prompts.push(task.prompt);
    }
    return prompts.join("\n");
  }

  if (evidence.kind === "skill-source") {
    const content = sourceTextByPath.get(evidence.path);
    if (content === undefined || !content.includes(evidence.quote)) {
      addIssue(issues, "PUBLIC_EVIDENCE_MISSING", requirementId);
      return "";
    }
    return content;
  }

  const fixtureTexts: string[] = [];
  for (const taskId of evidence.taskIds) {
    const task = tasksById.get(taskId);
    const content = task?.fixtures?.[evidence.relativePath];
    if (
      !task ||
      task.split !== "development" ||
      !scopedTaskIds.has(taskId) ||
      content === undefined ||
      (evidence.quote !== undefined && !content.includes(evidence.quote))
    ) {
      addIssue(issues, "PUBLIC_EVIDENCE_MISSING", requirementId);
      continue;
    }
    fixtureTexts.push(content);
  }
  return fixtureTexts.join("\n");
}

export async function auditBenchmarkContract(
  input: BenchmarkContractAuditManifest,
  rootDir = process.cwd(),
): Promise<BenchmarkContractAuditReport> {
  const manifest = BenchmarkContractAuditManifestSchema.parse(input);
  const issues: BenchmarkContractAuditIssue[] = [];
  const [taskBytes, scorerBytes] = await Promise.all([
    readBoundFile(rootDir, manifest.tasks, issues),
    readBoundFile(rootDir, manifest.scorer, issues),
  ]);
  const sourceEntries = await Promise.all(manifest.sources.map(async (source) => [
    source.path,
    (await readBoundFile(rootDir, source, issues)).toString("utf8"),
  ] as const));
  const sourceTextByPath = new Map(sourceEntries);

  let taskSet: TaskSet = {};
  try {
    taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  } catch {
    addIssue(issues, "TASK_SCOPE_DRIFT", manifest.tasks.path);
  }
  const allTasks = taskSet.tasks ?? [];
  const tasksById = new Map(allTasks.map((task) => [task.id, task]));
  const scopedTasks = manifest.scope.taskIds.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    return task ? [task] : [];
  });
  const actualDevelopmentIds = allTasks
    .filter((task) => task.split === "development")
    .map((task) => task.id);
  if (
    taskSet.skillId !== manifest.skillId ||
    scopedTasks.some((task) => task.split !== "development") ||
    !sameStringSet(manifest.scope.taskIds, actualDevelopmentIds)
  ) {
    addIssue(issues, "TASK_SCOPE_DRIFT", manifest.skillId);
  }

  const actual = collectTaskCriteria(scopedTasks);
  const declaredCriterionIds = manifest.criteria.map((criterion) => criterion.id);
  if (!sameStringSet(actual.criterionIds, declaredCriterionIds)) {
    addIssue(issues, "CRITERION_REGISTRY_DRIFT", manifest.skillId);
  }
  const declaredHardGateIds = manifest.criteria
    .filter((criterion) => criterion.hardGate)
    .map((criterion) => criterion.id);
  if (!sameStringSet(actual.hardGateIds, declaredHardGateIds)) {
    addIssue(issues, "HARD_GATE_DRIFT", manifest.skillId);
  }
  for (const task of scopedTasks) {
    const taskCriteria = collectTaskCriteria([task]);
    const declaredTaskCriteria = manifest.criteria
      .filter((criterion) => criterion.taskIds.includes(task.id))
      .map((criterion) => criterion.id);
    const declaredTaskHardGates = manifest.criteria
      .filter((criterion) => criterion.taskIds.includes(task.id) && criterion.hardGate)
      .map((criterion) => criterion.id);
    if (!sameStringSet(taskCriteria.criterionIds, declaredTaskCriteria)) {
      addIssue(issues, "CRITERION_REGISTRY_DRIFT", task.id);
    }
    if (!sameStringSet(taskCriteria.hardGateIds, declaredTaskHardGates)) {
      addIssue(issues, "HARD_GATE_DRIFT", task.id);
    }
    if (
      (task.eval ?? []).some((criterion) =>
        criterion.id &&
        declaredCriterionIds.includes(criterion.id) &&
        criterion.evaluatorId !== manifest.scorer.evaluatorId
      )
    ) {
      addIssue(issues, "SCORER_IDENTITY_DRIFT", task.id);
    }
  }

  const requirementById = new Map(manifest.requirements.map((requirement) => [
    requirement.id,
    requirement,
  ]));
  const criterionById = new Map(manifest.criteria.map((criterion) => [
    criterion.id,
    criterion,
  ]));
  const canaryById = new Map(manifest.canaries.map((canary) => [canary.id, canary]));

  for (const criterion of manifest.criteria) {
    if (
      criterion.taskIds.some((taskId) => !manifest.scope.taskIds.includes(taskId))
    ) {
      addIssue(issues, "CRITERION_REGISTRY_DRIFT", criterion.id);
    }
    if (
      criterion.requirementIds.length === 0 ||
      criterion.requirementIds.some((id) => {
        const requirement = requirementById.get(id);
        return !requirement || !requirement.criterionIds.includes(criterion.id);
      })
    ) {
      addIssue(issues, "REQUIREMENT_COVERAGE_GAP", criterion.id);
    }
  }

  const scorerText = scorerBytes.toString("utf8");
  const scopedTaskIds = new Set(manifest.scope.taskIds);
  for (const requirement of manifest.requirements) {
    if (
      requirement.criterionIds.some((id) =>
        !criterionById.has(id) || !criterionById.get(id)!.requirementIds.includes(requirement.id)
      )
    ) {
      addIssue(issues, "REQUIREMENT_COVERAGE_GAP", requirement.id);
    }
    if (
      requirement.taskIds?.some((taskId) =>
        !requirement.criterionIds.some((criterionId) =>
          criterionById.get(criterionId)?.taskIds.includes(taskId)
        )
      )
    ) {
      addIssue(issues, "REQUIREMENT_COVERAGE_GAP", requirement.id);
    }
    for (const anchor of requirement.scorerAnchors) {
      if (!scorerText.includes(anchor.quote)) {
        addIssue(issues, "SCORER_ANCHOR_MISSING", requirement.id);
      }
    }

    for (const evidence of requirement.publicEvidence) {
      evidenceText(
        evidence,
        tasksById,
        sourceTextByPath,
        scopedTaskIds,
        issues,
        requirement.id,
      );
    }
    if (requirement.equivalence === "exact-public-contract") {
      for (const criterionId of requirement.criterionIds) {
        const criterion = criterionById.get(criterionId);
        const taskIds = (criterion?.taskIds ?? []).filter((taskId) =>
          requirement.taskIds?.includes(taskId) ?? true
        );
        for (const taskId of taskIds) {
          const visibleContract = requirement.publicEvidence
            .filter((evidence) =>
              evidence.kind === "skill-source" || evidence.taskIds.includes(taskId)
            )
            .map((evidence) => evidence.quote ?? "")
            .join("\n");
          if (requirement.contractTokens.some((token) => !visibleContract.includes(token))) {
            addIssue(
              issues,
              "EXACT_CONTRACT_NOT_PUBLIC",
              `${requirement.id}@${taskId}`,
            );
          }
        }
      }
    }

    const referencedCanaries = requirement.canaryIds.flatMap((id) => {
      const canary = canaryById.get(id);
      return canary ? [canary] : [];
    });
    if (referencedCanaries.length !== requirement.canaryIds.length) {
      addIssue(issues, "CANARY_REFERENCE_INVALID", requirement.id);
    }
    if (
      referencedCanaries.some((canary) =>
        !requirement.criterionIds.includes(canary.criterionId)
      )
    ) {
      addIssue(issues, "CANARY_REFERENCE_INVALID", requirement.id);
    }
    if (requirement.equivalence === "semantic-equivalence") {
      for (const criterionId of requirement.criterionIds) {
        const criterion = criterionById.get(criterionId);
        const taskIds = (criterion?.taskIds ?? []).filter((taskId) =>
          requirement.taskIds?.includes(taskId) ?? true
        );
        for (const taskId of taskIds) {
          if (
            !referencedCanaries.some((canary) =>
              canary.role === "alternative-valid" &&
              canary.criterionId === criterionId &&
              canary.taskId === taskId
            )
          ) {
            addIssue(
              issues,
              "MISSING_EQUIVALENCE_CANARY",
              `${requirement.id}@${taskId}`,
            );
          }
        }
      }
    }
    if (requirement.equivalence === "safety-invariant") {
      for (const criterionId of requirement.criterionIds) {
        const criterion = criterionById.get(criterionId);
        const taskIds = (criterion?.taskIds ?? []).filter((taskId) =>
          requirement.taskIds?.includes(taskId) ?? true
        );
        for (const taskId of taskIds) {
          const hasCanonical = referencedCanaries.some((canary) =>
            canary.role === "canonical-valid" &&
            canary.criterionId === criterionId &&
            canary.taskId === taskId
          );
          const hasInvalidControl = referencedCanaries.some((canary) =>
            canary.role === "invalid-control" &&
            canary.criterionId === criterionId &&
            canary.taskId === taskId
          );
          if (!hasCanonical || !hasInvalidControl) {
            addIssue(
              issues,
              "MISSING_EQUIVALENCE_CANARY",
              `${requirement.id}@${taskId}`,
            );
          }
        }
      }
    }
  }

  for (const canary of manifest.canaries) {
    const task = tasksById.get(canary.taskId);
    let fixtureIsDirectory = false;
    let fixtureDigestMatches = false;
    try {
      const fixturePath = resolve(rootDir, canary.fixturePath);
      fixtureIsDirectory = (await lstat(fixturePath)).isDirectory();
      fixtureDigestMatches =
        fixtureIsDirectory &&
        await hashAuditFixtureDirectory(fixturePath, rootDir) === canary.fixtureSha256;
    } catch {
      fixtureIsDirectory = false;
      fixtureDigestMatches = false;
    }
    if (
      !task ||
      task.split !== "development" ||
      !manifest.scope.taskIds.includes(canary.taskId) ||
      !criterionById.get(canary.criterionId)?.taskIds.includes(canary.taskId) ||
      !(task.eval ?? []).some((criterion) =>
        criterion.id === canary.criterionId &&
        criterion.evaluatorId === manifest.scorer.evaluatorId
      ) ||
      !fixtureIsDirectory ||
      !fixtureDigestMatches
    ) {
      addIssue(issues, "CANARY_REFERENCE_INVALID", canary.id);
    }
  }

  issues.sort((left, right) =>
    left.code.localeCompare(right.code) || left.subjectId.localeCompare(right.subjectId)
  );
  return {
    schemaVersion: "skill-ir-benchmark-contract-audit-report/v1",
    auditId: manifest.auditId,
    skillId: manifest.skillId,
    status: issues.length === 0 ? "passed" : "failed",
    counts: {
      tasks: scopedTasks.length,
      criteria: manifest.criteria.length,
      requirements: manifest.requirements.length,
      canaries: manifest.canaries.length,
    },
    issues,
    claimBoundary:
      "This audit checks declared contract traceability and canary coverage; it is not a scorer.",
  };
}
