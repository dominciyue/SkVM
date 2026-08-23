import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeProspectiveQualityCandidateReport } from "./prospective-quality-candidate";

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const rootDir = path.resolve(option("root", process.cwd()));
const intakePath = path.resolve(rootDir, option(
  "intake",
  "benchmarks/skill-ir/corpus/real-skill-intake.json",
));
const policyPath = path.resolve(rootDir, option(
  "policy",
  "benchmarks/skill-ir/corpus/prospective-quality-candidate.json",
));
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/prospective-quality-candidate.json",
));

const [intake, policy] = await Promise.all([
  readFile(intakePath, "utf8").then(JSON.parse),
  readFile(policyPath, "utf8").then(JSON.parse),
]);
const report = await writeProspectiveQualityCandidateReport({ rootDir, intake, policy, outputPath });
process.stdout.write(`${JSON.stringify({
  outputPath: path.relative(rootDir, outputPath),
  selectedSkillId: report.selectedSkillId,
  nextStage: report.nextStage,
  paidCallCeiling: report.paidCallCeiling,
  authorizations: report.authorizations,
}, null, 2)}\n`);
