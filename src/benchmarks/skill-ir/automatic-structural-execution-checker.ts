import { readFile } from "node:fs/promises";
import { InitialWorkdirManifestSchema } from "../../core/workdir-manifest";
import {
  evaluateStructuralExecutionPlan,
  StructuralExecutionPlanSchema,
} from "./automatic-structural-execution";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const plan = StructuralExecutionPlanSchema.parse(JSON.parse(
  await readFile(argument("--plan"), "utf8"),
));
const initialManifest = InitialWorkdirManifestSchema.parse(JSON.parse(
  await readFile(argument("--initial-manifest"), "utf8"),
));
const report = await evaluateStructuralExecutionPlan({
  workDir: argument("--workdir"),
  initialManifest,
  plan,
});

console.log(JSON.stringify(report));
