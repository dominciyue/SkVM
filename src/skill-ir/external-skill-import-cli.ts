import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExternalSkillImportRecipeSchema, importExternalSkill } from "./external-skill-import";

export type ExternalSkillImportCliArguments = {
  recipePath: string;
  sourceRoot: string;
  assetRoot: string;
  out: string;
};

function flagValue(args: string[], name: string): string | undefined {
  const prefix = "--" + name + "=";
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseExternalSkillImportCliArguments(args: string[], cwd = process.cwd()): ExternalSkillImportCliArguments {
  const known = new Set(["--recipe", "--source-root", "--asset-root", "--out"]);
  for (const arg of args) {
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!known.has(name)) throw new Error("unknown external-skill-import option: " + name);
    if (!arg.includes("=")) throw new Error(name + " requires a value");
  }
  const recipe = flagValue(args, "recipe"); const sourceRoot = flagValue(args, "source-root"); const assetRoot = flagValue(args, "asset-root"); const out = flagValue(args, "out");
  if (!recipe || !sourceRoot || !assetRoot || !out) throw new Error("--recipe=<path>, --source-root=<path>, --asset-root=<path>, and --out=<path> are required");
  return { recipePath: resolve(cwd, recipe), sourceRoot: resolve(cwd, sourceRoot), assetRoot: resolve(cwd, assetRoot), out: resolve(cwd, out) };
}

export async function runExternalSkillImportCli(args: string[], cwd = process.cwd()) {
  const parsed = parseExternalSkillImportCliArguments(args, cwd);
  const recipe = ExternalSkillImportRecipeSchema.parse(JSON.parse(await readFile(parsed.recipePath, "utf8")));
  const result = await importExternalSkill({ recipe, sourceRoot: parsed.sourceRoot, assetRoot: parsed.assetRoot, out: parsed.out });
  return { status: "complete" as const, bundleDir: result.bundleDir, importId: result.manifest.importId, workflowId: result.manifest.workflowId, manifestPath: "import-manifest.json", workflowConfigPath: "workflow-config.json", closureSha256: result.manifest.closureSha256 };
}

if (import.meta.main) {
  runExternalSkillImportCli(process.argv.slice(2)).then((result) => process.stdout.write(JSON.stringify(result) + "\n")).catch((error) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
}
