import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeProspectiveDynamicCandidateReport } from "./prospective-dynamic-candidate.ts";

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const rootDir = path.resolve(option("root", process.cwd()));
const portfolioPath = path.resolve(rootDir, option(
  "portfolio",
  "benchmarks/skill-ir/corpus/method-portfolio.json",
));
const intakePath = path.resolve(rootDir, option(
  "intake",
  "benchmarks/skill-ir/corpus/real-skill-intake.json",
));
const policyPath = path.resolve(rootDir, option(
  "policy",
  "benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json",
));
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/prospective-dynamic-candidate.json",
));

const [portfolio, intake, policy] = await Promise.all([
  readFile(portfolioPath, "utf8").then(JSON.parse),
  readFile(intakePath, "utf8").then(JSON.parse),
  readFile(policyPath, "utf8").then(JSON.parse),
]);
const report = await writeProspectiveDynamicCandidateReport({
  rootDir,
  portfolio,
  intake,
  policy,
  outputPath,
});
console.log(JSON.stringify({
  outputPath: path.relative(rootDir, outputPath),
  selectedSkillId: report.selectedSkillId,
  candidateCount: report.candidateCount,
  nextStage: report.nextStage,
  authorizations: report.authorizations,
}, null, 2));
