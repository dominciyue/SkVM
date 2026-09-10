import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { verifyApiRequestCases } from "../../../src/skill-ir/api-request-cases-checker";
import { verifyApiRequestSpecimens } from "../../../src/skill-ir/api-request-specimens-checker";

// Read-only reproduction: run from repository root; redirect/retain stdout in a new file.
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const artifacts = [
  { path: "results/skill-ir/skill-family-oneof-witness-development-20260911/nntan/report.json", field: "requestCasesReport" },
  { path: "results/skill-ir/skill-family-request-specimens-development-20260911/cross-member/lambda/report.json", field: "requestSpecimensReport" },
];
const rows = [];
for (const artifact of artifacts) {
  const bytes = readFileSync(artifact.path), report = JSON.parse(bytes.toString());
  for (const input of index.inputs) {
    const source = readFileSync(resolve(dirname(indexPath), input.localPath));
    if (sha(source) !== input.sha256) throw new Error("input binding mismatch");
    const task = report.tasks.find((t: any) => t.taskId === input.inputId);
    if (!task?.[artifact.field]) throw new Error("artifact missing");
    const check = artifact.field === "requestCasesReport"
      ? verifyApiRequestCases(source.toString(), input.format, task[artifact.field])
      : verifyApiRequestSpecimens(source.toString(), input.format, task[artifact.field]);
    rows.push({ artifact: artifact.path, artifactSha256: sha(bytes), inputId: input.inputId,
      inputSha256: sha(source), profile: task[artifact.field].schemaVersion, check });
  }
}
const files = ["src/skill-ir/api-request-cases-checker.ts", "src/skill-ir/api-request-specimens-checker.ts"];
console.log(JSON.stringify({ exposure: "development", regeneration: false,
  sourceBindings: files.map((path) => ({ path, sha256: sha(readFileSync(path)) })), rows }, null, 2));
if (rows.some((r) => r.check.status !== "pass")) process.exitCode = 1;
