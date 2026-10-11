import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { root, repo, runRoot, originalInput, json, sha, write } from "./study.ts"

/** Copy a current ordinary session and source bytes, then exercise the actual CLI without inference. */
export async function verifyPortableSession(attemptId = "quality-d-1/original") {
  const report = await json(path.join(root, "attempts", attemptId, "report.json"))
  if (!report.sessionPath || report.terminalStatus !== "completed") throw new Error("Use a current completed original session")
  const destination = path.join(runRoot, "portable", attemptId.replaceAll("/", "-"))
  await mkdir(path.dirname(destination), { recursive: true }); await mkdir(destination)
  const session = path.join(destination, "session"), source = path.join(destination, "source"), input = path.join(destination, "inquiry.json")
  const original = await json(originalInput), originalSource = path.resolve(path.dirname(originalInput), original.sourceRoot)
  await cp(report.sessionPath, session, { recursive: true, force: false, errorOnExist: true })
  await cp(originalSource, source, { recursive: true, force: false, errorOnExist: true })
  const commands: any[] = []
  const cli = async (command: string, options: string[]) => {
    const args = ["./src/index.ts", "authorization", "inquiry", command, ...options]
    const bytes = execFileSync(process.execPath, args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
    const value = JSON.parse(bytes.toString("utf8")), archive = `portable-${command}.json.gz`
    await writeFile(path.join(root, "verification", archive), gzipSync(bytes), { flag: "wx" })
    commands.push({ args, status: value.status, providerCalls: value.providerCalls ?? 0, archive, sha256: sha(bytes) })
    return value
  }
  await cli("init", [`--from=${session}`, `--out=${input}`, `--source-root=${source}`])
  const check = await cli("check", [`--input=${input}`, "--method=D1", "--strategy=question-checked-v1"])
  const inspect = await cli("inspect", [`--out=${session}`])
  const compare = await cli("compare", [`--input=${input}`, `--previous=${session}`, "--strategy=question-checked-v1"])
  const exported = await json(input), withoutRoot = (v: any) => ({ ...v, sourceRoot: undefined })
  const originalRun = await readFile(path.join(report.sessionPath, "run.json")), copiedRun = await readFile(path.join(session, "run.json"))
  const result = { stage: "BE15", attemptId, originalSession: report.sessionPath, relocatedSession: session, relocatedInput: input, productionTree: report.runtimeTree, providerCalls: 0, commands,
    declarationUnchangedExceptMechanicalRoot: isDeepStrictEqual(withoutRoot(original), withoutRoot(exported)), originalSessionBytesPreserved: sha(originalRun) === sha(copiedRun), sourceFilesByteIdentical: isDeepStrictEqual(check.sourceFiles, inspect.sourceFiles), sourceFiles: check.sourceFiles.length,
    inspectStatus: inspect.status, compareStatus: compare.status, reuseEligibility: compare.reuseEligibility, propertyStatuses: report.propertyAnalysis?.checks?.questions.map((q: any) => ({ questionId: q.questionId, properties: q.properties.map((p: any) => ({ id: p.id, status: p.status })) })), oldAnswerImported: false,
    interpretation: "Ordinary CLI init/check/inspect/compare on a byte-copied current session/source. No model, new source meaning, or verdict promotion. R0/R1 and R2 are reported separately." }
  if (!result.declarationUnchangedExceptMechanicalRoot || !result.originalSessionBytesPreserved || !result.sourceFilesByteIdentical || check.status !== "valid") throw new Error("Portable identity check failed")
  await write(path.join(root, "verification", "portable-current-session.json"), result, true)
  return result
}
if (import.meta.main) { const r = await verifyPortableSession(); console.log(JSON.stringify({ stage: r.stage, providerCalls: r.providerCalls, sourceFiles: r.sourceFiles, sourceFilesByteIdentical: r.sourceFilesByteIdentical, inspectStatus: r.inspectStatus, compareStatus: r.compareStatus, layers: r.reuseEligibility?.info?.layers })) }
