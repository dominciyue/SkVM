import { readFile } from "node:fs/promises";
import { InitialWorkdirManifestSchema } from "../../core/workdir-manifest";
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

const [structuralPlan, initialManifest] = await Promise.all([
  readFile(argument("--structural-plan"), "utf8").then((value) => StructuralExecutionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--initial-manifest"), "utf8").then((value) => InitialWorkdirManifestSchema.parse(JSON.parse(value))),
]);
const structural = await evaluateStructuralExecutionPlan({
  workDir: argument("--workdir"),
  initialManifest,
  plan: structuralPlan,
});
console.log(JSON.stringify(SkillArtifactValidationReportSchema.parse({
  schemaVersion: "skill-artifact-validation-report/v1",
  status: structural.errors.length === 0 ? "pass" : "fail",
  errors: structural.errors,
})));
