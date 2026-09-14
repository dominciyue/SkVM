import path from "node:path"
import { mkdir, open, writeFile } from "node:fs/promises"

const root = import.meta.dirname
const destination = path.join(root, process.argv[2] ?? "f10-feedback-successor")
await mkdir(destination, { recursive: false })
const argv = [
  process.execPath, path.resolve("src/index.ts"), "jit-optimize",
  `--skill=${path.join(root, "f9/i18n-f9-recovered-package")}`,
  "--task-source=log",
  `--logs=${path.join(root, "f9/consumption/sol-optimized-original/report.json")},${path.join(root, "f9/consumption/gpt55-optimized-original/report.json")}`,
  "--optimizer-model=xty/gpt-5.6-sol",
  "--target-model=xty/gpt-5.6-sol",
  "--target-adapter=bare-agent",
  "--timeout-ms=900000",
  `--package-out=${path.join(destination, "package")}`,
  `--skvm-cache=${path.join(root, "f9/cache-i18n-3")}`,
]
await writeFile(path.join(destination, "commands.json"), JSON.stringify({
  startedAt: new Date().toISOString(), cwd: process.cwd(), argv,
  reason: "F10 must revise the actually consumed package using its observed entry-discovery and redundant-audit traces. The original-source regeneration produced docs only and did not exercise this feedback path.",
  sourceRunReplayed: false, previousCandidateMutated: false, actualUsd: null,
}, null, 2) + "\n", { flag: "wx" })
const stdout = await open(path.join(destination, "stdout.log"), "wx")
const stderr = await open(path.join(destination, "stderr.log"), "wx")
try {
  const child = Bun.spawn(argv, {
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
    stdout: stdout.fd, stderr: stderr.fd,
  })
  const exitCode = await child.exited
  await writeFile(path.join(destination, "terminal.json"), JSON.stringify({
    completedAt: new Date().toISOString(), exitCode, pid: child.pid, actualUsd: null,
  }, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ destination, exitCode }))
  process.exitCode = exitCode
} finally {
  await stdout.close()
  await stderr.close()
}
