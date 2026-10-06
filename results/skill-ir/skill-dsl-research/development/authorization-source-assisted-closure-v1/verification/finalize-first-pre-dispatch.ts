import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { archiveInquiryResult, configureStudyRuntime, replay, root } from "../study.ts"
import { AttemptReportSchema, ManifestSchema } from "../types.ts"
import { createProviderForModel } from "../../../../../../src/providers/registry.ts"

const read = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
const manifest = ManifestSchema.parse(await read(path.join(root, "manifest.json")))
const directory = path.join(root, "positions/debug-paperless-download-D1/first")
const claim = await read(path.join(directory, "claim.json"))
const registration = await read(path.join(directory, "registration.json"))
const originalReportPath = path.join(directory, "raw/inquiry/sessions/2026-10-06T103945119Z-2b5ae054/report.json")
const originalReport = await read(originalReportPath)
const result = await archiveInquiryResult(directory, originalReport)
const input = manifest.inputs.find(i => i.id === registration.position.inputId)!
const report = AttemptReportSchema.parse({ schemaVersion: "authorization-av-attempt/v1", ...claim, implementationRevision: registration.implementationRevision, model: manifest.testedModel, inputSha256: registration.inputSha256, sourceFiles: input.sourceFiles, skillBundleSha256: null, targetExecutions: 0, ...result })
await save(path.join(directory, "report.json"), report)
await writeFile(path.join(directory, "final.txt"), report.final, { flag: "wx" })
configureStudyRuntime(manifest)
const provider = createProviderForModel(manifest.testedModel)
const accounting = await replay()
await save(path.join(root, "verification/av10-pre-dispatch.json"), { schemaVersion: "authorization-av-pre-dispatch-repair/v1", originalReportPath: path.relative(root, originalReportPath).replaceAll("\\", "/"), originalStatus: originalReport.status, originalProviderDispatches: originalReport.providerDispatches, originalError: originalReport.error, archiveFailure: "Runner read absent run.json from a provider-unavailable session", fixes: ["SKVM_CACHE plus invalidateConfigCache before provider creation", "Archive proven-zero provider-unavailable report without reading absent run.json"], verification: { focusedTests: "8 pass / 66 assertions", runnerTypecheck: "exit 0", configuredProviderCreated: !!provider, providerCalls: 0, targetExecutions: 0 }, accountingProviderCalls: accounting.providerCalls, next: "debug-paperless-download-D1/revision-runtime-config, parent first" })
const statusPath = path.join(root, "status.json")
await writeFile(statusPath, JSON.stringify({ ...await read(statusPath), realUse: "first-pre-dispatch-failure; no provider calls", providerCalls: accounting.providerCalls, lastKnownRequest: { positionId: claim.positionId, attemptId: "first", state: "archived-zero-dispatch-failure", raw: result.raw }, nextUndispatchedAction: "study.ts run debug-paperless-download-D1 --revision=runtime-config --parent=first" }, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ status: report.status, providerCalls: report.providerCalls, configuredProviderCreated: !!provider, originalPreserved: true }))
