import path from "node:path"
import { gunzipSync } from "node:zlib"
import { piEventsToRunRecord, type PiEvent } from "../../../../src/core/pi-runtime.ts"
import { analyzeSkillConsumption } from "../../../../src/jit-optimize/consumption.ts"

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

const h8 = path.dirname(path.resolve(process.argv[1]!))
const runDir = path.resolve(process.argv[2] ?? path.join(h8, "natural-consumption-run-001"))
const sourceReportPath = path.join(runDir, "report.json")
const eventsPath = path.join(runDir, "agent-events.json.gz")
const outputPath = path.resolve(process.argv[3] ?? path.join(runDir, "report-revision-001.json"))
const sourceReportBytes = new Uint8Array(await Bun.file(sourceReportPath).arrayBuffer())
const compressedBytes = new Uint8Array(await Bun.file(eventsPath).arrayBuffer())
const report = JSON.parse(new TextDecoder().decode(sourceReportBytes))
const rawBytes = new Uint8Array(gunzipSync(compressedBytes))
if (sha256(compressedBytes) !== report.runtime.agentEvents.sha256) throw new Error("Compressed event digest mismatch")
if (sha256(rawBytes) !== report.runtime.agentEvents.rawSha256) throw new Error("Raw event digest mismatch")
const events = JSON.parse(new TextDecoder().decode(rawBytes)) as PiEvent[]
const record = piEventsToRunRecord(events).finish({
  workDir: report.runtime.workDir,
  durationMs: report.runtime.durationMs,
  ...(report.runtime.timedOut
    ? { runStatus: "timeout" as const }
    : report.runtime.exitCode === 0
      ? {}
      : { runStatus: "adapter-crashed" as const }),
})
const residualWorkRequired = report.package.selectedEntrypoints.length > 0
const residualWorkCompleted = !residualWorkRequired
  || (report.verification.residualEvidenceFiles.length > 0
    && report.verification.residualEvidenceFiles.every((item: { exists: boolean }) => item.exists))
const consumption = analyzeSkillConsumption(record.steps, {
  skillPaths: ["skill/SKILL.md"],
  executableEntries: report.package.selectedEntrypoints,
  documentationOnly: report.package.selectedEntrypoints.length === 0,
  residualWorkRequired,
  residualWorkCompleted,
  taskOutcome: report.verification.taskPassed ? "passed" : "failed",
})
const revised = {
  schemaVersion: "skill-ir-general-skill-development-analysis-revision/v1",
  exposure: "development",
  createdAt: new Date().toISOString(),
  status: report.verification.taskPassed && consumption.consumptionComplete ? "passed" : "failed",
  revision: {
    sourceReport: { path: sourceReportPath, bytes: sourceReportBytes.byteLength, sha256: sha256(sourceReportBytes) },
    agentEvents: {
      path: eventsPath,
      bytes: compressedBytes.byteLength,
      sha256: sha256(compressedBytes),
      rawBytes: rawBytes.byteLength,
      rawSha256: sha256(rawBytes),
    },
    modelRerun: false,
    reason: "The original analyzer accepted status=success but not the generated helper's exit-zero JSON ok=true convention. The raw event is unchanged and is reinterpreted after the shared analyzer regression fix.",
  },
  runtime: report.runtime,
  package: report.package,
  consumption,
  verification: report.verification,
  claimBoundary: "Deterministic reanalysis of one preserved natural development run. No model or task rerun occurred; this does not add a sample or establish broad agent-consumption reliability.",
}
await Bun.write(outputPath, `${JSON.stringify(revised, null, 2)}\n`)
console.log(JSON.stringify({ status: revised.status, sourceReportSha256: revised.revision.sourceReport.sha256, consumption }, null, 2))
if (revised.status !== "passed") process.exitCode = 1
