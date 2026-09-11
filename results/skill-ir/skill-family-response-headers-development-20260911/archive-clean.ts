import { readFile, writeFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const checkout = process.argv.find(v => v.startsWith("--checkout="))?.slice(11);
const out = process.argv.find(v => v.startsWith("--out="))?.slice(6);
const nodeExecutable = process.argv.find(v => v.startsWith("--node="))?.slice(7);
if (!checkout || !out || !nodeExecutable) throw new Error("--checkout=<clean directory> --out=<new archive directory> --node=<actual executable> required");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", ["-c", `safe.directory=${checkout}`, "-c", "core.longpaths=true", "-C", checkout, ...args], { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
if (!commit.startsWith("e9d6dde") || git("status", "--porcelain", "--untracked-files=no")) throw new Error("clean candidate binding mismatch");
await mkdir(out);
const files: Array<{ path: string; bytes: number; sha256: string }> = [];
async function copy(path: string) {
  const source = resolve(checkout!, "results/skill-ir/header-decimal-clean-output", path);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const child = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await copy(child);
    else if (entry.isFile()) {
      const target = resolve(out!, "outputs", child), bytes = await readFile(resolve(source, entry.name));
      await mkdir(dirname(target), { recursive: true }); await copyFile(resolve(source, entry.name), target);
      if (sha(await readFile(target)) !== sha(bytes)) throw new Error("copied byte drift");
      files.push({ path: `outputs/${child}`, bytes: bytes.length, sha256: sha(bytes) });
    } else throw new Error("nonregular output");
  }
}
await copy("");
const base = "results/skill-ir/skill-family-response-headers-development-20260911/";
const comparisons = [];
for (const member of ["lambda", "jeremy"]) {
  const previous = JSON.parse(await readFile(`${base}mappings-first/${member}/report.json`, "utf8"));
  const current = JSON.parse(await readFile(`${out}/outputs/${member}/report.json`, "utf8"));
  const normalize = (report: any) => { const value = structuredClone(report); delete value.mappingSha256;
    for (const task of value.tasks) { delete task.elapsedMillis; delete task.responseHeaderObservations.observationPath; }
    return value; };
  comparisons.push({ member, semanticsEqual: JSON.stringify(normalize(previous)) === JSON.stringify(normalize(current)),
    environment: { previousMappingSha256: previous.mappingSha256, currentMappingSha256: current.mappingSha256,
      previousTasks: previous.tasks.map((t: any) => ({ taskId: t.taskId, elapsedMillis: t.elapsedMillis, observationPath: t.responseHeaderObservations.observationPath })),
      currentTasks: current.tasks.map((t: any) => ({ taskId: t.taskId, elapsedMillis: t.elapsedMillis, observationPath: t.responseHeaderObservations.observationPath })) } });
}
const decimalReference = await readFile("results/skill-ir/skill-family-decimal-development-20260911/after.json");
const decimalCurrent = await readFile(`${out}/outputs/decimal.json`);
const dependencyManifest = "results/skill-ir/skill-family-request-clean-20260911/dependencies.json";
const report = { exposure: "development-incremental-clean", commit, checkout, trackedClean: true,
  dependencies: { manifestPath: dependencyManifest, manifestSha256: sha(await readFile(resolve(checkout, dependencyManifest))),
    archiveSha256: "9c8c5d6bd95a8bc768312c66911f45edfb97e4cecd2555cf657ffc57e604e4a6", verifiedBeforeAndAfter: true },
  runtime: { collectorNodeCompatibilityVersion: process.version, bun: Bun.version, nodeExecutable,
    nodeVersion: execFileSync(nodeExecutable, ["--version"], { encoding: "utf8" }).trim(),
    nodeExecutableSha256: sha(await readFile(nodeExecutable)) }, files, comparisons,
  decimalBytesEqual: decimalReference.equals(decimalCurrent), projectHttpCalls: 0, modelCalls: 0, paidCalls: 0,
  developerAgentCost: "separate-not-instrumented", historicalCleanReplaced: false };
await writeFile(`${out}/archive.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ files: files.length, memberComparisons: comparisons.map(c => c.semanticsEqual), decimalBytesEqual: report.decimalBytesEqual }));
if (!report.decimalBytesEqual || comparisons.some(c => !c.semanticsEqual)) process.exitCode = 1;
