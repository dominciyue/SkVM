import { readFile, mkdir, writeFile } from "node:fs/promises"
import { gunzipSync, gzipSync } from "node:zlib"
import path from "node:path"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { root, runRoot, originalInput, sha, write } from "./study.ts"

/** Repeat only the retained original calls, with no replacement source meanings. */
export async function replayOriginalBE(prefix = "be-original-derived") {
  if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error("Use a new plain evidence prefix; existing files are retained")
  const originalFile = path.resolve(root, "../authorization-question-workflow-v1/attempts/quality-d-1/original/inquiry-run.json.gz"), bytes = await readFile(originalFile), original = JSON.parse(gunzipSync(bytes).toString("utf8")), history = original.native.history
  const target = history[46]
  if (target.call.name !== "authorization_declare" || !target.output.controlDiagnostics.some((d: any) => d.code === "question-source-unoffered")) throw new Error("Original BE identity no longer matches the retained failure")
  const runtime = await createNativeInquiryRuntime({ inputFile: originalInput, workDir: runRoot, method: "D1", strategy: "question-checked-v1", domainTools: true, maxToolCalls: 128, maxDisplayBytes: 33554432, maxReadBytes: 33554432 })
  const calls: any[] = []
  for (const [index, entry] of history.slice(0, 47).entries()) {
    const output = await runtime.execute(structuredClone(entry.call))
    calls.push({ index, name: entry.call.name, originalArgumentsSha256: sha(JSON.stringify(entry.call.arguments)), replayArgumentsSha256: sha(JSON.stringify(entry.call.arguments)), exitCode: output.exitCode, output: JSON.parse(output.output) })
  }
  await runtime.close()
  const report = runtime.report(), current: any = calls[46]!.output
  await mkdir(path.join(root, "verification"), { recursive: true })
  await writeFile(path.join(root, `verification/${prefix}.json.gz`), gzipSync(JSON.stringify({ originalFile, originalSha256: sha(bytes), calls, current: report })), { flag: "wx" })
  const result = { schemaVersion: "authorization-bf-be-replay/v1", modelCalls: 0, newSourceMeanings: 0, originalFile, originalSha256: sha(bytes), originalFileUnchanged: sha(await readFile(originalFile)) === sha(bytes), replayRange: [0, 46], originalProposal: target.call.arguments, originalDiagnostics: target.output.controlDiagnostics, currentDiagnostics: current?.controlDiagnostics, currentExitCode: calls[46]!.exitCode, currentOutput: current, adoptedMaterials: report.domain?.sourceMaterials?.materials.length ?? 0, actualMaterialUses: report.domain?.materialUses ?? [], sourceVerification: report.sourceVerification, archive: `${prefix}.json.gz`, automaticGenerationCredit: false, changedExperimentScore: false }
  await write(path.join(root, `verification/${prefix}.json`), result, true)
  return { modelCalls: 0, originalFileUnchanged: result.originalFileUnchanged, originalDiagnostics: result.originalDiagnostics, currentDiagnostics: result.currentDiagnostics, materials: result.adoptedMaterials, materialUses: result.actualMaterialUses.length }
}
if (import.meta.main) console.log(JSON.stringify(await replayOriginalBE(process.argv[2])))
