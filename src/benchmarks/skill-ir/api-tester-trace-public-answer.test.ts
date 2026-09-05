import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  API_TESTER_TRACE_IDENTITY,
  ApiTesterTraceDryRunReportSchema,
  ApiTesterTraceSchema,
  buildPublicAnswerFromTask,
  compareTraceToPublicAnswer,
  createTraceForPublicAnswer,
  runApiTesterTracePublicAnswerDryRun,
} from "./api-tester-trace-public-answer.ts"

type Task = { id: string; split: string; fixtures: Record<string, string> }

async function developmentTasks(): Promise<Task[]> {
  const value = JSON.parse(await readFile(
    join(process.cwd(), "benchmarks/skill-ir/pilots/api-tester/development/tasks.json"),
    "utf8",
  )) as { tasks: Task[] }
  return value.tasks
}

describe("API Tester trace + public-answer protocol", () => {
  test("derives a public operation answer independently for both development fixtures", async () => {
    const answers = (await developmentTasks()).map(buildPublicAnswerFromTask)
    expect(answers.every((answer) => answer.identity === API_TESTER_TRACE_IDENTITY)).toBe(true)
    expect(answers.map((answer) => answer.operations.length)).toEqual([2, 2])
    expect(answers.flatMap((answer) => answer.operations).every((operation) => operation.ref.startsWith("operation:"))).toBe(true)
    expect(JSON.stringify(answers)).not.toMatch(/gold|evaluator|reasoning|workdir|absolute/iu)
  })

  test("accepts an exact baseline and classifies a missing-step mutation", async () => {
    for (const task of await developmentTasks()) {
      const answer = buildPublicAnswerFromTask(task)
      const baseline = createTraceForPublicAnswer(answer, 1)
      expect(compareTraceToPublicAnswer(baseline, answer)).toMatchObject({ parity: "exact", pass: true })
      const mutation = structuredClone(baseline)
      mutation.orderedDecisionSteps.shift()
      mutation.orderedDecisionSteps.forEach((step, index) => {
        step.stepIndex = index
        step.selectedNextStep = index + 1 < mutation.orderedDecisionSteps.length ? String(index + 1) : null
      })
      expect(compareTraceToPublicAnswer(mutation, answer)).toMatchObject({ parity: "missing", pass: false })
    }
  })

  test("distinguishes equivalent normalization, extra operations, ambiguity, and invalid traces", async () => {
    const answer = buildPublicAnswerFromTask((await developmentTasks())[0]!)
    const baseline = createTraceForPublicAnswer(answer, 1)

    const equivalent = structuredClone(baseline)
    equivalent.orderedDecisionSteps[0]!.method = equivalent.orderedDecisionSteps[0]!.method.toLowerCase()
    equivalent.orderedDecisionSteps[0]!.operation = equivalent.orderedDecisionSteps[0]!.operation.toLowerCase()
    equivalent.orderedDecisionSteps[0]!.path += "/"
    expect(compareTraceToPublicAnswer(equivalent, answer)).toMatchObject({ parity: "equivalent", pass: true })

    const extra = structuredClone(baseline)
    extra.orderedDecisionSteps.push({
      ...extra.orderedDecisionSteps[0]!,
      stepIndex: extra.orderedDecisionSteps.length,
      method: "DELETE",
      path: "/undocumented",
      operation: "DELETE /undocumented",
      selectedNextStep: null,
      expectedAnswerRef: "operation:DELETE:/undocumented",
    })
    extra.orderedDecisionSteps[1]!.selectedNextStep = "2"
    expect(compareTraceToPublicAnswer(extra, answer)).toMatchObject({ parity: "extra", pass: false })

    const ambiguous = structuredClone(baseline)
    ambiguous.orderedDecisionSteps[1]!.method = ambiguous.orderedDecisionSteps[0]!.method
    ambiguous.orderedDecisionSteps[1]!.path = ambiguous.orderedDecisionSteps[0]!.path
    ambiguous.orderedDecisionSteps[1]!.operation = ambiguous.orderedDecisionSteps[0]!.operation
    ambiguous.orderedDecisionSteps[1]!.expectedAnswerRef = ambiguous.orderedDecisionSteps[0]!.expectedAnswerRef
    expect(compareTraceToPublicAnswer(ambiguous, answer)).toMatchObject({ parity: "ambiguous", pass: false })

    const invalid = structuredClone(baseline)
    invalid.orderedDecisionSteps[0]!.inputShapeDigest = "not-a-digest"
    expect(compareTraceToPublicAnswer(invalid, answer)).toMatchObject({ parity: "invalid", pass: false })
  })

  test("rejects forbidden trace sinks and preserves a strict public schema", async () => {
    const answer = buildPublicAnswerFromTask((await developmentTasks())[0]!)
    const trace = createTraceForPublicAnswer(answer, 1)
    expect(() => ApiTesterTraceSchema.parse({ ...trace, rawReasoning: "hidden" })).toThrow()
    const unsafe = structuredClone(trace) as typeof trace & { orderedDecisionSteps: Array<Record<string, unknown>> }
    unsafe.orderedDecisionSteps[0]!.selectedNextStep = "D:/private/workdir"
    expect(compareTraceToPublicAnswer(unsafe, answer)).toMatchObject({ parity: "invalid", pass: false })
  })

  test("writes a zero-activity baseline-pass/mutation-fail dry-run report", async () => {
    const out = await mkdtemp(join(tmpdir(), "skvm-api-trace-dry-run-"))
    try {
      const report = await runApiTesterTracePublicAnswerDryRun({ rootDir: process.cwd(), outDir: join(out, "report") })
      expect(report.status).toBe("passed")
      expect(report.rows).toHaveLength(4)
      expect(report.rows.filter((row) => row.kind === "baseline-pass").every((row) => row.parity === "exact" && row.pass)).toBe(true)
      expect(report.rows.filter((row) => row.kind === "mutation-fail").every((row) =>
        row.parity === "missing" && !row.pass)).toBe(true)
      const invalidReport = structuredClone(report) as unknown as {
        rows: Array<{ kind: string; parity: string }>
      }
      invalidReport.rows.find((row) => row.kind === "mutation-fail")!.parity = "invalid"
      expect(() => ApiTesterTraceDryRunReportSchema.parse(invalidReport)).toThrow()
      const duplicateReport = structuredClone(report)
      duplicateReport.rows[1] = structuredClone(duplicateReport.rows[0]!)
      expect(() => ApiTesterTraceDryRunReportSchema.parse(duplicateReport)).toThrow()
      expect(report.accounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 })
      expect(report.identity).toBe(API_TESTER_TRACE_IDENTITY)
      expect(await readFile(join(out, "report", "dry-run-report.json"), "utf8")).toContain("baseline-pass")
    } finally {
      await rm(out, { recursive: true, force: true })
    }
  })
})
