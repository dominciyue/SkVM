import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildApiRequestSpecimens } from "../../src/skill-ir/api-request-specimens";
import { verifyApiRequestSpecimens } from "../../src/skill-ir/api-request-specimens-checker";
import { buildApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives-checker";
import { decodeDevelopmentUtf8 } from "../../src/skill-ir/development-utf8";
import { normalizeRepositoryRelativePath, resolveContainedExistingFile, createContainedDirectory } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const boundFiles = ["src/skill-ir/api-request-specimens.ts", "src/skill-ir/api-request-specimens-checker.ts",
  "src/skill-ir/api-tester-operation-source.ts", "src/skill-ir/api-tester-operation-coverage.ts",
  "src/skill-ir/api-schema-witness.ts", "src/skill-ir/api-schema-checker.ts", "src/skill-ir/api-parameter-wire.ts",
  "src/skill-ir/api-parameter-wire-checker.ts", "scripts/skill-ir/api-request-specimens-development.ts",
  "docs/skill-ir/api-request-specimens-development.md", "src/skill-ir/development-utf8.ts", "package.json", "bun.lock"];

export async function runSpecimenDevelopment(options: { rootDir: string; inputIndexPath: string; outputPath: string; executionRoot: string; profile?: "specimens" | "body-negatives" }) {
  if (options.profile !== undefined && !["specimens", "body-negatives"].includes(options.profile)) throw new Error("unknown development profile");
  const indexPath = await resolveContainedExistingFile(options.rootDir, options.inputIndexPath, "specimen input index");
  const indexBytes = await readFile(indexPath), index = JSON.parse(decodeDevelopmentUtf8(indexBytes));
  if (!Array.isArray(index.inputs) || index.inputs.some((i: any) => !i || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(i.inputId))
    || new Set(index.inputs.map((i: any) => i.inputId)).size !== index.inputs.length) throw new Error("unique safe input identities required");
  const out = await createContainedDirectory(options.rootDir, options.outputPath, "specimen output");
  const git = execFileSync("git", ["-c", `safe.directory=${options.executionRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"],
    { cwd: options.executionRoot, encoding: "utf8", windowsHide: true }).trim();
  const report = { exposure: "development", profile: options.profile ?? "specimens", executionCommit: git, inputIndexSha256: digest(indexBytes), startedAt: new Date().toISOString(),
    runtime: { bun: Bun.version, node: execFileSync(Bun.which("node") ?? "node", ["--version"], { encoding: "utf8", windowsHide: true }).trim(), platform: process.platform, architecture: process.arch },
    sourceBindings: await Promise.all([...boundFiles, ...(options.profile === "body-negatives" ? [
      "src/skill-ir/api-request-body-negatives.ts", "src/skill-ir/api-request-body-negatives-checker.ts",
      "src/skill-ir/api-request-cases.ts", "src/skill-ir/api-request-cases-checker.ts", "src/skill-ir/api-schema-cases.ts",
      "src/skill-ir/api-schema-case-checker.ts", "src/skill-ir/api-schema-obligations.ts", "docs/skill-ir/api-request-body-negatives-development.md",
    ] : [])].map(async (path) => ({ path, sha256: digest(await readFile(resolve(options.executionRoot, path))) }))),
    rows: [] as Array<{ inputId: string; status: string; operations?: number; planned?: number; constructed?: number; unresolved?: number;
      presenceNegatives?: number; incompleteInventories?: number; bodySchemaInventoriesIncomplete?: number; operationsWithFieldIssues?: number;
      allCasesConstructedOperations?: number; errors?: string[]; error?: string; elapsedMs: number }>,
    wholeSkillCompleted: false, projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate" };
  for (const row of index.inputs) {
    const started = performance.now();
    try {
      if (row.status !== "acquired") throw new Error("declared input unavailable");
      if (!["json", "yaml"].includes(row.format) || typeof row.sha256 !== "string") throw new Error("input binding fields required");
      const local = normalizeRepositoryRelativePath(row.localPath, "specimen source input");
      const sourcePath = relative(options.rootDir, resolve(dirname(indexPath), local)).replaceAll("\\", "/");
      const bytes = await readFile(await resolveContainedExistingFile(options.rootDir, sourcePath, "specimen source"));
      if (digest(bytes) !== row.sha256) throw new Error("input digest mismatch");
      const source = decodeDevelopmentUtf8(bytes);
      if (options.profile === "body-negatives") {
        const negatives = buildApiRequestBodyNegatives(source, row.format);
        const verification = verifyApiRequestBodyNegatives(source, row.format, negatives);
        await writeFile(resolve(out, `${row.inputId}.json`), JSON.stringify({ inputId: row.inputId, report: negatives, verification }, null, 2) + "\n", { flag: "wx" });
        report.rows.push({ inputId: row.inputId, status: verification.status, operations: negatives.operations.length,
          planned: verification.obligations, constructed: verification.constructed, unresolved: verification.unresolved,
          bodySchemaInventoriesIncomplete: negatives.fields.operations.flatMap((o) => o.schemas).filter((s) => s.location === "body" && s.cases.sourceIssues.length > 0).length,
          operationsWithFieldIssues: negatives.fields.operations.filter((o) => o.issues.length > 0).length,
          errors: verification.errors, elapsedMs: performance.now() - started });
      } else {
      const specimens = buildApiRequestSpecimens(source, row.format);
      const verification = verifyApiRequestSpecimens(source, row.format, specimens);
      await writeFile(resolve(out, `${row.inputId}.json`), JSON.stringify({ inputId: row.inputId, report: specimens, verification }, null, 2) + "\n", { flag: "wx" });
      report.rows.push({ inputId: row.inputId, status: verification.status, operations: verification.sourceOperations, planned: verification.plannedCases,
        constructed: verification.constructedCases, unresolved: verification.unresolvedCases, presenceNegatives: verification.presenceNegativeCases,
        incompleteInventories: specimens.operations.filter((o) => !o.caseInventoryComplete).length,
        allCasesConstructedOperations: specimens.operations.filter((o) => o.caseInventoryComplete && o.cases.length && o.cases.every((c) => c.status === "constructed")).length,
        errors: verification.errors, elapsedMs: performance.now() - started });
      }
    } catch (error) { report.rows.push({ inputId: row.inputId, status: "error", error: String(error), elapsedMs: performance.now() - started }); }
    await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report.rows.at(-1)));
  }
  return report;
}

if (import.meta.main) {
  const inputIndexPath = process.argv.find((v) => v.startsWith("--inputs="))?.slice(9);
  const outputPath = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
  const profile = process.argv.find((v) => v.startsWith("--profile="))?.slice(10);
  if (profile !== undefined && !["specimens", "body-negatives"].includes(profile)) throw new Error("unknown development profile");
  if (!inputIndexPath || !outputPath) throw new Error("--inputs=<bound-index.json> --out=<new-directory>");
  await runSpecimenDevelopment({ rootDir: process.cwd(), executionRoot: process.cwd(), inputIndexPath, outputPath, profile: profile as "specimens" | "body-negatives" | undefined });
}
