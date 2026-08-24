import { readFile } from "node:fs/promises";
import {
  AutomaticJsonPointerConstructionPlanSchema,
  executeAutomaticJsonPointerConstructionPlan,
} from "./automatic-json-pointer-construction";
import { AutomaticOutputConstructionPlanSchema } from "./automatic-output-construction";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const [basePlan, pointerPlan] = await Promise.all([
  readFile(argument("--base-plan"), "utf8").then((value) =>
    AutomaticOutputConstructionPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--pointer-plan"), "utf8").then((value) =>
    AutomaticJsonPointerConstructionPlanSchema.parse(JSON.parse(value))),
]);
const report = await executeAutomaticJsonPointerConstructionPlan(
  argument("--workdir"),
  basePlan,
  pointerPlan,
);
console.log(JSON.stringify(report));
