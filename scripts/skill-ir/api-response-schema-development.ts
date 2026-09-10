import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { analyzeResponseSchemas } from "../../src/skill-ir/api-response-catalog";
import { createContainedDirectory, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";
export { analyzeResponseSchemas };
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

if (import.meta.main) {
  const inputs = process.argv.find((s) => s.startsWith("--inputs="))?.slice(9), outPath = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
  if (!inputs || !outPath) throw new Error("--inputs=<bound-index.json> --out=<new-directory>");
  const root = process.cwd(), indexPath = await resolveContainedExistingFile(root, inputs, "response input index");
  const indexBytes = await readFile(indexPath), index = JSON.parse(indexBytes.toString());
  if (!Array.isArray(index.inputs) || index.inputs.some((i: any) => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(i.inputId))
    || new Set(index.inputs.map((i: any) => i.inputId)).size !== index.inputs.length) throw new Error("safe unique input identities required");
  const out = await createContainedDirectory(root, outPath, "response output");
  const files = ["src/skill-ir/api-schema-checker.ts", "src/skill-ir/api-response-observation.ts", "src/skill-ir/api-response-catalog.ts", "scripts/skill-ir/api-response-schema-development.ts", "bun.lock"];
  const summary = { exposure: "development-source-examples", executionCommit: execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    inputIndexSha256: sha(indexBytes), sourceBindings: await Promise.all(files.map(async (path) => ({ path, sha256: sha(await readFile(path)) }))),
    runtime: { bun: Bun.version }, rows: [] as unknown[], projectModelCalls: 0, paidCalls: 0, liveObservations: 0, developerAgentCost: "unmeasured-separate" };
  for (const input of index.inputs) {
    try {
      const local = relative(root, resolve(dirname(indexPath), input.localPath)).replaceAll("\\", "/");
      const bytes = await readFile(await resolveContainedExistingFile(root, local, "response input"));
      if (input.status !== "acquired" || !["json", "yaml"].includes(input.format) || sha(bytes) !== input.sha256) throw new Error("input binding mismatch");
      const report = analyzeResponseSchemas(bytes.toString(), input.format), encoded = JSON.stringify(report, null, 2) + "\n";
      await writeFile(resolve(out, `${input.inputId}.json`), encoded, { flag: "wx" });
      summary.rows.push({ inputId: input.inputId, status: "analyzed", sourceSha256: sha(bytes), reportSha256: sha(encoded), totals: report.totals, enumerationComplete: report.enumerationComplete });
    } catch (error) { summary.rows.push({ inputId: input.inputId, status: "error", error: String(error) }); }
    await writeFile(resolve(out, "report.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify(summary.rows.at(-1)));
  }
}
