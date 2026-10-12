import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const base = path.resolve(import.meta.dir, ".."), destination = path.join(base, "source-change")
await mkdir(destination, { recursive: true })
const input = JSON.parse(await readFile(path.join(base, "inputs/root-default.json"), "utf8"))
await cp(path.resolve(base, "inputs", input.sourceRoot), path.join(destination, "source"), { recursive: true })
const file = path.join(destination, "source/src/documents/permissions.py"), original = await readFile(file, "utf8")
const before = "return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)", after = "return checker.has_perm(perms, obj)"
if (original.split(before).length !== 2) throw new Error("Expected one actual source guard")
await writeFile(file, original.replace(before, after))
input.sourceRoot = "source"
await writeFile(path.join(destination, "input.json"), JSON.stringify(input, null, 2) + "\n")
await writeFile(path.join(destination, "mutation.json"), JSON.stringify({ sourceRef: input.sourceRef, derived: true, originalProtected: true, path: "src/documents/permissions.py", line: 635, before, after, claim: "Synthetic source mutation for freshness only; no target execution or new semantic interpretation." }, null, 2) + "\n")
const command = ["bun", "src/index.ts", "authorization", "inquiry", "compare", `--input=${path.join(destination, "input.json")}`, `--previous=${path.join(base, "runs/authored-scenario")}`, `--domain-program=${path.join(base, "authoring/download-program.json")}`, "--execution-policy=progressive"]
const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" }), output = await new Response(child.stdout).text(), errors = await new Response(child.stderr).text(), exitCode = await child.exited
await writeFile(path.join(destination, "compare.json"), output)
const result = JSON.parse(output), execution = result.executableContract?.resourceExecution
const passed = exitCode === 0 && result.sourceChanged && execution?.gaps.some((x: string) => x.startsWith("resource-source-stale:")) && execution?.values.request_doc?.id === 10 && execution?.values.root_authorized === undefined && execution?.status === "conditional"
await writeFile(path.join(destination, "summary.json"), JSON.stringify({ command, exitCode, errors, passed, sourceChanged: result.sourceChanged, resourceGaps: execution?.gaps, retainedRequestId: execution?.values.request_doc?.id, authorizationReused: execution?.values.root_authorized !== undefined, conditionalDescriptor: execution?.returned, reuseEligibility: result.reuseEligibility, providerCalls: result.providerCalls }, null, 2) + "\n")
console.log(JSON.stringify({ passed, exitCode, gaps: execution?.gaps }))
if (!passed) process.exitCode = 1
