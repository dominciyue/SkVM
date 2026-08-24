import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  executeRestrictedDomainPlan,
  RestrictedDomainPlanSchema,
} from "./automatic-restricted-domain-plan";

const BindingsSchema = z.object({
  readablePaths: z.array(z.string()),
  writablePaths: z.array(z.string()),
}).strict();

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const [plan, bindings] = await Promise.all([
  readFile(argument("--domain-plan"), "utf8").then((value) => RestrictedDomainPlanSchema.parse(JSON.parse(value))),
  readFile(argument("--bindings"), "utf8").then((value) => BindingsSchema.parse(JSON.parse(value))),
]);
console.log(JSON.stringify(await executeRestrictedDomainPlan({
  workDir: argument("--workdir"),
  plan,
  ...bindings,
})));
