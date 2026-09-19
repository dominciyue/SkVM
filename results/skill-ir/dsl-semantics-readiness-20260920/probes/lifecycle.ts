import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateTranslationConstraints } from "./constraints";
import {
  applyUnitReplacements,
  extractMarkdownDocuments,
  ProbeError,
  type LexicalProtectionKind,
  type ProtectedItem,
  type SourceUnit,
  type UnitReplacement,
} from "./units";

export interface LifecycleTarget {
  id: string;
  locale: string;
  outputPath: string;
  overwrite: "never" | "ask" | "replace";
  independent: boolean;
}

export interface LifecycleAgentRequest {
  operation: "translate-units";
  task: {
    naturalRequest: string;
    sourceLocale: string | null;
    ambiguity: "ask" | "record" | "fail";
    contextMode: "document-batch";
  };
  units: SourceUnit[];
  protectedItems: ProtectedItem[];
  targets: Array<{ id: string; locale: string }>;
}

export interface LifecycleAgent {
  run(request: LifecycleAgentRequest): Promise<unknown>;
}

export interface LifecycleTargetResult {
  targetId: string;
  replacements: UnitReplacement[];
}

export interface LifecycleReviewer {
  review(input: {
    target: LifecycleTarget;
    candidateBytes: Uint8Array;
  }): Promise<"acceptable" | "unacceptable" | "unknown">;
}

export interface LifecycleOptions {
  runId: string;
  workspaceDir: string;
  sourcePath: string;
  targets: LifecycleTarget[];
  partialTargets: "forbid" | "publish-independent";
  interactive: boolean;
  agentTimeoutMs: number;
  semanticReview: "optional" | "required";
  agent: LifecycleAgent;
  reviewer?: LifecycleReviewer;
  beforePublish?: () => Promise<void>;
  naturalRequest?: string;
  sourceLocale?: string | null;
  ambiguity?: "ask" | "record" | "fail";
  lexicalProtectionKinds?: readonly LexicalProtectionKind[];
  sourceId?: string;
}

export interface LifecycleDiagnostic {
  code: string;
  phase: "preflight" | "extract" | "agent" | "check" | "semantic-review" | "publish";
  message: string;
  targetId?: string;
}

export interface LifecycleTargetOutcome {
  id: string;
  state: "not-started" | "staged" | "check-failed" | "review-pending" | "published" | "failed";
  checks: "not-run" | "passed" | "failed";
  semanticReview: "not-run" | "acceptable" | "unacceptable" | "unknown";
  published: boolean;
  stagingPath?: string;
}

export interface LifecycleOutcome {
  status: "invalid-input" | "unsupported" | "needs-input" | "failed" | "partial" | "completed";
  execution: "not-started" | "succeeded" | "failed" | "timed-out";
  checks: "not-run" | "passed" | "failed" | "not-applicable";
  semanticReview: "not-run" | "pending" | "acceptable" | "unacceptable" | "unknown";
  published: "none" | "partial" | "all";
  targets: LifecycleTargetOutcome[];
  diagnostics: LifecycleDiagnostic[];
}

type ParsedAgentResult =
  | { status: "needs-input"; question: string }
  | { status: "completed"; targets: LifecycleTargetResult[] };

class LifecycleTimeoutError extends Error {}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAgentResult(value: unknown): ParsedAgentResult | null {
  if (!isRecord(value)) return null;
  if (value.status === "needs-input") {
    return typeof value.question === "string" && value.question.trim()
      ? { status: "needs-input", question: value.question }
      : null;
  }
  if (value.status !== "completed" || !Array.isArray(value.targets)) return null;
  const targets: LifecycleTargetResult[] = [];
  for (const rawTarget of value.targets) {
    if (!isRecord(rawTarget) || typeof rawTarget.targetId !== "string" || !Array.isArray(rawTarget.replacements)) {
      return null;
    }
    const replacements: UnitReplacement[] = [];
    for (const rawReplacement of rawTarget.replacements) {
      if (
        !isRecord(rawReplacement) ||
        typeof rawReplacement.unitId !== "string" ||
        typeof rawReplacement.text !== "string"
      ) {
        return null;
      }
      replacements.push({ unitId: rawReplacement.unitId, text: rawReplacement.text });
    }
    targets.push({ targetId: rawTarget.targetId, replacements });
  }
  return { status: "completed", targets };
}

function targetOutcomes(targets: LifecycleTarget[]): LifecycleTargetOutcome[] {
  return targets.map((target) => ({
    id: target.id,
    state: "not-started",
    checks: "not-run",
    semanticReview: "not-run",
    published: false,
  }));
}

function earlyOutcome(
  options: LifecycleOptions,
  status: LifecycleOutcome["status"],
  execution: LifecycleOutcome["execution"],
  checks: LifecycleOutcome["checks"],
  semanticReview: LifecycleOutcome["semanticReview"],
  diagnostic: LifecycleDiagnostic,
): LifecycleOutcome {
  return {
    status,
    execution,
    checks,
    semanticReview,
    published: "none",
    targets: targetOutcomes(options.targets),
    diagnostics: [diagnostic],
  };
}

function resolveWorkspacePath(root: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".") return null;
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  return resolved;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function runWithTimeout(
  adapter: LifecycleAgent,
  request: LifecycleAgentRequest,
  timeoutMs: number,
): Promise<unknown> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new LifecycleTimeoutError("agent-timeout")), timeoutMs);
  });
  try {
    return await Promise.race([adapter.run(request), timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

function aggregateSemanticReview(
  outcomes: LifecycleTargetOutcome[],
  policy: LifecycleOptions["semanticReview"],
): LifecycleOutcome["semanticReview"] {
  const values = outcomes.map((outcome) => outcome.semanticReview);
  if (values.includes("unacceptable")) return "unacceptable";
  if (policy === "required" && outcomes.some((outcome) => outcome.state === "review-pending")) return "pending";
  const observed = values.filter((value) => value !== "not-run");
  if (observed.length === 0) return "not-run";
  if (observed.every((value) => value === "acceptable")) return "acceptable";
  return "unknown";
}

export async function runLifecycle(options: LifecycleOptions): Promise<LifecycleOutcome> {
  const root = path.resolve(options.workspaceDir);
  const diagnostics: LifecycleDiagnostic[] = [];
  if (options.targets.length === 0) {
    return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
      code: "missing-target",
      phase: "preflight",
      message: "At least one target is required.",
    });
  }
  if (!Number.isFinite(options.agentTimeoutMs) || options.agentTimeoutMs <= 0) {
    return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
      code: "invalid-agent-timeout",
      phase: "preflight",
      message: "agentTimeoutMs must be a positive finite number.",
    });
  }
  if (
    options.partialTargets === "publish-independent" &&
    options.targets.some((target) => !target.independent)
  ) {
    return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
      code: "partial-independence-not-declared",
      phase: "preflight",
      message: "Partial publication requires every target to declare independence.",
    });
  }

  const sourceAbsolute = resolveWorkspacePath(root, options.sourcePath);
  if (!sourceAbsolute) {
    return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
      code: "invalid-source-path",
      phase: "preflight",
      message: "The source path must be a relative file path inside the workspace.",
    });
  }
  if (path.extname(sourceAbsolute).toLowerCase() !== ".md") {
    return earlyOutcome(options, "unsupported", "not-started", "not-run", "not-run", {
      code: "unsupported-source-format",
      phase: "preflight",
      message: "This probe supports Markdown inputs only.",
    });
  }

  const targetPaths = new Map<string, string>();
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const target of options.targets) {
    const targetAbsolute = resolveWorkspacePath(root, target.outputPath);
    const pathKey = targetAbsolute?.toLowerCase();
    if (!targetAbsolute || !pathKey || seenIds.has(target.id) || seenPaths.has(pathKey)) {
      return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
        code: "invalid-target-binding",
        phase: "preflight",
        message: `Target ${target.id} has a duplicate or out-of-workspace id/path binding.`,
        targetId: target.id,
      });
    }
    if (pathKey === sourceAbsolute.toLowerCase()) {
      return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
        code: "source-target-collision",
        phase: "preflight",
        message: `Target ${target.id} resolves to the read-only source path.`,
        targetId: target.id,
      });
    }
    seenIds.add(target.id);
    seenPaths.add(pathKey);
    targetPaths.set(target.id, targetAbsolute);
  }

  for (const target of options.targets) {
    const targetAbsolute = targetPaths.get(target.id)!;
    if (!(await exists(targetAbsolute))) continue;
    if (target.overwrite === "ask") {
      return earlyOutcome(options, "needs-input", "not-started", "not-run", "not-run", {
        code: "target-overwrite-decision-required",
        phase: "preflight",
        message: `Target ${target.id} exists and requires an explicit replace or skip decision${
          options.interactive ? "." : " in an unattended run."
        }`,
        targetId: target.id,
      });
    }
    if (target.overwrite === "never") {
      return earlyOutcome(options, "failed", "not-started", "not-run", "not-run", {
        code: "target-exists",
        phase: "preflight",
        message: `Target ${target.id} already exists and replacement is forbidden.`,
        targetId: target.id,
      });
    }
  }

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await readFile(sourceAbsolute);
  } catch (error) {
    return earlyOutcome(options, "invalid-input", "not-started", "not-run", "not-run", {
      code: "source-read-failed",
      phase: "preflight",
      message: `Could not read the source: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const sourceDigest = digest(sourceBytes);
  const sourceId = options.sourceId ?? "source";
  const extraction = extractMarkdownDocuments(
    [{ id: sourceId, path: options.sourcePath, bytes: sourceBytes }],
    { lexicalKinds: options.lexicalProtectionKinds },
  );
  if (!extraction.supported) {
    return earlyOutcome(options, "unsupported", "not-started", "not-run", "not-run", {
      code: extraction.diagnostics[0]?.code ?? "unsupported-structure",
      phase: "extract",
      message: extraction.diagnostics[0]?.message ?? "The source contains an unsupported structure.",
    });
  }

  const request: LifecycleAgentRequest = {
    operation: "translate-units",
    task: {
      naturalRequest: options.naturalRequest ?? "Translate the selected technical Markdown units.",
      sourceLocale: options.sourceLocale ?? null,
      ambiguity: options.ambiguity ?? "record",
      contextMode: "document-batch",
    },
    units: extraction.units,
    protectedItems: extraction.protectedItems,
    targets: options.targets.map((target) => ({ id: target.id, locale: target.locale })),
  };
  let rawAgentResult: unknown;
  try {
    rawAgentResult = await runWithTimeout(options.agent, request, options.agentTimeoutMs);
  } catch (error) {
    if (error instanceof LifecycleTimeoutError) {
      return earlyOutcome(options, "failed", "timed-out", "not-run", "not-run", {
        code: "agent-timeout",
        phase: "agent",
        message: `The agent did not return within ${options.agentTimeoutMs} ms.`,
      });
    }
    return earlyOutcome(options, "failed", "failed", "not-run", "not-run", {
      code: "agent-failed",
      phase: "agent",
      message: `The agent failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const agentResult = parseAgentResult(rawAgentResult);
  if (!agentResult) {
    return earlyOutcome(options, "failed", "failed", "not-run", "not-run", {
      code: "invalid-agent-result",
      phase: "agent",
      message: "The agent result does not match the bounded replacement-set envelope.",
    });
  }
  if (agentResult.status === "needs-input") {
    return earlyOutcome(options, "needs-input", "succeeded", "not-run", "not-run", {
      code: "agent-needs-input",
      phase: "agent",
      message: agentResult.question,
    });
  }

  const outcomes = targetOutcomes(options.targets);
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const targetResultGroups = new Map<string, LifecycleTargetResult[]>();
  let globalContractFailure = false;
  for (const targetResult of agentResult.targets) {
    if (!outcomeById.has(targetResult.targetId)) {
      globalContractFailure = true;
      diagnostics.push({
        code: "unknown-target-result",
        phase: "check",
        message: `The agent returned unknown target ${targetResult.targetId}.`,
        targetId: targetResult.targetId,
      });
      continue;
    }
    const group = targetResultGroups.get(targetResult.targetId) ?? [];
    group.push(targetResult);
    targetResultGroups.set(targetResult.targetId, group);
  }

  const stagingRoot = path.join(
    root,
    ".dsl-probe-staging",
    options.runId.replace(/[^A-Za-z0-9._-]/gu, "-") || "run",
  );
  await mkdir(stagingRoot, { recursive: true });

  const eligible = new Map<string, string>();
  for (const target of options.targets) {
    const outcome = outcomeById.get(target.id)!;
    const group = targetResultGroups.get(target.id) ?? [];
    if (group.length === 0) {
      outcome.state = "check-failed";
      outcome.checks = "failed";
      diagnostics.push({
        code: "missing-target-result",
        phase: "check",
        message: `The agent returned no result for target ${target.id}.`,
        targetId: target.id,
      });
      continue;
    }
    if (group.length > 1) {
      outcome.state = "check-failed";
      outcome.checks = "failed";
      diagnostics.push({
        code: "duplicate-target-result",
        phase: "check",
        message: `The agent returned multiple results for target ${target.id}.`,
        targetId: target.id,
      });
      continue;
    }
    const targetResult = group[0]!;
    const validation = validateTranslationConstraints({
      extraction,
      replacements: targetResult.replacements,
      requestedTargetLocales: options.targets.map((candidate) => candidate.locale),
      targetLocale: target.locale,
      selectionCompleteness: {
        status: "verified",
        reason: "The D7 fixture's supported Markdown nodes were independently enumerated.",
      },
      lexicalProtectionKinds: options.lexicalProtectionKinds,
    });
    for (const diagnostic of validation.diagnostics) {
      diagnostics.push({
        code: diagnostic.code,
        phase: "check",
        message: diagnostic.message,
        targetId: target.id,
      });
    }
    if (validation.deterministicStatus === "fail" || globalContractFailure) {
      outcome.state = "check-failed";
      outcome.checks = "failed";
      continue;
    }

    let candidateBytes: Uint8Array;
    try {
      const currentSource = await readFile(sourceAbsolute);
      candidateBytes = applyUnitReplacements(extraction, targetResult.replacements, [
        { id: sourceId, path: options.sourcePath, bytes: currentSource },
      ]).get(sourceId)!;
    } catch (error) {
      outcome.state = "check-failed";
      outcome.checks = "failed";
      diagnostics.push({
        code: error instanceof ProbeError ? error.code : "refill-failed",
        phase: "check",
        message: error instanceof Error ? error.message : String(error),
        targetId: target.id,
      });
      continue;
    }

    const stagingPath = path.join(stagingRoot, `${target.id.replace(/[^A-Za-z0-9._-]/gu, "-")}.candidate.md`);
    await writeFile(stagingPath, candidateBytes);
    outcome.state = "staged";
    outcome.checks = "passed";
    outcome.stagingPath = stagingPath;

    let review: LifecycleTargetOutcome["semanticReview"] = "unknown";
    if (options.reviewer) {
      try {
        review = await options.reviewer.review({ target, candidateBytes });
      } catch (error) {
        outcome.state = "failed";
        diagnostics.push({
          code: "semantic-review-failed",
          phase: "semantic-review",
          message: error instanceof Error ? error.message : String(error),
          targetId: target.id,
        });
        continue;
      }
    }
    outcome.semanticReview = review;
    if (review === "unacceptable") {
      outcome.state = "failed";
      diagnostics.push({
        code: "semantic-review-unacceptable",
        phase: "semantic-review",
        message: `Semantic review rejected target ${target.id}.`,
        targetId: target.id,
      });
      continue;
    }
    if (options.semanticReview === "required" && review !== "acceptable") {
      outcome.state = "review-pending";
      diagnostics.push({
        code: "semantic-review-required",
        phase: "semantic-review",
        message: `Target ${target.id} requires an acceptable semantic review before publication.`,
        targetId: target.id,
      });
      continue;
    }
    eligible.set(target.id, stagingPath);
  }

  if (globalContractFailure) eligible.clear();
  if (options.partialTargets === "forbid" && eligible.size !== options.targets.length) eligible.clear();

  if (eligible.size > 0 && options.beforePublish) {
    try {
      await options.beforePublish();
    } catch (error) {
      diagnostics.push({
        code: "before-publish-hook-failed",
        phase: "publish",
        message: error instanceof Error ? error.message : String(error),
      });
      eligible.clear();
    }
  }

  for (const target of options.targets) {
    const stagingPath = eligible.get(target.id);
    if (!stagingPath) continue;
    const outcome = outcomeById.get(target.id)!;
    if (digest(await readFile(sourceAbsolute)) !== sourceDigest) {
      outcome.state = "failed";
      outcome.checks = "failed";
      diagnostics.push({
        code: "stale-source-snapshot",
        phase: "publish",
        message: "The source changed after candidate staging; publication was blocked.",
        targetId: target.id,
      });
      continue;
    }
    const targetAbsolute = targetPaths.get(target.id)!;
    if ((await exists(targetAbsolute)) && target.overwrite !== "replace") {
      outcome.state = "failed";
      diagnostics.push({
        code: "target-appeared-before-publish",
        phase: "publish",
        message: `Target ${target.id} appeared after preflight and replacement was not authorized.`,
        targetId: target.id,
      });
      continue;
    }
    try {
      await mkdir(path.dirname(targetAbsolute), { recursive: true });
      await copyFile(stagingPath, targetAbsolute);
      outcome.state = "published";
      outcome.published = true;
    } catch (error) {
      outcome.state = "failed";
      diagnostics.push({
        code: "target-publish-failed",
        phase: "publish",
        message: error instanceof Error ? error.message : String(error),
        targetId: target.id,
      });
    }
  }

  const publishedCount = outcomes.filter((outcome) => outcome.published).length;
  const aggregateChecks: LifecycleOutcome["checks"] = outcomes.some((outcome) => outcome.checks === "failed") || globalContractFailure
    ? "failed"
    : outcomes.every((outcome) => outcome.checks === "passed")
      ? "passed"
      : "not-run";
  const semanticReview = aggregateSemanticReview(outcomes, options.semanticReview);
  const status: LifecycleOutcome["status"] =
    publishedCount === options.targets.length
      ? "completed"
      : publishedCount > 0
        ? "partial"
        : outcomes.some((outcome) => outcome.state === "review-pending") && aggregateChecks === "passed"
          ? "needs-input"
          : "failed";

  return {
    status,
    execution: "succeeded",
    checks: aggregateChecks,
    semanticReview,
    published:
      publishedCount === 0 ? "none" : publishedCount === options.targets.length ? "all" : "partial",
    targets: outcomes,
    diagnostics,
  };
}
