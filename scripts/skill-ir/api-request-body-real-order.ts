import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, relative } from "node:path";
import { parseDocument } from "yaml";
import { buildApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives-checker";
import { independentlyEnumerateApiTesterOperations } from "../../src/skill-ir/api-tester-operation-coverage";
import { bodyNegativeSemantics, reverseObjectKeys } from "./api-request-body-metamorphic";
import { createContainedDirectory, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const stable = (v: unknown) => JSON.stringify(canonical(v));
const arg = (k: string) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.main) {
  const inputs = arg("inputs"), prior = arg("prior"), outPath = arg("out");
  if (!inputs || !prior || !outPath) throw new Error("--inputs=<bound-index> --prior=<archived-output-directory> --out=<new-output-directory>");
  const root = process.cwd(), indexPath = await resolveContainedExistingFile(root, inputs, "input index");
  const indexBytes = await readFile(indexPath), index = JSON.parse(indexBytes.toString());
  if (!Array.isArray(index.inputs) || index.inputs.some((i: any) => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(i.inputId))
    || new Set(index.inputs.map((i: any) => i.inputId)).size !== index.inputs.length) throw new Error("safe unique input IDs required");
  const out = await createContainedDirectory(root, outPath, "real-order output");
  const rows = [];
  for (const input of index.inputs) {
    try {
      const sourcePath = relative(root, resolve(dirname(indexPath), input.localPath)).replaceAll("\\", "/");
      const bytes = await readFile(await resolveContainedExistingFile(root, sourcePath, "source"));
      if (input.status !== "acquired" || !["json", "yaml"].includes(input.format) || sha(bytes) !== input.sha256) throw new Error("source binding");
      const source = bytes.toString(), syntax = parseDocument(source, { uniqueKeys: true });
      if (syntax.errors.length) throw new Error("source parsing");
      const document = input.format === "json" ? JSON.parse(source) : syntax.toJS({ maxAliasCount: 100 });
      const derived = JSON.stringify(reverseObjectKeys(document));
      const priorPath = `${prior}/${input.inputId}.json`;
      const priorBytes = await readFile(await resolveContainedExistingFile(root, priorPath, "archived parent report"));
      const parent = JSON.parse(priorBytes.toString());
      if (parent.inputId !== input.inputId || parent.verification.status !== "pass"
        || parent.report.fields.sourceSha256 !== input.sha256 || parent.report.specimens.sourceSha256 !== input.sha256) throw new Error("parent binding");
      const universe = independentlyEnumerateApiTesterOperations(source, input.format);
      if (!universe.complete) throw new Error("parent source enumeration incomplete");
      const keys = universe.operations.map((o) => o.key);
      if (stable(parent.report.operations.map((o: any) => o.key).sort()) !== stable([...keys].sort())) throw new Error("parent source operation inventory");
      const report = buildApiRequestBodyNegatives(derived, "json"), check = verifyApiRequestBodyNegatives(derived, "json", report);
      const before = bodyNegativeSemantics(parent.report, keys), after = bodyNegativeSemantics(report, keys);
      const sameSemantics = stable(before) === stable(after);
      const changes = keys.filter((key) => stable(before.find((o) => o.key === key)) !== stable(after.find((o) => o.key === key)));
      await writeFile(resolve(out, `${input.inputId}.input.json`), derived, { flag: "wx" });
      const artifact = JSON.stringify({ report, verification: check }, null, 2) + "\n";
      await writeFile(resolve(out, `${input.inputId}.report.json`), artifact, { flag: "wx" });
      rows.push({ inputId: input.inputId, parentPath: sourcePath, parentSha256: input.sha256,
        parentReportPath: priorPath, parentReportSha256: sha(priorBytes), parentRecordedCheck: parent.verification,
        derivedPath: `${outPath}/${input.inputId}.input.json`, derivedSha256: sha(derived),
        artifactPath: `${outPath}/${input.inputId}.report.json`, artifactSha256: sha(artifact), check,
        sameSemantics, changedOperations: changes, parentSemanticSha256: sha(stable(before)), derivedSemanticSha256: sha(stable(after)),
        status: sameSemantics && check.status === "pass" ? "pass" : "fail" });
    } catch (error) { rows.push({ inputId: input.inputId, status: "error", error: String(error) }); }
    console.log(JSON.stringify(rows.at(-1)));
  }
  const sourceFiles = ["scripts/skill-ir/api-request-body-real-order.ts", "scripts/skill-ir/api-request-body-metamorphic.ts",
    "src/skill-ir/api-request-body-negatives.ts", "src/skill-ir/api-request-body-negatives-checker.ts", "bun.lock"];
  const sourceBindings = await Promise.all(sourceFiles.map(async (path) => ({ path, sha256: sha(await readFile(path)) })));
  await writeFile(resolve(out, "report.json"), JSON.stringify({ exposure: "derived-development", transform: "reverse-all-object-keys",
    parameters: { arraysUnchanged: true, dataModelPreserved: true, yamlToJson: true }, inputIndexSha256: sha(indexBytes),
    runtime: { bun: Bun.version }, sourceBindings, rows, originalRegenerated: false, parentChecksReused: true,
    independentNewRealSamples: 0, projectModelCalls: 0, paidCalls: 0 }, null, 2) + "\n", { flag: "wx" });
  if (rows.some((r) => r.status !== "pass")) process.exitCode = 1;
}
