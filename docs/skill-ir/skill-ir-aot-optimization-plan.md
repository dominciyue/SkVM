# Skill IR AOT Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Skill IR AOT optimization pipeline inside a SkVM fork, with static IR construction, profile-guided optimization, lowering, benchmark integration, and research-grade evaluation.

**Architecture:** The implementation adds a focused `src/skill-ir/` subsystem to SkVM, plus profiler, benchmark, and analysis modules. Skill text is parsed into JSON/Zod-validated IR, optimized through AOT passes, lowered into controller/checker/adapter artifacts, then evaluated across agents, environments, contexts, and tasks.

**Tech Stack:** TypeScript, Bun, Zod, JSON/JSONL, Python for result analysis, Markdown for reports.

---

## Assumptions

- Work happens in a fork or clone of `SJTU-IPADS/SkVM`.
- The cloned repository path is referred to as `<skvm-root>`.
- This planning workspace is `D:\skill优化`; it stores research notes and plans.
- Implementation paths below are relative to `<skvm-root>`.
- The initial implementation keeps Skill IR modules independent from SkVM internals, then adds benchmark integration after the IR subsystem is tested.

## File Structure

Create these files in `<skvm-root>`:

```text
src/skill-ir/schema.ts
src/skill-ir/schema.test.ts
src/skill-ir/parser.ts
src/skill-ir/parser.test.ts
src/skill-ir/validate.ts
src/skill-ir/validate.test.ts
src/skill-ir/passes/rule-normalization.ts
src/skill-ir/passes/rule-normalization.test.ts
src/skill-ir/passes/environment-guards.ts
src/skill-ir/passes/environment-guards.test.ts
src/skill-ir/passes/profile-guided-repair.ts
src/skill-ir/passes/profile-guided-repair.test.ts
src/skill-ir/lowering/controller.ts
src/skill-ir/lowering/checker.ts
src/skill-ir/lowering/adapter.ts
src/skill-ir/lowering/lowering.test.ts
src/profiler/trace-schema.ts
src/profiler/trace-schema.test.ts
src/profiler/profile-annotation.ts
src/profiler/profile-annotation.test.ts
src/benchmarks/skill-ir/matrix.ts
src/benchmarks/skill-ir/matrix.test.ts
src/benchmarks/skill-ir/run.ts
scripts/analyze_skill_ir_results.py
docs/skill-ir/skill-ir-v1.md
docs/skill-ir/experiment-design.md
benchmarks/skill-ir/corpus/manifest.json
benchmarks/skill-ir/tasks/*.json
benchmarks/skill-ir/contexts/*.json
benchmarks/skill-ir/ir/*.json
results/skill-ir/.gitkeep
```

Each module has one responsibility:

- `schema.ts`: TypeScript types and Zod schemas.
- `parser.ts`: Converts skill text into initial IR through LLM-assisted JSON plus deterministic cleanup.
- `validate.ts`: Returns structured validation errors and warnings.
- `passes/*`: Pure functions from `SkillIR` to `SkillIR`.
- `lowering/*`: Generates executable artifacts from optimized IR.
- `profiler/*`: Converts traces into profile annotations.
- `benchmarks/skill-ir/*`: Builds and runs experiment matrices.
- `scripts/analyze_skill_ir_results.py`: Produces CSV tables and summary metrics.

## Task 0: Repository Setup

**Files:**
- Create local clone: `<skvm-root>`
- Create: `results/skill-ir/.gitkeep`

- [ ] **Step 1: Clone SkVM**

Run:

```powershell
git clone https://github.com/SJTU-IPADS/SkVM.git
cd SkVM
```

Expected: the repository exists locally and `git status --short --branch` shows branch information.

- [ ] **Step 2: Install dependencies**

Run:

```powershell
bun install
```

Expected: dependencies install without package resolution errors.

- [ ] **Step 3: Run existing tests or smoke benchmark**

Run:

```powershell
bun test
```

Expected: existing tests pass. If the repository has no test script, record the available scripts with:

```powershell
bun run
```

- [ ] **Step 4: Create result directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path results/skill-ir | Out-Null
New-Item -ItemType File -Force -Path results/skill-ir/.gitkeep | Out-Null
```

- [ ] **Step 5: Commit setup**

Run:

```powershell
git add results/skill-ir/.gitkeep
git commit -m "chore: prepare skill ir results directory"
```

Expected: commit succeeds if the working tree had no unrelated staged changes.

## Task 1: Skill IR Schema

**Files:**
- Create: `src/skill-ir/schema.ts`
- Create: `src/skill-ir/schema.test.ts`
- Create: `docs/skill-ir/skill-ir-v1.md`

- [ ] **Step 1: Write failing schema tests**

Create `src/skill-ir/schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SkillIRSchema } from "./schema";

describe("SkillIRSchema", () => {
  test("accepts a minimal valid workflow skill IR", () => {
    const parsed = SkillIRSchema.parse({
      schemaVersion: "skill-ir/v1",
      id: "skill-review",
      name: "Code Review",
      category: ["workflow", "constraint-heavy"],
      intent: "Review code changes and report findings first.",
      source: { kind: "file", path: "skills/review/SKILL.md" },
      inputs: [],
      outputs: [{ id: "final-response", description: "Review findings", required: true }],
      preconditions: [],
      steps: [
        {
          id: "step-read-diff",
          title: "Read diff",
          description: "Inspect changed files before producing findings.",
          kind: "read",
          required: true,
          dependsOn: [],
          toolRefs: [],
          produces: ["diff-understanding"],
          successCheckRefs: ["check-diff-read"],
          failureModes: ["missing-diff"],
        },
      ],
      rules: [
        {
          id: "rule-findings-first",
          sourceText: "Findings should lead the response.",
          level: "must",
          scope: "output",
          checkability: "human",
          severity: "high",
          normalizedForm: "Output begins with findings before summary.",
        },
      ],
      tools: [],
      environment: [],
      checks: [
        {
          id: "check-diff-read",
          name: "Diff was inspected",
          kind: "step-success",
          targetRef: "step-read-diff",
          assertion: "The execution trace includes a diff or file inspection action.",
          onFailure: "abort",
        },
      ],
      recovery: [],
      profile: [],
    });

    expect(parsed.id).toBe("skill-review");
  });

  test("rejects unknown categories", () => {
    expect(() =>
      SkillIRSchema.parse({
        schemaVersion: "skill-ir/v1",
        id: "bad",
        name: "Bad",
        category: ["unknown"],
        intent: "Invalid",
        source: { kind: "inline", text: "bad" },
        inputs: [],
        outputs: [],
        preconditions: [],
        steps: [],
        rules: [],
        tools: [],
        environment: [],
        checks: [],
        recovery: [],
        profile: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
bun test src/skill-ir/schema.test.ts
```

Expected: FAIL because `src/skill-ir/schema.ts` does not exist.

- [ ] **Step 3: Implement schema**

Create `src/skill-ir/schema.ts`:

```ts
import { z } from "zod";

export const SkillCategorySchema = z.enum([
  "workflow",
  "tool-use",
  "constraint-heavy",
  "diagnostic",
  "generative",
  "environment-sensitive",
]);

export const SkillSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), path: z.string().min(1) }),
  z.object({ kind: z.literal("inline"), text: z.string().min(1) }),
]);

export const InputSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
});

export const OutputSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
});

export const ConditionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  checkability: z.enum(["static", "runtime", "human"]),
});

export const StepKindSchema = z.enum([
  "read",
  "analyze",
  "plan",
  "execute",
  "edit",
  "verify",
  "ask",
  "report",
]);

export const StepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  kind: StepKindSchema,
  required: z.boolean(),
  dependsOn: z.array(z.string()),
  toolRefs: z.array(z.string()),
  produces: z.array(z.string()),
  successCheckRefs: z.array(z.string()),
  failureModes: z.array(z.string()),
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  sourceText: z.string().min(1),
  level: z.enum(["must", "never", "should"]),
  scope: z.enum(["planning", "tool-use", "file-edit", "git", "output", "safety", "context"]),
  checkability: z.enum(["static", "runtime", "human"]),
  severity: z.enum(["low", "medium", "high"]),
  normalizedForm: z.string().min(1),
});

export const ToolRequirementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  required: z.boolean(),
  alternatives: z.array(z.string()),
  platformNotes: z.object({
    linux: z.string().optional(),
    macos: z.string().optional(),
    windows: z.string().optional(),
  }),
  availabilityCheck: z.string().min(1),
});

export const EnvironmentAssumptionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  platforms: z.array(z.enum(["linux", "macos", "windows", "wsl", "container"])),
  checkability: z.enum(["static", "runtime", "human"]),
});

export const RuntimeCheckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["preflight", "step-success", "rule-violation", "output"]),
  targetRef: z.string().min(1),
  command: z.string().optional(),
  assertion: z.string().min(1),
  onFailure: z.enum(["retry", "fallback", "ask-user", "abort", "report"]),
});

export const RecoveryPolicySchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1),
  action: z.enum(["retry", "use-alternative-tool", "repair-environment", "ask-user", "stop"]),
  maxAttempts: z.number().int().min(0),
  explanation: z.string().min(1),
});

export const ProfileAnnotationSchema = z.object({
  id: z.string().min(1),
  sourceTrace: z.string().min(1),
  targetRef: z.string().min(1),
  observation: z.enum([
    "frequent-failure",
    "frequent-skip",
    "high-token-cost",
    "environment-sensitive",
    "agent-sensitive",
    "context-sensitive",
  ]),
  evidenceCount: z.number().int().min(1),
  suggestedPass: z.string().min(1),
});

export const SkillIRSchema = z.object({
  schemaVersion: z.literal("skill-ir/v1"),
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.array(SkillCategorySchema).min(1),
  intent: z.string().min(1),
  source: SkillSourceSchema,
  inputs: z.array(InputSpecSchema),
  outputs: z.array(OutputSpecSchema),
  preconditions: z.array(ConditionSchema),
  steps: z.array(StepSchema),
  rules: z.array(RuleSchema),
  tools: z.array(ToolRequirementSchema),
  environment: z.array(EnvironmentAssumptionSchema),
  checks: z.array(RuntimeCheckSchema),
  recovery: z.array(RecoveryPolicySchema),
  profile: z.array(ProfileAnnotationSchema),
});

export type SkillIR = z.infer<typeof SkillIRSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RuntimeCheck = z.infer<typeof RuntimeCheckSchema>;
```

- [ ] **Step 4: Run schema tests**

Run:

```powershell
bun test src/skill-ir/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write IR documentation**

Create `docs/skill-ir/skill-ir-v1.md` with the schema overview, field meanings, and one complete JSON example copied from the passing test.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/skill-ir/schema.ts src/skill-ir/schema.test.ts docs/skill-ir/skill-ir-v1.md
git commit -m "feat: define skill ir v1 schema"
```

## Task 2: IR Validator

**Files:**
- Create: `src/skill-ir/validate.ts`
- Create: `src/skill-ir/validate.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `src/skill-ir/validate.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { validateSkillIR } from "./validate";
import type { SkillIR } from "./schema";

const baseIR: SkillIR = {
  schemaVersion: "skill-ir/v1",
  id: "skill-env",
  name: "Environment Skill",
  category: ["environment-sensitive"],
  intent: "Run commands portably.",
  source: { kind: "inline", text: "Use available tools carefully." },
  inputs: [],
  outputs: [{ id: "result", description: "Final result", required: true }],
  preconditions: [],
  steps: [
    {
      id: "step-run",
      title: "Run command",
      description: "Run the selected command.",
      kind: "execute",
      required: true,
      dependsOn: [],
      toolRefs: ["tool-shell"],
      produces: ["command-output"],
      successCheckRefs: ["check-run"],
      failureModes: ["command-missing"],
    },
  ],
  rules: [],
  tools: [
    {
      id: "tool-shell",
      name: "shell",
      purpose: "Execute commands",
      required: true,
      alternatives: ["powershell", "bash"],
      platformNotes: { windows: "Use PowerShell", linux: "Use bash" },
      availabilityCheck: "detect shell",
    },
  ],
  environment: [
    {
      id: "env-os",
      description: "Operating system affects command syntax.",
      platforms: ["windows", "linux"],
      checkability: "runtime",
    },
  ],
  checks: [
    {
      id: "check-run",
      name: "Command succeeded",
      kind: "step-success",
      targetRef: "step-run",
      assertion: "Exit code is zero.",
      onFailure: "fallback",
    },
  ],
  recovery: [],
  profile: [],
};

describe("validateSkillIR", () => {
  test("accepts internally consistent IR", () => {
    expect(validateSkillIR(baseIR).errors).toEqual([]);
  });

  test("reports missing step dependency", () => {
    const ir = structuredClone(baseIR);
    ir.steps[0].dependsOn = ["missing-step"];
    expect(validateSkillIR(ir).errors).toContain("step step-run depends on missing step missing-step");
  });

  test("requires environment assumptions for environment-sensitive skills", () => {
    const ir = structuredClone(baseIR);
    ir.environment = [];
    expect(validateSkillIR(ir).errors).toContain(
      "environment-sensitive skill skill-env must define at least one environment assumption",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
bun test src/skill-ir/validate.test.ts
```

Expected: FAIL because `validateSkillIR` does not exist.

- [ ] **Step 3: Implement validator**

Create `src/skill-ir/validate.ts`:

```ts
import type { SkillIR } from "./schema";

export type ValidationReport = {
  errors: string[];
  warnings: string[];
};

export function validateSkillIR(ir: SkillIR): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stepIds = new Set(ir.steps.map((step) => step.id));
  const toolIds = new Set(ir.tools.map((tool) => tool.id));
  const checkIds = new Set(ir.checks.map((check) => check.id));

  for (const step of ir.steps) {
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) {
        errors.push(`step ${step.id} depends on missing step ${dependency}`);
      }
    }
    for (const toolRef of step.toolRefs) {
      if (!toolIds.has(toolRef)) {
        errors.push(`step ${step.id} references missing tool ${toolRef}`);
      }
    }
    for (const checkRef of step.successCheckRefs) {
      if (!checkIds.has(checkRef)) {
        errors.push(`step ${step.id} references missing check ${checkRef}`);
      }
    }
    if (step.required && step.successCheckRefs.length === 0 && step.produces.length === 0) {
      errors.push(`required step ${step.id} must define a success check or produced artifact`);
    }
  }

  for (const rule of ir.rules) {
    if (rule.severity === "high" && rule.level !== "should" && rule.checkability === "human") {
      warnings.push(`high severity rule ${rule.id} is only human-checkable`);
    }
  }

  if (ir.category.includes("environment-sensitive") && ir.environment.length === 0) {
    errors.push(`environment-sensitive skill ${ir.id} must define at least one environment assumption`);
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Run validator tests**

Run:

```powershell
bun test src/skill-ir/validate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/skill-ir/validate.ts src/skill-ir/validate.test.ts
git commit -m "feat: validate skill ir consistency"
```

## Task 3: Skill Parser

**Files:**
- Create: `src/skill-ir/parser.ts`
- Create: `src/skill-ir/parser.test.ts`

- [ ] **Step 1: Write parser tests for deterministic cleanup**

Create `src/skill-ir/parser.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseSkillIRFromJsonCandidate } from "./parser";

describe("parseSkillIRFromJsonCandidate", () => {
  test("repairs empty id fields with stable generated ids", () => {
    const ir = parseSkillIRFromJsonCandidate({
      schemaVersion: "skill-ir/v1",
      id: "review",
      name: "Review",
      category: ["workflow"],
      intent: "Review changes.",
      source: { kind: "inline", text: "Review skill" },
      inputs: [],
      outputs: [],
      preconditions: [],
      steps: [
        {
          id: "",
          title: "Read files",
          description: "Read changed files.",
          kind: "read",
          required: true,
          dependsOn: [],
          toolRefs: [],
          produces: [],
          successCheckRefs: [],
          failureModes: [],
        },
      ],
      rules: [],
      tools: [],
      environment: [],
      checks: [],
      recovery: [],
      profile: [],
    });

    expect(ir.steps[0].id).toBe("step-read-files");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
bun test src/skill-ir/parser.test.ts
```

Expected: FAIL because parser module does not exist.

- [ ] **Step 3: Implement parser cleanup**

Create `src/skill-ir/parser.ts`:

```ts
import { SkillIRSchema, type SkillIR } from "./schema";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function parseSkillIRFromJsonCandidate(candidate: unknown): SkillIR {
  const draft = structuredClone(candidate) as SkillIR;

  draft.steps = draft.steps.map((step, index) => ({
    ...step,
    id: step.id && step.id.trim().length > 0 ? step.id : `step-${slugify(step.title || `step-${index + 1}`)}`,
  }));

  draft.rules = draft.rules.map((rule, index) => ({
    ...rule,
    id: rule.id && rule.id.trim().length > 0 ? rule.id : `rule-${slugify(rule.normalizedForm || `rule-${index + 1}`)}`,
  }));

  return SkillIRSchema.parse(draft);
}
```

- [ ] **Step 4: Run parser tests**

Run:

```powershell
bun test src/skill-ir/parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add LLM extraction wrapper**

Extend `src/skill-ir/parser.ts` with a prompt-building function that returns a strict JSON extraction prompt:

```ts
export function buildSkillIRExtractionPrompt(skillText: string): string {
  return [
    "Extract Skill IR as strict JSON matching schemaVersion skill-ir/v1.",
    "Represent explicit steps, MUST/NEVER/SHOULD rules, tool requirements, environment assumptions, runtime checks, and recovery policies.",
    "Use empty arrays when information is absent.",
    "Do not include markdown fences.",
    "",
    "Skill text:",
    skillText,
  ].join("\n");
}
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/skill-ir/parser.ts src/skill-ir/parser.test.ts
git commit -m "feat: parse skill text into initial ir candidates"
```

## Task 4: Skill Corpus and IR Examples

**Files:**
- Create: `benchmarks/skill-ir/corpus/manifest.json`
- Create: `benchmarks/skill-ir/ir/*.json`
- Create: `benchmarks/skill-ir/tasks/*.json`
- Create: `benchmarks/skill-ir/contexts/*.json`

- [ ] **Step 1: Create corpus manifest**

Create `benchmarks/skill-ir/corpus/manifest.json`:

```json
{
  "schemaVersion": "skill-ir-corpus/v1",
  "categories": ["workflow", "tool-use", "constraint-heavy", "diagnostic", "generative", "environment-sensitive"],
  "targetCounts": {
    "taxonomySkills": 60,
    "fullIRSkills": 24,
    "deepBenchmarkSkills": 16
  },
  "skills": []
}
```

- [ ] **Step 2: Add first complete IR example**

Create `benchmarks/skill-ir/ir/review-skill.json` using the valid example from Task 1 and run:

```powershell
bun test src/skill-ir/schema.test.ts src/skill-ir/validate.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add context perturbation definitions**

Create `benchmarks/skill-ir/contexts/standard-contexts.json`:

```json
{
  "schemaVersion": "skill-ir-contexts/v1",
  "contexts": [
    {
      "id": "clean",
      "description": "Only task and skill are provided."
    },
    {
      "id": "noisy",
      "description": "Task includes irrelevant prior instructions and distracting files."
    },
    {
      "id": "long",
      "description": "Task includes long surrounding conversation or repository context."
    },
    {
      "id": "compressed",
      "description": "Task includes summarized prior context with missing details."
    }
  ]
}
```

- [ ] **Step 4: Add first task file**

Create `benchmarks/skill-ir/tasks/review-skill-tasks.json`:

```json
{
  "schemaVersion": "skill-ir-tasks/v1",
  "skillId": "skill-review",
  "tasks": [
    {
      "id": "review-finding-order-001",
      "split": "development",
      "prompt": "Review a small change with one obvious behavioral bug and one style issue.",
      "successCriteria": [
        "Findings appear before summary.",
        "Behavioral bug is mentioned.",
        "Style-only issue is lower priority than behavioral bug."
      ]
    }
  ]
}
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add benchmarks/skill-ir
git commit -m "test: seed skill ir corpus and task fixtures"
```

## Task 5: Trace Schema and Profile Annotation

**Files:**
- Create: `src/profiler/trace-schema.ts`
- Create: `src/profiler/trace-schema.test.ts`
- Create: `src/profiler/profile-annotation.ts`
- Create: `src/profiler/profile-annotation.test.ts`

- [ ] **Step 1: Write trace schema test**

Create `src/profiler/trace-schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ExecutionTraceSchema } from "./trace-schema";

describe("ExecutionTraceSchema", () => {
  test("accepts a trace with skipped required step evidence", () => {
    const trace = ExecutionTraceSchema.parse({
      schemaVersion: "skill-ir-trace/v1",
      traceId: "trace-001",
      skillId: "skill-review",
      agent: "codex",
      environment: "windows",
      context: "noisy",
      taskId: "review-finding-order-001",
      success: false,
      tokenCost: 1200,
      latencyMs: 8000,
      events: [
        {
          kind: "rule-violation",
          targetRef: "rule-findings-first",
          message: "Summary appeared before findings.",
        },
      ],
    });

    expect(trace.success).toBe(false);
  });
});
```

- [ ] **Step 2: Implement trace schema**

Create `src/profiler/trace-schema.ts`:

```ts
import { z } from "zod";

export const TraceEventSchema = z.object({
  kind: z.enum(["tool-call", "tool-error", "step-complete", "step-skip", "rule-violation", "output-check"]),
  targetRef: z.string().min(1),
  message: z.string().min(1),
});

export const ExecutionTraceSchema = z.object({
  schemaVersion: z.literal("skill-ir-trace/v1"),
  traceId: z.string().min(1),
  skillId: z.string().min(1),
  agent: z.string().min(1),
  environment: z.string().min(1),
  context: z.string().min(1),
  taskId: z.string().min(1),
  success: z.boolean(),
  tokenCost: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  events: z.array(TraceEventSchema),
});

export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;
```

- [ ] **Step 3: Write profile annotation test**

Create `src/profiler/profile-annotation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildProfileAnnotations } from "./profile-annotation";
import type { ExecutionTrace } from "./trace-schema";

describe("buildProfileAnnotations", () => {
  test("turns repeated rule violations into profile annotations", () => {
    const traces: ExecutionTrace[] = [
      {
        schemaVersion: "skill-ir-trace/v1",
        traceId: "trace-1",
        skillId: "skill-review",
        agent: "codex",
        environment: "windows",
        context: "noisy",
        taskId: "task-1",
        success: false,
        tokenCost: 1000,
        latencyMs: 5000,
        events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
      },
      {
        schemaVersion: "skill-ir-trace/v1",
        traceId: "trace-2",
        skillId: "skill-review",
        agent: "skvm",
        environment: "linux",
        context: "long",
        taskId: "task-2",
        success: false,
        tokenCost: 1100,
        latencyMs: 6000,
        events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
      },
    ];

    expect(buildProfileAnnotations(traces)[0]).toMatchObject({
      targetRef: "rule-findings-first",
      observation: "frequent-failure",
      evidenceCount: 2,
      suggestedPass: "profile-guided-repair",
    });
  });
});
```

- [ ] **Step 4: Implement profile annotation**

Create `src/profiler/profile-annotation.ts`:

```ts
import type { ProfileAnnotation } from "../skill-ir/schema";
import type { ExecutionTrace } from "./trace-schema";

export function buildProfileAnnotations(traces: ExecutionTrace[]): ProfileAnnotation[] {
  const counts = new Map<string, number>();
  const sourceTrace = new Map<string, string>();

  for (const trace of traces) {
    for (const event of trace.events) {
      if (event.kind === "rule-violation" || event.kind === "step-skip" || event.kind === "tool-error") {
        counts.set(event.targetRef, (counts.get(event.targetRef) ?? 0) + 1);
        sourceTrace.set(event.targetRef, trace.traceId);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([targetRef, count]) => ({
      id: `profile-${targetRef}`,
      sourceTrace: sourceTrace.get(targetRef) ?? "unknown",
      targetRef,
      observation: targetRef.startsWith("step-") ? "frequent-skip" : "frequent-failure",
      evidenceCount: count,
      suggestedPass: "profile-guided-repair",
    }));
}
```

- [ ] **Step 5: Run profiler tests**

Run:

```powershell
bun test src/profiler
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/profiler
git commit -m "feat: derive profile annotations from execution traces"
```

## Task 6: AOT Optimization Passes

**Files:**
- Create: `src/skill-ir/passes/rule-normalization.ts`
- Create: `src/skill-ir/passes/rule-normalization.test.ts`
- Create: `src/skill-ir/passes/environment-guards.ts`
- Create: `src/skill-ir/passes/environment-guards.test.ts`
- Create: `src/skill-ir/passes/profile-guided-repair.ts`
- Create: `src/skill-ir/passes/profile-guided-repair.test.ts`

- [ ] **Step 1: Implement rule normalization with tests**

Test behavior:

```ts
import { describe, expect, test } from "bun:test";
import { normalizeRules } from "./rule-normalization";
import type { SkillIR } from "../schema";

describe("normalizeRules", () => {
  test("turns output must rules into runtime output checks", () => {
    const ir = {
      schemaVersion: "skill-ir/v1",
      id: "skill-review",
      name: "Review",
      category: ["constraint-heavy"],
      intent: "Review changes.",
      source: { kind: "inline", text: "Findings must come first." },
      inputs: [],
      outputs: [],
      preconditions: [],
      steps: [],
      rules: [
        {
          id: "rule-findings-first",
          sourceText: "Findings must come first.",
          level: "must",
          scope: "output",
          checkability: "runtime",
          severity: "high",
          normalizedForm: "Output begins with findings.",
        },
      ],
      tools: [],
      environment: [],
      checks: [],
      recovery: [],
      profile: [],
    } satisfies SkillIR;

    expect(normalizeRules(ir).checks[0]).toMatchObject({
      id: "check-rule-findings-first",
      kind: "output",
      targetRef: "rule-findings-first",
    });
  });
});
```

Implementation:

```ts
import type { SkillIR, RuntimeCheck } from "../schema";

export function normalizeRules(ir: SkillIR): SkillIR {
  const existingCheckIds = new Set(ir.checks.map((check) => check.id));
  const generatedChecks: RuntimeCheck[] = [];

  for (const rule of ir.rules) {
    if (rule.checkability !== "runtime") continue;
    const checkId = `check-${rule.id}`;
    if (existingCheckIds.has(checkId)) continue;
    generatedChecks.push({
      id: checkId,
      name: `Check ${rule.id}`,
      kind: rule.scope === "output" ? "output" : "rule-violation",
      targetRef: rule.id,
      assertion: rule.normalizedForm,
      onFailure: rule.severity === "high" ? "abort" : "report",
    });
  }

  return { ...ir, checks: [...ir.checks, ...generatedChecks] };
}
```

- [ ] **Step 2: Implement environment guard insertion with tests**

Expected behavior: each required tool with `availabilityCheck` gets a preflight check.

Implementation shape:

```ts
import type { SkillIR, RuntimeCheck } from "../schema";

export function insertEnvironmentGuards(ir: SkillIR): SkillIR {
  const existing = new Set(ir.checks.map((check) => check.id));
  const guards: RuntimeCheck[] = [];

  for (const tool of ir.tools) {
    const checkId = `preflight-${tool.id}`;
    if (!tool.required || existing.has(checkId)) continue;
    guards.push({
      id: checkId,
      name: `Check ${tool.name} availability`,
      kind: "preflight",
      targetRef: tool.id,
      command: tool.availabilityCheck,
      assertion: `${tool.name} is available or an alternative exists: ${tool.alternatives.join(", ")}`,
      onFailure: tool.alternatives.length > 0 ? "fallback" : "abort",
    });
  }

  return { ...ir, checks: [...guards, ...ir.checks] };
}
```

- [ ] **Step 3: Implement profile-guided repair with tests**

Expected behavior: frequent skipped step adds success check and recovery policy.

Implementation shape:

```ts
import type { SkillIR, RecoveryPolicy, RuntimeCheck } from "../schema";

export function applyProfileGuidedRepair(ir: SkillIR): SkillIR {
  const checks: RuntimeCheck[] = [...ir.checks];
  const recovery: RecoveryPolicy[] = [...ir.recovery];
  const checkIds = new Set(checks.map((check) => check.id));
  const recoveryIds = new Set(recovery.map((policy) => policy.id));

  for (const annotation of ir.profile) {
    if (annotation.observation === "frequent-skip" && annotation.targetRef.startsWith("step-")) {
      const checkId = `check-${annotation.targetRef}-profile`;
      if (!checkIds.has(checkId)) {
        checks.push({
          id: checkId,
          name: `Profile check for ${annotation.targetRef}`,
          kind: "step-success",
          targetRef: annotation.targetRef,
          assertion: "Execution trace contains evidence that this required step completed.",
          onFailure: "retry",
        });
      }
    }

    if (annotation.observation === "frequent-failure") {
      const recoveryId = `recover-${annotation.targetRef}`;
      if (!recoveryIds.has(recoveryId)) {
        recovery.push({
          id: recoveryId,
          trigger: annotation.targetRef,
          action: "retry",
          maxAttempts: 1,
          explanation: `Added because ${annotation.targetRef} failed in ${annotation.evidenceCount} traces.`,
        });
      }
    }
  }

  return { ...ir, checks, recovery };
}
```

- [ ] **Step 4: Run pass tests**

Run:

```powershell
bun test src/skill-ir/passes
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/skill-ir/passes
git commit -m "feat: add skill ir aot optimization passes"
```

## Task 7: Lowering to Controller, Checker, and Adapter

**Files:**
- Create: `src/skill-ir/lowering/controller.ts`
- Create: `src/skill-ir/lowering/checker.ts`
- Create: `src/skill-ir/lowering/adapter.ts`
- Create: `src/skill-ir/lowering/lowering.test.ts`

- [ ] **Step 1: Write lowering tests**

Create `src/skill-ir/lowering/lowering.test.ts` with assertions:

```ts
import { describe, expect, test } from "bun:test";
import { lowerToControllerPlan } from "./controller";
import { lowerToCheckerSpec } from "./checker";
import { lowerToAdapterSpec } from "./adapter";
import type { SkillIR } from "../schema";

const ir: SkillIR = {
  schemaVersion: "skill-ir/v1",
  id: "skill-shell",
  name: "Shell Skill",
  category: ["tool-use", "environment-sensitive"],
  intent: "Run shell commands portably.",
  source: { kind: "inline", text: "Use shell carefully." },
  inputs: [],
  outputs: [],
  preconditions: [],
  steps: [
    {
      id: "step-check-shell",
      title: "Check shell",
      description: "Check shell availability.",
      kind: "verify",
      required: true,
      dependsOn: [],
      toolRefs: ["tool-shell"],
      produces: [],
      successCheckRefs: ["preflight-tool-shell"],
      failureModes: ["missing-shell"],
    },
  ],
  rules: [],
  tools: [
    {
      id: "tool-shell",
      name: "shell",
      purpose: "Execute commands",
      required: true,
      alternatives: ["powershell", "bash"],
      platformNotes: { windows: "Prefer PowerShell", linux: "Prefer bash" },
      availabilityCheck: "detect shell",
    },
  ],
  environment: [],
  checks: [
    {
      id: "preflight-tool-shell",
      name: "Check shell availability",
      kind: "preflight",
      targetRef: "tool-shell",
      command: "detect shell",
      assertion: "shell is available",
      onFailure: "fallback",
    },
  ],
  recovery: [],
  profile: [],
};

describe("lowering", () => {
  test("lowers required steps into controller plan", () => {
    expect(lowerToControllerPlan(ir).steps[0].id).toBe("step-check-shell");
  });

  test("lowers runtime checks into checker spec", () => {
    expect(lowerToCheckerSpec(ir).checks[0].id).toBe("preflight-tool-shell");
  });

  test("lowers tools into adapter spec", () => {
    expect(lowerToAdapterSpec(ir).tools[0].alternatives).toContain("powershell");
  });
});
```

- [ ] **Step 2: Implement controller lowering**

Create `src/skill-ir/lowering/controller.ts`:

```ts
import type { SkillIR } from "../schema";

export type ControllerPlan = {
  skillId: string;
  intent: string;
  steps: {
    id: string;
    title: string;
    kind: string;
    required: boolean;
    dependsOn: string[];
    checks: string[];
  }[];
};

export function lowerToControllerPlan(ir: SkillIR): ControllerPlan {
  return {
    skillId: ir.id,
    intent: ir.intent,
    steps: ir.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      required: step.required,
      dependsOn: step.dependsOn,
      checks: step.successCheckRefs,
    })),
  };
}
```

- [ ] **Step 3: Implement checker lowering**

Create `src/skill-ir/lowering/checker.ts`:

```ts
import type { RuntimeCheck, SkillIR } from "../schema";

export type CheckerSpec = {
  skillId: string;
  checks: RuntimeCheck[];
};

export function lowerToCheckerSpec(ir: SkillIR): CheckerSpec {
  return {
    skillId: ir.id,
    checks: ir.checks,
  };
}
```

- [ ] **Step 4: Implement adapter lowering**

Create `src/skill-ir/lowering/adapter.ts`:

```ts
import type { SkillIR, ToolRequirement } from "../schema";

export type AdapterSpec = {
  skillId: string;
  tools: ToolRequirement[];
};

export function lowerToAdapterSpec(ir: SkillIR): AdapterSpec {
  return {
    skillId: ir.id,
    tools: ir.tools,
  };
}
```

- [ ] **Step 5: Run lowering tests**

Run:

```powershell
bun test src/skill-ir/lowering
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/skill-ir/lowering
git commit -m "feat: lower skill ir into runtime artifacts"
```

## Task 7.5: Literature Calibration And Project Refinement

**Files:**
- Create: `docs/skill-ir/related-work.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`

**Goal:** Strengthen the research basis of the project without restarting the implementation.

- [ ] **Step 1: Read related work**

Read the following work and extract only project-relevant points:

```text
SkillRT / SkVM: skill compilation, capability profiling, portability
SkillsBench: paired skill evaluation, deterministic verifiers, negative deltas
AgentSpec / AgentGuard / C-Trace: runtime enforcement and trace predicates
Reflexion / Voyager / ToolEmu: trace feedback, skill libraries, failure-oriented evaluation
SWE-agent: agent-computer interface design
```

- [ ] **Step 2: Write literature calibration**

Create `docs/skill-ir/related-work.md` with:

```text
Core positioning
Skill evaluation
Runtime enforcement and verification
Trace feedback and skill repair
Agent interfaces
What not to change now
Concrete changes to the project plan
```

- [ ] **Step 3: Update project spec**

Append a literature-calibration section to `docs/skill-ir/skill-ir-aot-optimization-spec.md` that records:

```text
Skill IR remains the core direction.
Benchmarking should use paired comparisons and negative-delta detection.
Checker lowering should be described as lightweight runtime enforcement.
Profile-guided repair should be described as typed trace feedback.
Adapter lowering should be described as an agent-computer interface layer.
```

- [ ] **Step 4: Update implementation plan**

Revise Task 8, Task 9, and Task 10 to include the literature-driven refinements.

- [ ] **Step 5: Verify docs**

Run:

```powershell
rg -n "Task 7.5|paired|negative delta|runtime enforcement|typed trace feedback|AgentSpec|SkillsBench|SkillRT" docs/skill-ir
```

Expected: the new positioning appears in related work, spec, and plan.

- [ ] **Step 6: Commit**

Run:

```powershell
git add docs/skill-ir/related-work.md docs/skill-ir/skill-ir-aot-optimization-spec.md docs/skill-ir/skill-ir-aot-optimization-plan.md
git commit -m "docs: calibrate skill ir plan with related work"
```

## Task 8: Benchmark Matrix

**Files:**
- Create: `src/benchmarks/skill-ir/matrix.ts`
- Create: `src/benchmarks/skill-ir/matrix.test.ts`
- Create: `src/benchmarks/skill-ir/run.ts`

**Literature-driven refinements from Task 7.5:**
- Matrix cases should preserve a stable `caseId` so systems can be compared pairwise on the same skill/task/agent/environment/context cell.
- Systems should include `no-skill`, `original`, `skvm-aot`, `ir-only`, `ir-static`, and `ir-profile` when possible.
- Benchmark metadata should distinguish focused skills from broad skills because broad skill packaging can confound evaluation.
- Later analysis should make negative deltas visible rather than only reporting average improvement.

- [ ] **Step 1: Write matrix tests**

Create `src/benchmarks/skill-ir/matrix.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildExperimentMatrix } from "./matrix";

describe("buildExperimentMatrix", () => {
  test("creates Cartesian product of selected dimensions", () => {
    const matrix = buildExperimentMatrix({
      skills: ["skill-review"],
      agents: ["skvm", "codex"],
      environments: ["linux"],
      contexts: ["clean", "noisy"],
      tasks: ["task-1", "task-2"],
      systems: ["original", "ir-static"],
    });

    expect(matrix).toHaveLength(16);
    expect(matrix[0]).toMatchObject({
      skill: "skill-review",
      agent: "skvm",
      environment: "linux",
      context: "clean",
      task: "task-1",
      system: "original",
    });
  });
});
```

- [ ] **Step 2: Implement matrix builder**

Create `src/benchmarks/skill-ir/matrix.ts`:

```ts
export type ExperimentSystem = "no-skill" | "original" | "skvm-aot" | "ir-only" | "ir-static" | "ir-profile";

export type MatrixInput = {
  skills: string[];
  agents: string[];
  environments: string[];
  contexts: string[];
  tasks: string[];
  systems: ExperimentSystem[];
};

export type ExperimentCase = {
  caseId: string;
  skill: string;
  agent: string;
  environment: string;
  context: string;
  task: string;
  system: ExperimentSystem;
};

export function buildExperimentMatrix(input: MatrixInput): ExperimentCase[] {
  const cases: ExperimentCase[] = [];
  for (const skill of input.skills) {
    for (const agent of input.agents) {
      for (const environment of input.environments) {
        for (const context of input.contexts) {
          for (const task of input.tasks) {
            const caseId = `${skill}:${agent}:${environment}:${context}:${task}`;
            for (const system of input.systems) {
              cases.push({ caseId, skill, agent, environment, context, task, system });
            }
          }
        }
      }
    }
  }
  return cases;
}
```

- [ ] **Step 3: Add runner skeleton**

Create `src/benchmarks/skill-ir/run.ts`:

```ts
import { buildExperimentMatrix } from "./matrix";

const matrix = buildExperimentMatrix({
  skills: ["skill-review"],
  agents: ["skvm", "codex"],
  environments: ["linux", "windows"],
  contexts: ["clean", "noisy", "long", "compressed"],
  tasks: ["review-finding-order-001"],
  systems: ["no-skill", "original", "skvm-aot", "ir-only", "ir-static", "ir-profile"],
});

console.log(JSON.stringify({ count: matrix.length, matrix }, null, 2));
```

- [ ] **Step 4: Run matrix tests**

Run:

```powershell
bun test src/benchmarks/skill-ir/matrix.test.ts
bun src/benchmarks/skill-ir/run.ts
```

Expected: test passes and runner prints a JSON object with `count`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/benchmarks/skill-ir
git commit -m "feat: build skill ir experiment matrix"
```

## Task 9: Result Analysis Script

**Files:**
- Create: `scripts/analyze_skill_ir_results.py`

**Literature-driven refinements from Task 7.5:**
- The analyzer should support paired comparison by `caseId`.
- The analyzer should report `regression_count`: cases where an optimized system fails while the baseline succeeds.
- The analyzer should report delta metrics against `original` or another configured baseline.
- Summary tables should preserve mean success, worst-case success, variance, rule violations, and negative-delta visibility.

- [ ] **Step 1: Create analyzer**

Create `scripts/analyze_skill_ir_results.py`:

```python
import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def summarize(rows):
    by_system = defaultdict(list)
    by_setting = defaultdict(list)
    violations = defaultdict(int)

    for row in rows:
        system = row["system"]
        success = 1.0 if row["success"] else 0.0
        by_system[system].append(success)
        setting = (system, row["agent"], row["environment"], row["context"])
        by_setting[setting].append(success)
        violations[system] += int(row.get("ruleViolations", 0))

    summary = []
    for system, values in sorted(by_system.items()):
        setting_rates = [
            sum(v) / len(v)
            for (setting_system, _agent, _environment, _context), v in by_setting.items()
            if setting_system == system
        ]
        summary.append(
            {
                "system": system,
                "mean_success": sum(values) / len(values),
                "worst_case_success": min(setting_rates),
                "variance": statistics.pvariance(setting_rates) if len(setting_rates) > 1 else 0.0,
                "rule_violations": violations[system],
            }
        )
    return summary


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: python scripts/analyze_skill_ir_results.py input.jsonl output.csv")

    rows = list(read_jsonl(Path(sys.argv[1])))
    summary = summarize(rows)

    with Path(sys.argv[2]).open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["system", "mean_success", "worst_case_success", "variance", "rule_violations"],
        )
        writer.writeheader()
        writer.writerows(summary)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test analyzer with sample data**

Run:

```powershell
@'
{"system":"original","agent":"a1","environment":"linux","context":"clean","success":true,"ruleViolations":0}
{"system":"original","agent":"a1","environment":"linux","context":"noisy","success":false,"ruleViolations":1}
{"system":"ir-profile","agent":"a1","environment":"linux","context":"clean","success":true,"ruleViolations":0}
{"system":"ir-profile","agent":"a1","environment":"linux","context":"noisy","success":true,"ruleViolations":0}
'@ | Set-Content -Encoding UTF8 results/skill-ir/sample.jsonl
python scripts/analyze_skill_ir_results.py results/skill-ir/sample.jsonl results/skill-ir/sample.csv
Get-Content results/skill-ir/sample.csv
```

Expected: `ir-profile` has `mean_success` 1.0 and fewer rule violations than `original`.

Before expanding this analyzer for the final experiment, add tests for paired `caseId` deltas:

```json
{"caseId":"skill-review:a1:linux:clean:task-1","system":"original","agent":"a1","environment":"linux","context":"clean","success":true,"ruleViolations":0}
{"caseId":"skill-review:a1:linux:clean:task-1","system":"ir-profile","agent":"a1","environment":"linux","context":"clean","success":false,"ruleViolations":1}
```

Expected: `ir-profile` records one regression against `original`.

- [ ] **Step 3: Commit**

Run:

```powershell
git add scripts/analyze_skill_ir_results.py results/skill-ir/sample.jsonl results/skill-ir/sample.csv
git commit -m "feat: summarize skill ir benchmark results"
```

## Task 10: Experiment Documentation

**Files:**
- Create: `docs/skill-ir/experiment-design.md`

**Literature-driven refinements from Task 7.5:**
- Cite the need for paired evaluation and deterministic verifiers.
- Include `no-skill` and `original` baselines before optimized Skill IR systems.
- Track negative deltas, not only average improvements.
- Treat checker lowering as runtime enforcement.
- Treat profile-guided repair as typed trace feedback.
- Treat adapter lowering as an agent-computer interface layer.

- [ ] **Step 1: Write experiment design document**

Create `docs/skill-ir/experiment-design.md` with these sections:

```markdown
# Skill IR Experiment Design

## Research Questions

1. Does Skill IR improve mean task success across agents, environments, and contexts?
2. Does Skill IR improve worst-case success?
3. Does Skill IR reduce variance across settings?
4. Which optimization pass contributes most to reduced rule violations and skipped required steps?
5. How often does an optimized system regress relative to the original skill on paired cases?

## Systems Compared

- S0 No skill
- S1 Original natural-language skill
- S2 SkVM AOT baseline
- S3 Initial Skill IR only
- S4 Skill IR with static AOT passes
- S5 Skill IR with static AOT passes and profile-guided optimization

## Metrics

- Mean Success Rate
- Worst-case Success Rate
- Variance across settings
- Paired Delta vs Original
- Regression Count
- Rule Violation Rate
- Step Coverage
- Required Step Skip Rate
- Token Cost
- Latency

## Skill Selection

The corpus contains 40-60 categorized skills, 18-24 full IR skills, and 12-16 deep benchmark skills.

## Ablations

- Full
- No Profile
- No Environment Guard
- No Checker
- No Rule Normalization
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/skill-ir/experiment-design.md
git commit -m "docs: describe skill ir experiment design"
```

## Task 11A: Small-Scale Real-Agent Dry Run Harness

**Files:**
- Create: `src/benchmarks/skill-ir/real-agent.ts`
- Create: `src/benchmarks/skill-ir/real-agent.test.ts`
- Create: `src/benchmarks/skill-ir/real-agent-run.ts`
- Create: `src/benchmarks/skill-ir/scoring.ts`
- Create: `src/benchmarks/skill-ir/scoring.test.ts`
- Create: `src/benchmarks/skill-ir/score-real-agent-runs.ts`
- Create: `docs/skill-ir/real-agent-dry-run.md`
- Create: `docs/skill-ir/real-agent-scoring.md`

**Goal:** Connect the Skill IR benchmark matrix to real `skvm run` commands before expanding the deep benchmark corpus.

- [ ] **Step 1: Write helper tests**

Cover:

```text
Skill IR task -> SkVM task.json
Skill IR system -> SKILL.md
Materialized case -> task/skill files
Materialized case -> bun run skvm run command
```

- [ ] **Step 2: Implement materialization helpers**

Implement helpers for:

```text
buildSkvmTaskJson
renderSkillMarkdown
materializeCaseArtifacts
buildSkvmRunCommand
buildRunPlanEntry
```

- [ ] **Step 3: Implement dry-run CLI**

Create a CLI that writes:

```text
results/skill-ir/real-agent-dry-run/plan.json
```

and only executes real agents when `--execute` is passed.

- [ ] **Step 4: Verify dry-run**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

Expected: tests pass and `plan.json` contains runnable `bun run skvm run` commands.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/benchmarks/skill-ir/real-agent.ts src/benchmarks/skill-ir/real-agent.test.ts src/benchmarks/skill-ir/real-agent-run.ts docs/skill-ir/real-agent-dry-run.md docs/skill-ir/skill-ir-aot-optimization-plan.md
git commit -m "feat: prepare skill ir real-agent dry run"
```

- [ ] **Step 6: Write scoring-layer tests**

Cover:

```text
caseId -> benchmark dimensions
SkVM stdout -> final output
task successCriteria -> success/ruleViolations/stepCoverage
raw-runs.jsonl row -> analyzer-compatible result row
CLI raw-runs.jsonl -> main-results.jsonl
```

- [ ] **Step 7: Implement deterministic seed scorer**

Create a scorer that supports the current seed review criteria:

```text
Findings appear before summary.
Behavioral bug is mentioned.
Style-only issue is lower priority than behavioral bug.
Missing or insufficient tests are mentioned.
The finding explains the user-visible or regression risk.
```

Unsupported criteria should fail closed so new task types do not accidentally look successful.

- [ ] **Step 8: Implement scoring CLI**

Create a CLI that reads:

```text
results/skill-ir/real-agent-dry-run/raw-runs.jsonl
benchmarks/skill-ir/tasks/review-skill-tasks.json
```

and writes:

```text
results/skill-ir/main-results.jsonl
```

Run:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--tasks=benchmarks/skill-ir/tasks/review-skill-tasks.json' '--out=results/skill-ir/main-results.jsonl'
```

- [ ] **Step 9: Verify scoring**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/scoring.test.ts
bun test ./src/benchmarks/skill-ir/matrix.test.ts ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
bun run typecheck
```

Expected: scoring tests pass and scored rows can be fed into `scripts/analyze_skill_ir_results.py`.

- [ ] **Step 10: Commit scoring layer**

Run:

```powershell
git add src/benchmarks/skill-ir/scoring.ts src/benchmarks/skill-ir/scoring.test.ts src/benchmarks/skill-ir/score-real-agent-runs.ts docs/skill-ir/real-agent-scoring.md docs/skill-ir/real-agent-dry-run.md docs/skill-ir/result-analysis.md docs/skill-ir/skill-ir-aot-optimization-plan.md
git commit -m "feat: score skill ir real-agent runs"
```

- [ ] **Step 11: Run real-agent smoke evaluation**

Use a configured provider route and a low-cost model to run a small clean-context matrix before expanding the corpus.

Recommended first smoke:

```text
2 review tasks x 6 systems x 1 agent x 1 environment x 1 context
```

Record:

```text
results/skill-ir/smoke-results-<date>.jsonl
results/skill-ir/smoke-table-<date>.csv
docs/skill-ir/real-agent-smoke-run.md
```

If raw execution rows contain provider/network failures, mark them as infrastructure failures in scored JSONL and do not treat them as final skill regressions.

- [ ] **Step 12: Add retry and failure accounting**

Before scaling Task 11B, add:

```text
real-agent execution retry for infrastructure failures
scored JSONL failureType field
CSV infrastructure_failures and agent_failures columns
```

Run real-agent smoke commands with a small retry budget when using unstable gateways:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=12' '--systems=no-skill,original,skvm-aot,ir-only,ir-static,ir-profile' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--retries=1' '--retry-delay-ms=1000'
```

Expected: provider timeouts are either retried successfully or counted as `infrastructure_failures`, not as rule violations.

Paired deltas should skip infrastructure-failure rows on either side so optimized systems are not rewarded or punished for provider instability.

## Task 11B: Full Evaluation Run

**Files:**
- Create: `results/skill-ir/main-results.jsonl`
- Create: `results/skill-ir/main-table.csv`
- Create: `results/skill-ir/ablation.csv`
- Create: `docs/skill-ir/case-studies.md`

Task 11B should consume scored `main-results.jsonl`, not execution-only `raw-runs.jsonl`. If the real execution path produces only raw logs, run `score-real-agent-runs.ts` first.

- [ ] **Step 1: Populate deep benchmark**

Add 12-16 deep benchmark skills and 8-12 tasks per deep skill to `benchmarks/skill-ir/tasks/`.

Expected: each task has `id`, `split`, `prompt`, and `successCriteria`.

Before running an expanded matrix, verify that `buildDefaultMatrixInput()` produces `tasksBySkill` entries for every deep benchmark skill. Task ownership must stay skill-specific; the flattened `tasks` list is only for compatibility and should not cause one skill to be paired with another skill's task.

The real-agent runner now loads each skill's `irPath` and `tasksPath` from the corpus manifest. For expanded Task 11B runs, add new skill IR and task files to the manifest first, then use the dry-run plan to check that materialized cases use the correct skill-specific IR and task prompts.

The scorer now supports manifest-based task indexing. For multi-skill Task 11B runs, prefer `score-real-agent-runs.ts --manifest=benchmarks/skill-ir/corpus/manifest.json` instead of `--tasks=<single task file>`, so task lookup is scoped by `skillId:taskId`.

- [ ] **Step 2: Run all configured systems**

Run:

```powershell
bun src/benchmarks/skill-ir/run.ts
```

Expected: matrix count matches the configured number of systems, agents, environments, contexts, skills, and tasks.

- [ ] **Step 3: Export results to JSONL**

Write each experiment result as one JSON object per line in `results/skill-ir/main-results.jsonl` with fields:

```json
{
  "system": "ir-profile",
  "skill": "skill-review",
  "agent": "codex",
  "environment": "linux",
  "context": "clean",
  "task": "review-finding-order-001",
  "success": true,
  "ruleViolations": 0,
  "stepCoverage": 1.0,
  "tokenCost": 1200,
  "latencyMs": 8000
}
```

- [ ] **Step 4: Analyze results**

Run:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

Expected: `main-table.csv` contains one row per system.

- [ ] **Step 5: Write case studies**

Create `docs/skill-ir/case-studies.md` with three cases:

```markdown
# Skill IR Case Studies

## Case 1: Constraint-heavy Skill

Describe the original failure, extracted rules, generated checks, and post-optimization result.

## Case 2: Environment-sensitive Skill

Describe the original platform failure, inserted environment guards, adapter behavior, and post-optimization result.

## Case 3: Diagnostic Skill

Describe the trace failure, profile annotation, generated recovery policy, and post-optimization result.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add results/skill-ir docs/skill-ir/case-studies.md
git commit -m "test: evaluate skill ir optimization across settings"
```

## Task 12: Research Report and Slides

**Files:**
- Create: `report/skill-ir-report.md`
- Create: `slides/skill-ir-outline.md`
- Create: `demo/README.md`

- [ ] **Step 1: Create report skeleton**

Create `report/skill-ir-report.md`:

```markdown
# Skill IR: A Structured Intermediate Representation for Cross-Agent Skill Optimization

## Abstract

This report studies Skill IR, a structured intermediate representation for natural-language skills in agent systems.

## 1. Introduction

Natural-language skills are flexible but unstable across agents, environments, and contexts.

## 2. Background

Describe SkVM, skill profiling, AOT optimization, and why skill semantics need an explicit IR.

## 3. Skill IR

Describe schema, steps, rules, tools, environment assumptions, checks, recovery policies, and profile annotations.

## 4. AOT Optimization Passes

Describe parsing, validation, rule normalization, environment guard insertion, profile-guided repair, and lowering.

## 5. Evaluation

Describe corpus, agents, environments, contexts, tasks, metrics, and systems compared.

## 6. Results

Summarize main table, variance reduction, worst-case improvement, rule violation reduction, and ablations.

## 7. Case Studies

Summarize three representative skills.

## 8. Limitations

Discuss parser reliability, human judgment for some tasks, and incomplete OS coverage.

## 9. Conclusion

Skill IR makes skill execution more explicit, checkable, and optimizable.
```

- [ ] **Step 2: Create slide outline**

Create `slides/skill-ir-outline.md`:

```markdown
# Skill IR Presentation Outline

1. Problem: skills are unstable across agents, environments, and contexts
2. Key idea: natural language skill -> Skill IR -> AOT passes -> runtime artifacts
3. Skill IR schema
4. AOT pass pipeline
5. Profile-guided optimization
6. Experiment matrix
7. Main results
8. Ablation
9. Case studies
10. Takeaways
```

- [ ] **Step 3: Create demo README**

Create `demo/README.md`:

```markdown
# Skill IR Demo

The demo shows one original skill and one optimized Skill IR execution.

## Run

```powershell
bun src/benchmarks/skill-ir/run.ts
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

## Expected Output

- Optimized IR includes generated checks and environment guards.
- Result table shows mean success, worst-case success, variance, and rule violations.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add report slides demo
git commit -m "docs: draft skill ir research report and demo"
```

## Quality Gates

Run before claiming implementation complete:

```powershell
bun test
bun src/benchmarks/skill-ir/run.ts
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

Expected:

- TypeScript tests pass.
- Benchmark runner emits configured experiment cases.
- Analyzer writes a CSV with one row per compared system.
- Report contains main results, ablation, and case studies.

## Self-Review Checklist

- Every spec requirement maps to a task:
  - IR schema: Task 1
  - validation: Task 2
  - parser: Task 3
  - corpus: Task 4
  - profiling: Task 5
  - AOT passes: Task 6
  - lowering: Task 7
  - benchmark matrix: Task 8
  - result analysis: Task 9
  - experiment docs: Task 10
  - evaluation: Task 11
  - report/demo: Task 12
- No task depends on hidden code.
- Tests are introduced before implementation for core modules.
- The implementation can start with independent Skill IR modules before touching SkVM internals.
- The plan supports a broad version: 40-60 taxonomy skills, 18-24 full IR skills, 12-16 deep benchmark skills.
