/**
 * JIT-Optimize — skill content improvement.
 *
 * Design axes:
 *  - task source: synthetic-task / real-task / execution-log (all support multiple inputs)
 *  - loop: rounds, runsPerTask, convergence, baseline, holdoutTestSet
 *  - delivery: single kind (proposal) with {keepAllRounds, autoApply}
 *
 * Evidence is a unified schema fed to the optimizer regardless of source —
 * fields are "fill what you have". The optimizer runs as a headless agent
 * inside a temp workspace (a copy of the skill folder); its edits become the
 * optimized version, which is snapshotted into the proposal as round-N/. The
 * concrete agent backend is selected through `core/headless-agent.ts`, so
 * jit-optimize has no hard dependency on any particular agent tool.
 *
 * No dependency on compiler, profiler, TCP, or SCR.
 */

import { runLoop } from "./loop.ts"
import type {
  JitOptimizeConfig,
  JitOptimizeResult,
} from "./types.ts"
import { createLogger } from "../core/logger.ts"

const log = createLogger("jit-optimize")

/**
 * Entry point: run an optimization session and return the resulting proposal.
 *
 * ```ts
 * const result = await jitOptimize({
 *   skillDir: "skvm-data/skills/powerpoint-pptx",
 *   optimizer: { model: "<provider>/<model-id>" },
 *   taskSource: { kind: "real-task", tasks: ["powerpoint-pptx_task_02"] },
 *   targetAdapter: { model: "<provider>/<model-id>", harness: "openclaw" },
 *   loop: { rounds: 3 },
 *   delivery: { keepAllRounds: true, autoApply: false },
 * })
 * console.log(result.proposalId, result.bestRound, result.bestRoundReason)
 * ```
 */
export async function jitOptimize(
  config: JitOptimizeConfig,
  opts?: import("./loop.ts").RunLoopOptions,
): Promise<JitOptimizeResult> {
  log.info(`jit-optimize: source=${config.taskSource.kind} rounds=${config.loop?.rounds ?? 1}`)
  return runLoop(config, opts)
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  JitOptimizeConfig,
  JitOptimizeResult,
  RoundResult,
  Evidence,
  HistoryEntry,
  OptimizationChange,
  OptimizationAction,
  OptimizationActionKind,
  OptimizationActionDiagnostic,
  OptimizationConstraint,
  OptimizationConstraintScope,
  OptimizationProgramValidationSuggestion,
  OptimizationValidationCaseSuggestion,
  OptimizationValidationBasis,
  OptimizationRoundValidationSummary,
  OptimizeInput,
  OptimizeConfig,
  OptimizeResult,
  OptimizeSubmission,
  TaskSource,
  LoopConfig,
  DeliveryConfig,
  EvidenceCriterion,
  RunMeta,
  WorkDirSnapshot,
  ConversationLogEntry,
  ExecutionLogInput,
  CostSlice,
} from "./types.ts"

export {
  HistoryEntrySchema,
  OptimizationChangeSchema,
  OptimizationActionSchema,
  OptimizationActionDiagnosticSchema,
  OptimizeSubmissionSchema,
  EvidenceCriterionSchema,
  emptyCostSlice,
} from "./types.ts"

export { actionKindMismatchDiagnostic, validateOptimizationActions } from "./action-plan.ts"
export type { OptimizationActionValidationResult } from "./action-plan.ts"
export {
  selectOptimizationImplementation,
  selectOptimizationImplementations,
} from "./implementations.ts"
export type {
  ImplementationSelection,
  ImplementationSelectionStatus,
  DomainImplementationBackend,
  DomainImplementationBackendSelection,
  SelectOptimizationImplementationOptions,
  SelectOptimizationImplementationsOptions,
} from "./implementations.ts"
export { validateOptimizationProgram, resolveActionValidation } from "./package-validation.ts"
export type {
  ValidateOptimizationProgramOptions,
  OptimizationProgramValidationResult,
  ProgramValidationFailureKind,
  ProgramValidationExpectation,
  ProgramValidationCase,
  ProgramRunValidation,
  ProgramOutputFileEvidence,
  ActionValidationObservation,
  ActionValidationFeedback,
  ActionValidationResolution,
  ResolveActionValidationOptions,
} from "./package-validation.ts"
export {
  deriveProgramValidationPlan,
  runOptimizationValidationLifecycle,
  OPTIMIZATION_VALIDATION_REPORT_SCHEMA_VERSION,
} from "./validation-lifecycle.ts"
export {
  buildWorkflowScaffoldSource,
  buildWorkflowScaffoldManifest,
  materializeWorkflowScaffold,
  deriveWorkflowScaffoldCandidates,
  WORKFLOW_SCAFFOLD_SCHEMA_VERSION,
} from "./workflow-scaffold.ts"
export type {
  WorkflowScaffoldKind,
  WorkflowScaffoldRuntime,
  WorkflowScaffoldContributor,
  WorkflowScaffoldProcessor,
  WorkflowScaffoldSpec,
  WorkflowScaffoldStep,
  WorkflowScaffoldManifest,
  MaterializeWorkflowScaffoldOptions,
  MaterializedWorkflowScaffold,
  WorkflowScaffoldSourceInterface,
  DerivedWorkflowScaffoldCandidate,
  DeriveWorkflowScaffoldCandidatesOptions,
} from "./workflow-scaffold.ts"
export {
  completeValidationSuggestion,
  deriveValidationVariations,
} from "./validation-completion.ts"
export type {
  CompleteValidationSuggestionOptions,
  ValidationCompletionResult,
  ValidationCompletionStatus,
  ValidationCompletionDiagnostic,
  ValidationCompletionDiagnosticCode,
  ValidationCompletionProvenance,
  ValidationCompletionFieldProvenance,
  ValidationVariationKind,
  ValidationVariationInputBinding,
  ValidationVariationCase,
  ValidationVariationSkip,
  ValidationVariationCoverage,
  ValidationVariationAudit,
  DeriveValidationVariationsOptions,
} from "./validation-completion.ts"
export type {
  DerivedProgramValidationPlan,
  DerivedProgramValidationPlanStatus,
  DeriveProgramValidationPlanOptions,
  ProgramValidationPlanDiagnostic,
  ProgramValidationCaseEvidence,
  OptimizationActionValidationRecord,
  OptimizationValidationLifecycleReport,
  RunOptimizationValidationLifecycleOptions,
  RunOptimizationValidationLifecycleResult,
  OptimizationVariationReport,
} from "./validation-lifecycle.ts"
export {
  buildOptimizedSkillPackage,
  publishOptimizedSkillPackageAtomically,
  readOptimizedSkillPackageUserSummary,
  verifyOptimizedSkillPackage,
  OptimizedSkillPackageManifestSchema,
  CurrentOptimizedSkillPackageManifestSchema,
  LegacyOptimizedSkillPackageManifestSchema,
  OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION,
  LEGACY_OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION,
  OPTIMIZED_SKILL_PACKAGE_MANIFEST,
  OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT,
  OPTIMIZED_SKILL_PACKAGE_USER_GUIDE,
} from "./package.ts"
export type {
  BuildOptimizedSkillPackageOptions,
  BuildOptimizedSkillPackageResult,
  CurrentOptimizedSkillPackageManifest,
  OptimizedSkillPackageManifest,
  VerifiedOptimizedSkillPackage,
  OptimizedSkillPackageUserStep,
  OptimizedSkillPackageUserSummary,
} from "./package.ts"

export { runOptimizer } from "./optimizer.ts"
export { runLoop } from "./loop.ts"
export {
  resolveTrainTestTasks,
  loadEvidencesFromLogs,
  copyFixturesInto,
} from "./task-source.ts"
export type { RunnableTask, ResolvedTasks } from "./task-source.ts"
export {
  snapshotWorkDir,
  buildEvidenceCriteria,
  readConversationLog,
  buildConversationLogFromSteps,
  parseConvLogFile,
  buildRunMeta,
  scoreFromCriteria,
  countCriteria,
  buildEvidenceFromRun,
} from "./evidence.ts"
export type { ParsedConvLogFile } from "./evidence.ts"
export { adaptTraceFile } from "./trace-adapters.ts"
export type { AdaptedTraceFile, AdaptedTraceRecord } from "./trace-adapters.ts"
export {
  buildTraceGuidedApiTesterPackage,
  verifyTraceGuidedSkillPackage,
  TraceGuidedSkillPackageManifestSchema,
  TRACE_GUIDED_SKILL_PACKAGE_SCHEMA_VERSION,
} from "./solidification.ts"
export type {
  TraceGuidedSkillPackage,
  TraceGuidedSkillPackageManifest,
} from "./solidification.ts"
export { analyzeSkillConsumption } from "./consumption.ts"
export type {
  SkillConsumptionAnalysis,
  AnalyzeSkillConsumptionOptions,
  SkillConsumptionInvocation,
  ConsumptionMatch,
  ConsumptionExitStatus,
  ConsumptionOutputAssertion,
  ConsumptionTaskOutcome,
} from "./consumption.ts"
export {
  buildGeneralSkillTaskPrompt,
  runGeneralSkillDevelopment,
} from "./general-skill-development.ts"
export type {
  GeneralSkillResource,
  GeneralSkillExpectedFile,
  GeneralSkillAgentExecution,
  GeneralSkillAgentRunner,
  RunGeneralSkillDevelopmentOptions,
  GeneralSkillDevelopmentReport,
  BuildGeneralSkillTaskPromptOptions,
} from "./general-skill-development.ts"
export { analyzeMatchedConsumptionPairs } from "./effect.ts"
export type {
  ConsumptionRunForComparison,
  MatchedConsumptionPair,
} from "./effect.ts"
export {
  createWorkspace,
  serializeContext,
  computeDiff,
  stripOptimizeDir,
  removeWorkspace,
} from "./workspace.ts"
export type { Workspace, WorkspaceDiff } from "./workspace.ts"
