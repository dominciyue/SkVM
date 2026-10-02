import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainScheduler } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-scheduler.ts"
import { checkControlConclusions } from "../../../../../src/task-dsl/authorization/control-conclusion.ts"
import { validateAuthorizationInquiryResult } from "../../../../../src/task-dsl/authorization/inquiry-result.ts"

const base = import.meta.dir, runPath = path.join(base, "probes/wire-4/run/sessions/2026-10-02T032612533Z-033bfb3d/run.json")
const run = JSON.parse(await readFile(runPath, "utf8")), loaded = await loadInquiryInput(path.join(base, "probes/wire-1/input.json"))
if (loaded.inputSha256 !== createHash("sha256").update(await readFile(path.join(path.dirname(runPath), "input.json"), "utf8")).digest("hex")) throw new Error("Probe input changed")
const tools = await createInquiryTools({ ...loaded.context, maxToolCalls: 8 })
if (!isDeepStrictEqual(tools.files, run.sourceFiles)) throw new Error("Original indexed source changed; this repair replay is invalid")
for (const action of run.toolHistory) {
  const output = await tools.execute(action.name, action.arguments)
  if (output.status === "error") throw new Error(`Original read cannot be replayed: ${output.code}`)
}
if (!isDeepStrictEqual(tools.evidence, run.evidence)) throw new Error("Replayed original evidence differs from retained source")
const scheduler = createInquiryDomainScheduler({ tools }); await scheduler.run(run.domain.slice, 0)
const check = checkControlConclusions(run.program, run.domain.slice, run.final, scheduler.snapshot())
const validation = validateAuthorizationInquiryResult(run.program, run.final, { questionIds: run.program.questions.map((q: any) => q.id), shownEvidenceIds: tools.evidence.map(e => e.id) }, check)
if (!validation.valid || check.taskResolution !== "bounded" || scheduler.snapshot()[0]?.state !== "checked") throw new Error("Same-response locator repair did not close the actually read dependency")
const implementationFiles = ["src/benchmarks/authorization-dsl/inquiry-domain-scheduler.ts", "src/task-dsl/authorization/control-conclusion.ts", "src/benchmarks/authorization-dsl/inquiry-wire.ts"]
const sourceDigests = await Promise.all(implementationFiles.map(async file => ({ file, sha256: createHash("sha256").update(await readFile(path.resolve(base, "../../../../..", file))).digest("hex") })))
const report = { at: new Date().toISOString(), originalArtifact: path.relative(base, runPath).replaceAll("\\", "/"), implementationRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), workingTreeModified: !!execFileSync("git", ["status", "--porcelain", "--", ...implementationFiles], { encoding: "utf8" }).trim(), sourceDigests, previous: { validation: run.validation, dependencies: run.domain.dependencies, taskResolution: run.domain.check.taskResolution }, current: { validation, dependencies: scheduler.snapshot(), check }, originalResponseChanged: false, actualSourceReloaded: true, providerCalls: 0, targetExecutions: 0, semanticReview: "main agent checked the four original source lines against both branches; not an independent quality-panel review" }
await writeFile(path.join(base, "post-wire-4-replay.json"), JSON.stringify(report, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ valid: validation.valid, previousResolution: report.previous.taskResolution, currentResolution: check.taskResolution, dependency: scheduler.snapshot()[0], providerCalls: 0, originalResponseChanged: false }))
