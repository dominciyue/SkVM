import path from "node:path"
import { mkdir, open, writeFile } from "node:fs/promises"

const [evidenceRecordPath, attemptDirArg, cacheDirArg, reason] = process.argv.slice(2)
if (!evidenceRecordPath || !attemptDirArg || !cacheDirArg) {
  throw new Error("Expected captured run-N.json, new attempt directory, and configured cache directory")
}
const evidence = await Bun.file(evidenceRecordPath).json()
const attemptDir = path.resolve(attemptDirArg)
await mkdir(attemptDir, { recursive: false })
const args = [
  process.execPath, path.resolve("src/index.ts"), "jit-optimize",
  `--skill=${path.dirname(evidence.trace.skillPath)}`,
  "--task-source=log",
  `--logs=${evidence.trace.sourcePath}`,
  `--log-records=${evidence.trace.recordLocator}`,
  `--optimizer-model=${evidence.trace.model}`,
  `--target-model=${evidence.trace.model}`,
  "--target-adapter=bare-agent",
  "--timeout-ms=900000",
  `--package-out=${path.join(attemptDir, "package")}`,
  `--skvm-cache=${path.resolve(cacheDirArg)}`,
]
const command = {
  schemaVersion: "skill-ir-development-command/v1",
  startedAt: new Date().toISOString(),
  cwd: process.cwd(),
  argv: args,
  sourceEvidenceRecord: path.resolve(evidenceRecordPath),
  reason: reason ?? "Shared F6.1 model-processor slot, per-evidence isolation, and optimizer/workspace handoff repair.",
  sourceRunReplayed: false,
  previousCandidateMutated: false,
  actualUsd: null,
}
await writeFile(path.join(attemptDir, "commands.json"), JSON.stringify(command, null, 2) + "\n")
const stdout = await open(path.join(attemptDir, "stdout.log"), "wx")
const stderr = await open(path.join(attemptDir, "stderr.log"), "wx")
try {
  const child = Bun.spawn(args, {
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
    stdout: stdout.fd,
    stderr: stderr.fd,
  })
  const exitCode = await child.exited
  await writeFile(path.join(attemptDir, "terminal.json"), JSON.stringify({
    completedAt: new Date().toISOString(), exitCode, pid: child.pid, actualUsd: null,
  }, null, 2) + "\n")
  console.log(JSON.stringify({ attemptDir, exitCode }))
  process.exitCode = exitCode
} finally {
  await stdout.close()
  await stderr.close()
}
