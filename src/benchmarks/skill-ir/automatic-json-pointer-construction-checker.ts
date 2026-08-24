import { readFile } from "node:fs/promises";
import { InitialWorkdirManifestSchema } from "../../core/workdir-manifest";
import {
  AutomaticJsonPointerConstructionPlanSchema,
  evaluateAutomaticJsonPointerRelations,
} from "./automatic-json-pointer-construction";
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

const [structuralPlan, basePlan, pointerPlan, initialManifest] = await Promise.all([
  readFile(argument("--structural-plan"), "utf8").then((value) =>
    StructuralExecutionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--base-plan"), "utf8").then((value) =>
    AutomaticOutputConstructionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--pointer-plan"), "utf8").then((value) =>
    AutomaticJsonPointerConstructionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--initial-manifest"), "utf8").then((value) =>
    InitialWorkdirManifestSchema.parse(JSON.parse(value))),
]);
const workDir = argument("--workdir");
const [structural, baseRelations, pointerRelations] = await Promise.all([
  evaluateStructuralExecutionPlan({ workDir, initialManifest, plan: structuralPlan }),
  evaluateAutomaticOutputRelations(workDir, basePlan),
  evaluateAutomaticJsonPointerRelations(workDir, pointerPlan),
]);
const baseRelationTargets = basePlan.outputs.flatMap((output) =>
  output.assignments.map(() => output.path));
const baseRelationErrors = baseRelations.errors.map((entry) => ({
  code: entry.code,
  contractRef: "auto-source-field-projection",
  relativePath: baseRelationTargets[entry.relationIndex],
}));
const pointerRelationErrors = pointerRelations.errors.map((entry) => ({
  code: entry.code,
  contractRef: "auto-json-pointer-copy",
  relativePath: pointerPlan.operations[entry.relationIndex]?.target.path,
}));
const errors = [...structural.errors, ...baseRelationErrors, ...pointerRelationErrors];
const report = SkillArtifactValidationReportSchema.parse({
  schemaVersion: "skill-artifact-validation-report/v1",
  status: errors.length === 0 ? "pass" : "fail",
  errors,
});
console.log(JSON.stringify(report));
