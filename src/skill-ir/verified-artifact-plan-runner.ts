import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ThinTaskDescriptionSchema } from "../benchmarks/skill-ir/automatic-domain-construction";
import {
  RestrictedDomainPlanSchema,
  executeRestrictedDomainPlan,
} from "../benchmarks/skill-ir/automatic-restricted-domain-plan";

async function listFiles(rootDir: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(rootDir, current), { withFileTypes: true })) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    const info = await lstat(join(rootDir, relativePath));
    if (info.isSymbolicLink()) throw new Error(`workdir symbolic link is forbidden: ${relativePath}`);
    if (info.isDirectory()) files.push(...await listFiles(rootDir, relativePath));
    else if (info.isFile()) files.push(relativePath);
    else throw new Error(`workdir special entry is forbidden: ${relativePath}`);
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

const [planPath, taskDescriptionPath, workDirArgument] = process.argv.slice(2);
if (!planPath || !taskDescriptionPath || !workDirArgument) {
  throw new Error("usage: verified-artifact-plan-runner <plan> <task-description> <workdir>");
}
const workDir = resolve(workDirArgument);
const plan = RestrictedDomainPlanSchema.parse(JSON.parse(await readFile(resolve(planPath), "utf8")));
const description = ThinTaskDescriptionSchema.parse(JSON.parse(await readFile(resolve(taskDescriptionPath), "utf8")));
const writablePaths = description.outputs.map((output) => output.path);
const writable = new Set(writablePaths);
const readablePaths = (await listFiles(workDir)).filter((path) => !writable.has(path));
const execution = await executeRestrictedDomainPlan({ workDir, plan, readablePaths, writablePaths });
process.stdout.write(`${JSON.stringify({
  ...execution,
  workDir: relative(process.cwd(), workDir).replaceAll("\\", "/") || ".",
})}\n`);
