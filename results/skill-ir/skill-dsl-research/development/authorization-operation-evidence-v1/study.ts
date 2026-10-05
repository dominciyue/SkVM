import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { operationWork } from "../../../../../src/benchmarks/authorization-dsl/operation-work.ts"
import { developRows, mechanicalReview, retainLocalRun, replay as retainedReplay, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const at = path.resolve(root, "../authorization-focused-closure-v1")
export const tasks = ["owui-ingestion", "paperless-download", "paperless-share-create", "gitea-create-issue"] as const
export const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export interface Position { id: string; task: string; kind: string; arm: string; variant?: string; route?: string; change?: string }
export function plannedPositions(): Position[] {
  return [
    ...["paperless-share-create", "gitea-create-issue"].map(task => ({ id: `debug-${task}`, task, kind: "debug", arm: "D-O" })),
    ...["paperless-share-create", "gitea-create-issue"].flatMap(task => ["original", "changed"].map(variant => ({ id: `native-${task}-${variant}`, task, kind: "native", arm: "M-O", variant }))),
    ...["paperless-share-create", "gitea-create-issue"].flatMap(task => ["original", "changed"].map(variant => ({ id: `author-${task}-${variant}`, task, kind: "author", arm: "D-O", variant }))),
    ...["paperless-share-create", "gitea-create-issue"].flatMap(task => ["original", "changed"].map(variant => ({ id: `consume-${task}-${variant}`, task, kind: "consumer", arm: "D-O", variant }))),
    ...["policy", "premise", "source"].flatMap(change => ["fresh", "materials-previous"].map(route => ({ id: `change-${change}-${route}`, task: "paperless-share-create", kind: "variation", arm: "D-O", change, route }))),
    ...tasks.flatMap(task => ["N", "M-O", "D-O"].map(arm => ({ id: `quality-${task}-${arm}`, task, kind: "quality", arm }))),
  ]
}
export function modelInputPath(file: string) {
  if (!tasks.some(t => file === `model/inputs/${t}.json`)) throw new Error("Unregistered model input: evaluation and repair evidence are never runtime inputs")
  return path.join(root, file)
}
export function selectDebugRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: Position) => r.id === id && r.kind === "debug")
  if (matches.length !== 1) throw new Error("Use one registered AU debug position")
  const position: Position = matches[0], input = manifest.inputs.find((i: any) => i.id === position.task)
  if (!tasks.some(t => t === position.task) || manifest.inheritedSeals.sealedTasks.includes(position.task) || !input?.sha256) throw new Error("Unregistered or sealed logical task")
  modelInputPath(input.file)
  const row: Row & Position = { ...position, method: "D1", strategy: "operation-evidence-v1", components: ["wire", "source", "checker", "worklist", "delivery"] }
  return { row, input }
}
export async function develop(id: string, repairId?: string, repairOf?: string) {
  await check()
  const manifest = await json(path.join(root, "manifest.json")), { row, input } = selectDebugRow(manifest, id)
  await assertNoUnknownTask(root, row.task)
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), status = await json(path.join(root, "status.json"))
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage: "AU10", codeRevision: revision, active: [{ id, repairId: repairId ?? null, repairOf: repairOf ?? null }], nextAction: "Retain first answer, inspect source quality and repair any shared defect before subsequent positions" }, null, 2) + "\n")
  const output = await developRows(root, [row], { revision, model: manifest.testedModel, budgets: { ...manifest.budgets, sourceInput: input }, repairId, repairOf,
    execute: async (_registered, outDir) => retainLocalRun(await executeLocalInquiryRun({ inputFile: modelInputPath(input.file), outDir, model: manifest.testedModel, method: row.method, strategy: "operation-evidence-v1", execution: manifest.budgets })), evaluate: async (_row, report) => mechanicalReview(report) })
  const retained = await retainedReplay(root)
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage: "AU10", codeRevision: revision, active: [], providerCalls: retained.rows.reduce((sum, r) => sum + r.knownProviderCalls, 0), lastKnownRequest: output.rows, nextAction: "Independent source review of retained debug; repair and same-task verification before panels", positions: status.positions.map((p: any) => ({ ...p, ...(output.rows.find((r: any) => r.id === p.id) ?? {}) })) }, null, 2) + "\n")
  return output
}
export async function replay() {
  await check()
  const manifest = await json(path.join(root, "manifest.json")), retained = await retainedReplay(root)
  return { ...retained, schemaVersion: "authorization-au-replay/v1", registeredPositions: 32, rows: manifest.rows.map((r: Position) => ({ id: r.id, kind: r.kind, ...retained.rows.find(v => v.id === r.id), ...(retained.rows.some(v => v.id === r.id) ? {} : { status: "not-dispatched", knownProviderCalls: 0 }) })) }
}
export async function initialize() {
  const old = await json(path.join(at, "manifest.json")), inherited = await readFile(path.join(at, "inherited-seals.json"))
  await mkdir(path.join(root, "model/inputs"), { recursive: true })
  await mkdir(path.join(root, "evaluations"), { recursive: true })
  await mkdir(path.join(root, "repair-events"), { recursive: true })
  const inputs = []
  for (const id of tasks) {
    const task = old.tasks.find((t: any) => t.id === id), file = path.join(at, task.activeInput?.file ?? task.inputFile), raw = await readFile(file), input = JSON.parse(raw.toString())
    const destination = modelInputPath(`model/inputs/${id}.json`)
    input.sourceRoot = path.relative(path.dirname(destination), path.resolve(path.dirname(file), input.sourceRoot)).split(path.sep).join("/")
    await save(destination, input)
    inputs.push({ id, file: `model/inputs/${id}.json`, sha256: sha(await readFile(destination)), inheritedFrom: path.relative(root, file).split(path.sep).join("/"), inheritedSha256: sha(raw), changes: ["sourceRoot mechanical rebasing only"], repository: input.repository, sourceRef: input.sourceRef,
      skill: path.relative(root, path.resolve(at, old.rows.find((r: any) => r.kind === "native" && r.task === (id === "gitea-create-issue" ? id : "paperless-share-create")).sourceSkill)).split(path.sep).join("/") })
  }
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  await save(path.join(root, "manifest.json"), { schemaVersion: "authorization-au-manifest/v1", development: "adaptive-exposed", baselineRevision: revision, researchBaseline: "ba27716041d4e6e5f6f8f3a51e694e25c49323d4", developerModel: "gpt-6.1-sol / max", testedModel: old.testedModel, cachePath: old.cachePath,
    budgets: { maxDispatches: 24, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, maxFiles: 512, maxTokens: 6000, perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000 }, inputs, rows: plannedPositions(), ablationsMaximum: 4,
    inheritedSeals: { file: "../authorization-focused-closure-v1/inherited-seals.json", sha256: sha(inherited), sealedTasks: JSON.parse(inherited.toString()).sealedTasks }, modelInputAllowlist: inputs.map(i => i.file), evaluatorNeverModelVisible: true,
    authorFieldRepairMaximum: 1, actualUSD: null, developerUsage: null, humanMinutes: null })
  await save(path.join(root, "status.json"), { schemaVersion: "authorization-au-status/v1", status: "in-progress", stage: "AU0", codeRevision: revision, startedAt: new Date().toISOString(), lastKnownRequest: null, nextAction: "AU1 input compatibility red tests; AU2 parser probes", providerCalls: 0, active: [], positions: plannedPositions().map(r => ({ id: r.id, status: "not-dispatched" })),
    failureMap: [
      { cause: "question-level repeated wrong entry", trigger: "AT consume-author-github-security-review-original/attempt-2: seven units, six on repo creation", modules: ["inquiry-program", "operation-program", "operation-facts"], observable: "one bound operation; all original questions delivered" },
      { cause: "missing inheritance/helper", trigger: "AT paperless-share-create-policy-fresh/attempt-1", modules: ["structure-index", "operation-work"], observable: "structural omitted helper creates a concrete read/interpret action" },
      { cause: "insufficient object/permission algebra", trigger: "AT original native CreateIssue and ShareLink", modules: ["control-evaluation", "procedure-summary", "semantic-flow"], observable: "parameterized guard/return/effect summaries equal exact expansion" },
      { cause: "diagnostics without next action", trigger: "AT changed native and consumers", modules: ["inquiry-focus", "inquiry-domain-runtime", "operation-work"], observable: "diagnostic names obligation/relationship and recorded next action" },
      { cause: "whole partial/source invalidation", trigger: "AT two previous positions blocked", modules: ["inquiry-reuse", "operation-facts"], observable: "valid partial materials imported, old final/check excluded" },
      { cause: "prose/formal split", trigger: "AT two full original native prose with invalid checks", modules: ["inquiry-native", "inquiry-semantic"], observable: "current structured skeleton and prose describe same conditions" },
    ] })
  return check()
}
export async function check() {
  const manifest = await json(path.join(root, "manifest.json"))
  if (manifest.rows.length !== 32 || manifest.rows.some((r: Position) => manifest.inheritedSeals.sealedTasks.includes(r.task))) throw new Error("Planned position/seal mismatch")
  for (const input of manifest.inputs) if (sha(await readFile(modelInputPath(input.file))) !== input.sha256) throw new Error("Registered original model input changed")
  if (sha(await readFile(path.resolve(root, manifest.inheritedSeals.file))) !== manifest.inheritedSeals.sha256) throw new Error("Inherited seals changed")
  return { status: "registered", positions: 32, sealedTasks: manifest.inheritedSeals.sealedTasks, providerCalls: 0 }
}
export async function probe(label = "initial") {
  if (!/^[a-z][a-z0-9-]{0,48}$/.test(label)) throw new Error("Use a bounded probe label")
  await check()
  const records = []
  for (const task of ["paperless-share-create", "gitea-create-issue"]) {
    const inputPath = modelInputPath(`model/inputs/${task}.json`), input = await json(inputPath)
    const tools = await createInquiryTools({ ...input, sourceRoot: path.resolve(path.dirname(inputPath), input.sourceRoot), structure: true, maxReadBytes: 33554432 })
    const index = tools.structure!, candidates = tools.symbolHints(input.brief ?? input.inquiry.questions.map((q: any) => q.request).join(" ")).slice(0, 16)
    records.push({ task, repository: input.repository, sourceRef: input.sourceRef, parser: index.parser, sourceFiles: tools.files, preparation: index.preparation, indexBytes: tools.indexBytes, physicalReadBytes: tools.ioReadBytes, symbols: index.symbols.length, calls: index.calls.length, resolvedCalls: index.calls.filter(c => c.resolution === "resolved").length, diagnostics: index.diagnostics, initialTaskCandidates: candidates, relationships: candidates.map(c => ({ source: c, work: operationWork(index, c.id, [], []) })), sourceToolCalls: tools.toolCalls, providerCalls: 0, targetExecutions: 0 })
  }
  const artifact = { schemaVersion: "authorization-au-structure-probe/v1", codeRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), parserPackage: "@vscode/tree-sitter-wasm@0.3.1", license: "MIT", CodeQL: { available: false, reason: "CodeQL executable/database unavailable; no measured query comparison or coverage equivalence claimed" }, records }
  await save(path.join(root, label === "initial" ? "evaluations/structure-probes.json" : `evaluations/structure-probes-${label}.json`), artifact)
  return records.map(r => ({ task: r.task, files: r.sourceFiles.length, symbols: r.symbols, calls: r.calls, resolved: r.resolvedCalls, durationMs: r.preparation.durationMs, indexBytes: r.indexBytes, providerCalls: r.providerCalls }))
}
if (import.meta.main) console.log(JSON.stringify(await (process.argv[2] === "init" ? initialize() : process.argv[2] === "check" ? check() : process.argv[2] === "probe" ? probe(process.argv[3]) : process.argv[2] === "develop" ? develop(process.argv[3]!, process.argv[4], process.argv[5]) : process.argv[2] === "replay" ? replay() : Promise.reject(new Error("Use init | check | probe [label] | develop <debug-id> [repair-id <exact-row-id>/attempt-n] | replay"))), null, 2))
