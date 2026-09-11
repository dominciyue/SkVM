// Collection only: execution took place in the pinned independent checkout.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const arg = (n: string) => process.argv.find(v => v.startsWith(`--${n}=`))?.slice(n.length + 3);
const checkout = arg("checkout"), output = arg("out");
if (!checkout || !output) throw new Error("explicit --checkout and new --out required");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const git = (...args: string[]) => execFileSync("git", ["-c", `safe.directory=${checkout.replaceAll("\\", "/")}`, "-c", "core.longpaths=true", ...args], { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();
const commit = git("rev-parse", "HEAD");
if (commit !== "883c85eb7c95057692ba1958613f8f76e4fd2c09" || git("status", "--porcelain", "--untracked-files=no")) throw new Error("candidate/clean binding mismatch");
const out = resolve(output);
await mkdir(out, { recursive: false });
const read = (p: string) => readFile(resolve(checkout, p));
const json = async (p: string) => JSON.parse((await read(p)).toString("utf8"));
const files: any[] = [], comparisons: any[] = [], inputs: any[] = [];
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const index = await json(indexPath);
for (const i of index.inputs) {
  const b = await read(resolve(dirname(indexPath), i.localPath));
  if (sha(b) !== i.sha256) throw new Error(`input mismatch ${i.inputId}`);
  inputs.push({ inputId: i.inputId, sha256: sha(b), bytes: b.length });
}
async function copyTree(source: string, destination: string) {
  await mkdir(resolve(out, destination), { recursive: true });
  for (const entry of (await readdir(resolve(checkout!, source), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const src = `${source}/${entry.name}`, dst = `${destination}/${entry.name}`;
    if (entry.isDirectory()) { await copyTree(src, dst); continue; }
    if (!entry.isFile() || entry.name.endsWith(".pyc")) throw new Error(`unexpected output ${src}`);
    const bytes = await read(src);
    await writeFile(resolve(out, dst), bytes, { flag: "wx" });
    if (!bytes.equals(await readFile(resolve(out, dst)))) throw new Error("copy drift");
    files.push({ originalPath: src, archivedPath: dst, bytes: bytes.length, sha256: sha(bytes) });
  }
}
const prefix = "results/skill-ir/";
async function compare(profile: string, current: string, prior: string) {
  const a = await read(prefix + current), b = await read(prefix + prior);
  comparisons.push({ profile, current, prior, currentSha256: sha(a), priorSha256: sha(b), byteIdentical: a.equals(b) });
}
for (const [profile, prior] of [["body", "branch-negatives"], ["response", "response-schema"], ["form", "form"]]) {
  await copyTree(`${prefix}current-clean-${profile}`, profile!);
  for (const i of index.inputs) await compare(profile!, `current-clean-${profile}/${i.inputId}.json`, `skill-family-${prior}-development-20260911/first-run/${i.inputId}.json`);
}
await copyTree(`${prefix}current-clean-native`, "native");
await copyTree(`${prefix}current-clean-loopback`, "loopback");
for (const i of index.inputs) for (const name of ["suite.json", "test_api_requests.py"])
  await compare("native", `current-clean-native/${i.inputId}/${name}`, `skill-family-pytest-development-20260911/first-run/${i.inputId}/${name}`);
const native = await json(`${prefix}current-clean-native/report.json`), oldNative = await json(`${prefix}skill-family-pytest-development-20260911/first-run/report.json`);
const nativeSemantics = (r: any) => r.rows.map((v: any) => ({ inputId: v.inputId, status: v.status, sourceSha256: v.sourceSha256, verification: v.verification, counts: v.python?.counts }));
const fixture = await json(`${prefix}current-clean-loopback/report.json`), oldFixture = await json(`${prefix}skill-family-pytest-development-20260911/loopback-first-run/report.json`);
const fixtureSemantics = (r: any) => ({ sourceSha256: r.sourceSha256, suiteSha256: r.suiteSha256, runtimeSha256: r.runtimeSha256, status: r.status, correctlyDetected: r.correctlyDetected, loopbackHttpCalls: r.loopbackHttpCalls, observations: r.observations, runs: r.runs.map(({kind, expectedMarker, expectedCalls, actualCalls, detectedAtExpectedLayer, exitCode}: any) => ({kind, expectedMarker, expectedCalls, actualCalls, detectedAtExpectedLayer, exitCode})) });
const nativeCountsEqual = JSON.stringify(nativeSemantics(native)) === JSON.stringify(nativeSemantics(oldNative));
const fixtureSemanticsEqual = JSON.stringify(fixtureSemantics(fixture)) === JSON.stringify(fixtureSemantics(oldFixture));
const bindings = [];
for (const p of [indexPath, "bun.lock", "package.json", `${prefix}skill-family-request-clean-20260911/dependencies.json`, `${prefix}skill-family-current-clean-20260911/python-dependencies.json`]) {
  const b = await read(p); bindings.push({ path: p, sha256: sha(b), bytes: b.length });
}
const report = { exposure: "development", implementationCommit: commit, checkout, trackedChanges: false, collectionScriptSha256: sha(await readFile(import.meta.path)), inputs, bindings, files, comparisons, nativeCountsEqual, fixtureSemanticsEqual,
  allComparisonsPass: comparisons.every(v => v.byteIdentical) && nativeCountsEqual && fixtureSemanticsEqual,
  environmentDifferences: ["timestamps/durations/workdirs/ephemeral ports", "Python executable now isolated venv", "fixture script adds -B since prior run; both original bindings preserved"],
  priorEvidenceNotOverwritten: true, realApiHttpCalls: 0, archivedSyntheticHttpCalls: 15, regressionSyntheticHttpCalls: 15, projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate", wholeSkillCompleted: false };
await writeFile(resolve(out, "archive.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ files: files.length, comparisons: comparisons.length, nativeCountsEqual, fixtureSemanticsEqual, pass: report.allComparisonsPass }));
if (!report.allComparisonsPass) process.exitCode = 1;
