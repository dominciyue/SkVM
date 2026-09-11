import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { buildApiRequestSpecimens } from "../../../src/skill-ir/api-request-specimens";
import { verifyApiRequestSpecimens, verifyApiFormRequestSpecimens } from "../../../src/skill-ir/api-request-specimens-checker";
import { decodeDevelopmentUtf8 } from "../../../src/skill-ir/development-utf8";

const root = process.cwd(), out = process.argv[2];
if (!out) throw new Error("new comparison output path required");
const base = "results/skill-ir/skill-family-form-development-20260911";
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const indexBytes = await readFile(resolve(root, indexPath)), index = JSON.parse(indexBytes.toString("utf8"));
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rows = [];
for (const input of index.inputs) {
  const bytes = await readFile(resolve(root, dirname(indexPath), input.localPath));
  if (sha(bytes) !== input.sha256) throw new Error("input binding drift");
  const source = decodeDevelopmentUtf8(bytes);
  let previousPath = `results/skill-ir/skill-family-request-specimens-development-20260911/method-revision-run/${input.inputId}.json`;
  try { await access(resolve(root, previousPath)); }
  catch { previousPath = `results/skill-ir/skill-family-request-specimens-development-20260911/first-run/${input.inputId}.json`; }
  const previousBytes = await readFile(resolve(root, previousPath)), previous = JSON.parse(previousBytes.toString("utf8"));
  const currentOld = buildApiRequestSpecimens(source, input.format);
  const newPath = `${base}/first-run/${input.inputId}.json`, newBytes = await readFile(resolve(root, newPath)), next = JSON.parse(newBytes.toString("utf8"));
  const oldCheck = verifyApiRequestSpecimens(source, input.format, currentOld), newCheck = verifyApiFormRequestSpecimens(source, input.format, next.report);
  const changes = [];
  let outsideFormUnchanged = same({ ...previous.report, operations: [] }, { ...next.report, schemaVersion: previous.report.schemaVersion, operations: [] });
  for (const op of previous.report.operations) {
    const nextOp = next.report.operations.find((o: any) => o.key === op.key);
    if (!nextOp || !same({ ...op, cases: [] }, { ...nextOp, cases: [] }) || op.cases.length !== nextOp.cases.length) { outsideFormUnchanged = false; continue; }
    for (const c of op.cases) {
      const other = nextOp.cases.find((v: any) => v.id === c.id);
      if (!same(c, other)) {
        if (!other || c.mediaType !== "application/x-www-form-urlencoded" || c.omit === "body") outsideFormUnchanged = false;
        changes.push({ operation: op.key, caseId: c.id, before: c.status, after: other?.status, reasons: other?.reasons });
      }
    }
  }
  rows.push({ inputId: input.inputId, sourceSha256: sha(bytes), previousPath, previousSha256: sha(previousBytes), newPath, newSha256: sha(newBytes),
    oldProfileReportExact: same(previous.report, currentOld), outsideFormUnchanged, oldCheck, newCheck, changes });
}
const status = rows.every((r) => r.oldProfileReportExact && r.outsideFormUnchanged && r.oldCheck.status === "pass" && r.newCheck.status === "pass") ? "pass" : "fail";
await writeFile(resolve(root, out), JSON.stringify({ exposure: "development", status, inputIndexSha256: sha(indexBytes),
  scriptSha256: sha(await readFile(import.meta.path)), rows, projectRemoteCalls: 0, projectModelCalls: 0, paidCalls: 0 }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status, documents: rows.length, oldExact: rows.filter((r) => r.oldProfileReportExact).length,
  newlyConstructed: rows.flatMap((r) => r.changes).filter((c) => c.before !== "constructed" && c.after === "constructed").length }));
if (status !== "pass") process.exitCode = 1;
