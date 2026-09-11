import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildApiRequestBodyNegatives } from "../../../src/skill-ir/api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "../../../src/skill-ir/api-request-body-negatives-checker";
import { decodeDevelopmentUtf8 } from "../../../src/skill-ir/development-utf8";
import { createContainedDirectory, resolveContainedExistingFile } from "../../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const outputPath = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
if (!outputPath) throw new Error("--out=<new-directory>");
const root = process.cwd(), out = await createContainedDirectory(root, outputPath, "composition comparison output");
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const indexBytes = await readFile(indexPath), index = JSON.parse(decodeDevelopmentUtf8(indexBytes));
const rows = [];
for (const input of index.inputs) {
  const started = performance.now();
  try {
    const inputBytes = await readFile(await resolveContainedExistingFile(root, `${dirname(indexPath)}/${input.localPath}`, "exposed input"));
    if (sha(inputBytes) !== input.sha256) throw new Error("source digest mismatch");
    const source = decodeDevelopmentUtf8(inputBytes), report = buildApiRequestBodyNegatives(source, input.format);
    const verification = verifyApiRequestBodyNegatives(source, input.format, report);
    const payload = JSON.stringify({ inputId: input.inputId, report, verification }, null, 2) + "\n";
    const priorPath = `results/skill-ir/skill-family-branch-negatives-development-20260911/first-run/${input.inputId}.json`;
    const priorBytes = await readFile(priorPath), unchanged = sha(payload) === sha(priorBytes);
    const artifactPath = unchanged ? priorPath : `${outputPath}/${input.inputId}.json`;
    if (!unchanged) await writeFile(resolve(root, artifactPath), payload, { flag: "wx" });
    rows.push({ inputId: input.inputId, sourceSha256: sha(inputBytes), priorPath, priorSha256: sha(priorBytes),
      artifactPath, artifactSha256: sha(payload), identicalFullArtifact: unchanged, verification, elapsedMs: performance.now() - started });
  } catch (error) { rows.push({ inputId: input.inputId, error: String(error), elapsedMs: performance.now() - started }); }
}
const bindings = [];
for (const path of ["src/skill-ir/api-schema-witness.ts", "src/skill-ir/api-schema-cases.ts", "src/skill-ir/api-schema-checker.ts",
  "src/skill-ir/api-schema-case-checker.ts", "src/skill-ir/api-request-body-negatives.ts", "src/skill-ir/api-request-body-negatives-checker.ts", "bun.lock"]) {
  bindings.push({ path, sha256: sha(await readFile(path)) });
}
const result = { exposure: "development-existing-panel", executionCommit: execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
  inputIndexSha256: sha(indexBytes), bindings, rows, runtime: { bun: Bun.version },
  pass: rows.every((r) => !r.error && r.verification?.status === "pass"), unchangedArtifacts: rows.filter((r) => r.identicalFullArtifact).length,
  note: "Recomputed and independently checked once. Byte-identical payloads reuse their already committed full artifact; changed payloads are archived here. No independent sample increment or new clean-run claim.",
  projectRemoteCalls: 0, projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate", comparisonScriptSha256: sha(await readFile(import.meta.path)) };
await writeFile(resolve(out, "report.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ inputs: rows.length, pass: result.pass, unchanged: result.unchangedArtifacts }));
if (!result.pass) process.exitCode = 1;
