import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createCases } from "../authorization-reusable-program-v1/cases.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const seeds = await Promise.all(["root-default", "empty-version", "denied", "root-fallback"].map(async name => {
  const file = path.join(repo, `examples/authorization-assessment/download-workflow/inputs/${name}.json`)
  const value = JSON.parse(await readFile(file, "utf8"))
  value.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(file), value.sourceRoot)).split(path.sep).join("/")
  return value
}))
await mkdir(path.join(base, "inputs"), { recursive: true })
const program = path.resolve(base, "../authorization-reusable-program-v1/authoring/automatic-program.json"), observations = []
for (const c of createCases(seeds[0], seeds[1], seeds[2], seeds[3]).filter(c => ["root-default", "empty-version", "invalid-version", "other-root-version", "denied", "no-external"].includes(c.name))) {
  const input = path.join(base, `inputs/${c.name}.json`)
  await writeFile(input, JSON.stringify(c.input, null, 2) + "\n")
  const options = { executionPolicy: "progressive" as const, programMode: "consume" as const }
  const checked = await checkAuthorizationInquiry(input, "D1", "question-checked-v1", program, options)
  const saved: any = await saveLocalInquiryCheck(input, program, path.join(base, "baseline", c.name), checked, options)
  const e = checked.executableContract && "resourceExecution" in checked.executableContract ? checked.executableContract.resourceExecution : undefined
  observations.push({ variant: c.name, session: path.relative(repo, saved.sessionPath).split(path.sep).join("/"), status: e?.status, returned: e?.returned, termination: e?.termination, conditions: e?.conditions, gaps: e?.gaps })
}
await writeFile(path.join(base, "baseline.json"), JSON.stringify({ implementation: "30773a5318a5f5e76d6acb890fc1802eb6b119e3", providerCalls: 0, observations }, null, 2) + "\n")
console.log(JSON.stringify(observations))
