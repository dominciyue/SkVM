import { readFile } from "node:fs/promises";
import {
  AutomaticOutputConstructionPlanSchema,
  executeAutomaticOutputConstructionPlan,
} from "./automatic-output-construction";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const plan = AutomaticOutputConstructionPlanSchema.parse(JSON.parse(
  await readFile(argument("--plan"), "utf8"),
));
const report = await executeAutomaticOutputConstructionPlan(argument("--workdir"), plan);
console.log(JSON.stringify(report));
