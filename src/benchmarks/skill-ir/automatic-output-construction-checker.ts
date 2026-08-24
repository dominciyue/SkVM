import { readFile } from "node:fs/promises";
import { InitialWorkdirManifestSchema } from "../../core/workdir-manifest";
import {
  AutomaticOutputConstructionPlanSchema,
  evaluateAutomaticOutputRelations,
} from "./automatic-output-construction";
import {
  evaluateStructuralExecutionPlan,
  StructuralExecutionPlanSchema,
} from "./automatic-structural-execution";
import { SkillArtifactValidationReportSchema } from "./validated-artifact-runtime";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const [structuralPlan, constructionPlan, initialManifest] = await Promise.all([
  readFile(argument("--structural-plan"), "utf8").then((value) => StructuralExecutionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--construction-plan"), "utf8").then((value) => AutomaticOutputConstructionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--initial-manifest"), "utf8").then((value) => InitialWorkdirManifestSchema.parse(JSON.parse(value))),
]);
const workDir = argument("--workdir");
const [structural, relations] = await Promise.all([
  evaluateStructuralExecutionPlan({ workDir, initialManifest, plan: structuralPlan }),
  evaluateAutomaticOutputRelations(workDir, constructionPlan),
]);
const relationTargets = constructionPlan.outputs.flatMap((output) =>
  output.assignments.map(() => output.path));
const relationErrors = relations.errors.map((entry) => ({
  code: entry.code,
  contractRef: "auto-source-field-projection",
  relativePath: relationTargets[entry.relationIndex],
}));
const errors = [...structural.errors, ...relationErrors];
const report = SkillArtifactValidationReportSchema.parse({
  schemaVersion: "skill-artifact-validation-report/v1",
  status: errors.length === 0 ? "pass" : "fail",
  errors,
});
console.log(JSON.stringify(report));
