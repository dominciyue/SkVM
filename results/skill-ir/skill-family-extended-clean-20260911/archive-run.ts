// Evidence collection only; candidate execution happens separately in the clean checkout.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const arg = (name: string) => process.argv.find((s) => s.startsWith(`--${name}=`))?.slice(name.length + 3);
const checkout = arg("checkout"), output = arg("out");
if (!checkout || !output) throw new Error("--checkout=<explicit-clean-path> --out=<new-evidence-directory>");
const git = (...args: string[]) => execFileSync("git", ["-c", `safe.directory=${checkout.replaceAll("\\", "/")}`, "-c", "core.longpaths=true", ...args], { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();
const commit = git("rev-parse", "HEAD");
if (!commit.startsWith("be89a50") || git("status", "--porcelain", "--untracked-files=no")) throw new Error("expected unchanged clean implementation checkout");
const out = resolve(output);
await mkdir(out, { recursive: false });
const files: unknown[] = [], comparisons: unknown[] = [];
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const indexBytes = await readFile(resolve(checkout, indexPath)), index = JSON.parse(indexBytes.toString());
const inputs = [];
for (const input of index.inputs) {
  const path = resolve(checkout, dirname(indexPath), input.localPath), bytes = await readFile(path);
  if (sha(bytes) !== input.sha256) throw new Error(`input binding mismatch: ${input.inputId}`);
  inputs.push({ inputId: input.inputId, localPath: input.localPath, sha256: sha(bytes), bytes: bytes.length });
}
for (const [profile, clean, prior] of [
  ["body", "extended-clean-body", "skill-family-body-negatives-development-20260911/first-run"],
  ["response", "extended-clean-response", "skill-family-response-schema-development-20260911/first-run"],
]) {
  for (const name of ["report.json", ...index.inputs.map((i: any) => `${i.inputId}.json`)]) {
    const originalPath = `results/skill-ir/${clean}/${name}`, archivedPath = `${profile}/${name}`;
    const bytes = await readFile(resolve(checkout, originalPath));
    await mkdir(resolve(out, profile!), { recursive: true });
    await writeFile(resolve(out, archivedPath), bytes, { flag: "wx" });
    files.push({ originalPath, archivedPath, bytes: bytes.length, sha256: sha(bytes) });
    if (name !== "report.json") {
      const priorPath = `results/skill-ir/${prior}/${name}`, previous = await readFile(resolve(checkout, priorPath));
      const sameSemantics = JSON.stringify(JSON.parse(bytes.toString())) === JSON.stringify(JSON.parse(previous.toString()));
      comparisons.push({ profile, name, priorPath, priorSha256: sha(previous), cleanSha256: sha(bytes), byteIdentical: bytes.equals(previous), sameSemantics });
    }
  }
}
const bindings = [];
for (const path of [indexPath, "bun.lock", "package.json", "results/skill-ir/skill-family-request-clean-20260911/dependencies.json"]) {
  const bytes = await readFile(resolve(checkout, path));
  bindings.push({ path, sha256: sha(bytes), bytes: bytes.length });
}
const versions = [];
for (const name of ["ajv", "ajv-formats", "typescript", "yaml"]) {
  const path = `node_modules/${name}/package.json`, bytes = await readFile(resolve(checkout, path));
  versions.push({ name, version: JSON.parse(bytes.toString()).version, packageJsonSha256: sha(bytes) });
}
const report = { exposure: "development-clean-reproduction", implementationCommit: commit, checkout, trackedChanges: false,
  collectionScriptSha256: sha(await readFile(import.meta.path)), files, comparisons, inputs, bindings, dependencyVersions: versions,
  fullDocumentArtifactComparisons: comparisons.length, allSemanticsEqual: comparisons.every((c: any) => c.sameSemantics),
  comparison: "Entire per-document JSON, including unresolved, issues and independent verification. Summary environment/timing/source bindings retained separately, not forced equal to older implementation.",
  priorEvidenceNotOverwritten: true, projectRemoteCalls: 0, projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate" };
await writeFile(resolve(out, "archive.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ commit, files: files.length, comparisons: comparisons.length, allSemanticsEqual: report.allSemanticsEqual }));
if (!report.allSemanticsEqual) process.exitCode = 1;
