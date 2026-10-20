// Adapt the existing BS ordinary CLI verification, preserving all originals.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { inspectLocalInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./evidence.ts"
import { checkRegistration } from "./study.ts"
const common = ["--strategy=question-checked-v1", "--execution-policy=progressive", "--program-mode=consume", "--program-context=directed", "--program-support=execute"]
async function cli(args: string[], logFile: string) {
  let stdout = "", failure: string | undefined
  try { stdout = execFileSync("bun", ["src/index.ts", "authorization", "inquiry", ...args], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) }
  catch (error: any) { stdout = error.stdout?.toString() ?? ""; failure = String(error.message) }
  await mkdir(path.dirname(logFile), { recursive: true }); await writeFile(logFile, stdout, "utf8")
  return { command: ["bun", "src/index.ts", "authorization", "inquiry", ...args], logFile: relative(logFile), exitCode: failure ? 1 : 0, failure, providerCalls: 0 }
}
export async function ordinary(task: string) {
  if (!["M", "G"].includes(task)) throw new Error("unknown-task")
  await checkRegistration()
  const program = path.join(base, `automatic/${task}-final.json`), rows: any[] = []
  for (const state of ["original", "changed"]) {
    const input = path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-${state}.json`), out = path.join(base, `verification/ordinary-${task}-${state}`)
    const result: any = await cli(["check", `--input=${relative(input)}`, `--domain-program=${relative(program)}`, ...common, `--out=${relative(out)}`], path.join(base, `verification/cli-${task}-${state}.txt`))
    if (!result.failure) {
      try {
        const inspected = await inspectLocalInquiry(out)
        result.session = relative(inspected.sessionPath); result.status = inspected.status; result.execution = inspected.execution
        result.inspect = await cli(["inspect", `--out=${result.session}`], path.join(base, `verification/cli-${task}-${state}-inspect.txt`))
      } catch (error) { result.archiveFailure = String(error) }
    }
    rows.push({ state, ...result })
  }
  await save(path.join(base, `verification/ordinary-${task}.json`), { providerCalls: 0, program: relative(program), programSha256: hash(await readFile(program)), rows })
  return rows.map(({ state, status, failure, archiveFailure, execution }) => ({ task, state, status, failure, archiveFailure, termination: execution?.resourceExecution?.termination, returned: execution?.resourceExecution?.returned }))
}
export async function portable(task = "M") {
  const ordinary = await load(path.join(base, `verification/ordinary-${task}.json`)), original = ordinary.rows.find((r: any) => r.state === "original")
  if (!original?.session) throw new Error("no-ordinary-original-session")
  const report = await inspectLocalInquiry(path.resolve(repo, original.session)), inputFile = path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-original.json`), input = await load(inputFile)
  const sourceRoot = path.resolve(path.dirname(inputFile), input.sourceRoot), portableRoot = path.join(base, `verification/portable-${task}`), copiedSource = path.join(portableRoot, "source")
  if (await Bun.file(path.join(portableRoot, "input.json")).exists()) throw new Error("portable-copy-already-exists")
  for (const file of report.sourceFiles) {
    const destination = path.resolve(copiedSource, file.path)
    if (!destination.startsWith(path.resolve(copiedSource) + path.sep)) throw new Error("source-path-outside-copy")
    await mkdir(path.dirname(destination), { recursive: true }); await copyFile(path.join(sourceRoot, file.path), destination)
  }
  const program = path.join(portableRoot, "program.json")
  await copyFile(path.join(base, `automatic/${task}-final.json`), program)
  const movedInput = path.join(portableRoot, "input.json")
  const init = await cli(["init", `--from=${original.session}`, `--source-root=${relative(copiedSource)}`, `--out=${relative(movedInput)}`], path.join(portableRoot, "init.txt"))
  const check = await cli(["check", `--input=${relative(movedInput)}`, `--domain-program=${relative(program)}`, ...common, `--out=${relative(path.join(portableRoot, "check"))}`], path.join(portableRoot, "check.txt"))
  const moved = await inspectLocalInquiry(path.join(portableRoot, "check"))
  const mutation = task === "M" ? { file: "server/api/v1/memo_share_service.go", before: "time.Now().Unix() > *ms.ExpiresTs", after: "time.Now().Unix() >= *ms.ExpiresTs" } : { file: "routers/api/v1/api.go", before: "Post(reqToken(), mustNotBeArchived, bind(api.CreateIssueOption{}), reqRepoReader(unit.TypeIssues), repo.CreateIssue)", after: "Post(reqToken(), mustNotBeArchived, bind(api.CreateIssueOption{}), reqRepoWriter(unit.TypeIssues), repo.CreateIssue)" }
  const target = path.resolve(copiedSource, mutation.file)
  if (!target.startsWith(path.resolve(copiedSource) + path.sep)) throw new Error("mutation-outside-copy")
  const before = await readFile(target, "utf8")
  if (before.split(mutation.before).length !== 2) throw new Error("decisive-source-mutation-not-unique")
  await writeFile(target, before.replace(mutation.before, mutation.after), "utf8")
  const changed = await cli(["compare", `--input=${relative(movedInput)}`, `--previous=${relative(moved.sessionPath)}`, `--domain-program=${relative(program)}`, "--strategy=question-checked-v1", "--execution-policy=progressive"], path.join(portableRoot, "changed-source-compare.txt"))
  const comparison = JSON.parse(await readFile(path.join(portableRoot, "changed-source-compare.txt"), "utf8"))
  const result = { providerCalls: 0, businessWrites: 0, task, init, check, movedSession: relative(moved.sessionPath), sameRaw: hash(await readFile(program)) === ordinary.programSha256,
    originalResult: report.execution?.resourceExecution, movedResult: moved.execution?.resourceExecution, mutation: { ...mutation, beforeSha256: hash(before), afterSha256: hash(await readFile(target)), originalSourcePreserved: hash(await readFile(path.join(sourceRoot, mutation.file))) === hash(before) }, changed, comparison,
    withdrawn: comparison.sourceChanged === true && comparison.status === "needs-review" && !comparison.executableContract?.resourceExecution }
  await save(path.join(base, `verification/portability-${task}.json`), result)
  if (!result.sameRaw || !result.withdrawn || !result.mutation.originalSourcePreserved) throw new Error("portable-source-boundary-not-verified")
  return { sameRaw: result.sameRaw, withdrawn: result.withdrawn, originalSourcePreserved: result.mutation.originalSourcePreserved }
}
if (import.meta.main) {
  const [command, task] = process.argv.slice(2)
  console.log(JSON.stringify(command === "ordinary" ? await ordinary(task!) : command === "portable" ? await portable(task) : (() => { throw new Error("ordinary M/G|portable [M/G]") })(), null, 2))
}
