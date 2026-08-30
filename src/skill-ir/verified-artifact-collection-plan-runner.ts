import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { ThinTaskDescriptionSchema } from "../benchmarks/skill-ir/automatic-domain-construction";
import {
  VerifiedArtifactCollectionPlanSchema,
  executeVerifiedArtifactCollectionPlan,
} from "./verified-artifact-collection-plan";

const [planPath, taskDescriptionPath, workDirArgument] = process.argv.slice(2);
if (!planPath || !taskDescriptionPath || !workDirArgument) {
  throw new Error("usage: verified-artifact-collection-plan-runner <plan> <task-description> <workdir>");
}
const workDir = resolve(workDirArgument);
const plan = VerifiedArtifactCollectionPlanSchema.parse(JSON.parse(await readFile(resolve(planPath), "utf8")));
const description = ThinTaskDescriptionSchema.parse(JSON.parse(await readFile(resolve(taskDescriptionPath), "utf8")));
const execution = await executeVerifiedArtifactCollectionPlan({ plan, workDir, taskDescription: description });
process.stdout.write(`${JSON.stringify({
  schemaVersion: "skill-ir-verified-artifact-collection-plan-execution/v1",
  status: "complete",
  ...execution,
  paidCalls: 0,
  heldOutAccesses: 0,
  skillSpecificBranches: 0,
  workDir: relative(process.cwd(), workDir).replaceAll("\\", "/") || ".",
})}\n`);
