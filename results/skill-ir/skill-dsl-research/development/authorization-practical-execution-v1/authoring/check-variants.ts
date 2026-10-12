import { readdir, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
const base = path.resolve(import.meta.dir, ".."), checks = path.join(base, "zero-model")
await mkdir(checks, { recursive: true })
const expected: Record<string, any> = { "root-default": [11, "archive"], "empty-version": [12, "original"], "explicit-version": [12, "original"], "unrelated-version": "Http404-unrelated-version", "invalid-version": "NotFound-invalid-version", "requested-version": [11, "archive"], "root-fallback": [11, "archive"], denied: "HttpResponseForbidden", "missing-owner": null, "original-representation": [11, "original"] }
const summary = []
for (const file of (await readdir(path.join(base, "inputs"))).filter(f => expected[f.replace(/\.json$/, "")] !== undefined)) {
  const id = file.replace(/\.json$/, ""), command = ["bun", "src/index.ts", "authorization", "inquiry", "check", `--input=${path.join(base, "inputs", file)}`, "--strategy=question-checked-v1", `--domain-program=${path.join(base, "authoring/download-program.json")}`, "--execution-policy=progressive"]
  const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" }), output = await new Response(process.stdout).text(), errors = await new Response(process.stderr).text(), code = await process.exited
  await writeFile(path.join(checks, `${id}.json`), output)
  const checked = JSON.parse(output), run = checked.executableContract?.resourceExecution, wanted = expected[id]
  const passed = code === 0 && checked.providerCalls === 0 && (wanted === null ? run.status === "conditional" && run.gaps.includes("actor.id") : typeof wanted === "string" ? run.termination === wanted && run.returned === undefined : run.returned?.file_document_id === wanted[0] && run.returned.representation === wanted[1])
  summary.push({ id, command, exitCode: code, errors, passed, providerCalls: checked.providerCalls, returned: run?.returned, termination: run?.termination, status: run?.status, eventCount: run?.events?.length, gaps: run?.gaps })
  console.log(JSON.stringify(summary.at(-1)))
}
await writeFile(path.join(checks, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
if (summary.some(x => !x.passed)) process.exitCode = 1
