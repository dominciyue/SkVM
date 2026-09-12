import { resolve } from "node:path";
import { runApiTask, type RunApiTaskOptions } from "../skill-ir/api-task-run";

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

export function parseApiTaskCliArguments(args: string[], cwd = process.cwd()): RunApiTaskOptions {
  const known = new Set(["--task", "--binding", "--out", "--python"]);
  for (const argument of args) {
    if (argument === "--help" || argument === "-h") continue;
    const name = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : argument;
    if (!known.has(name)) throw new Error(`unknown task option: ${name}`);
  }
  const task = flag(args, "task"), binding = flag(args, "binding"), out = flag(args, "out"), pythonExecutable = flag(args, "python");
  if (binding && (task || out)) throw new Error("--binding and --task/--out are mutually exclusive");
  if (binding) return { bindingPath: portable(resolve(cwd, binding)), pythonExecutable };
  if (!task) throw new Error("--task=<task.json> is required when --binding is absent");
  if (!out) throw new Error("--out=<new-directory> is required with --task");
  return { taskPath: portable(resolve(cwd, task)), outputDirectory: portable(resolve(cwd, out)), pythonExecutable };
}

export function apiTaskCliHelp() {
  return `skvm artifact task — compile, independently check, bundle, and optionally consume an OpenAPI TaskContract

Usage:
  skvm artifact task --task=<task.json> --out=<new-directory> [--python=<executable>]
  skvm artifact task --binding=<run-binding.json> [--python=<executable>]

The strict run binding supplies task/input paths, formats, SHA-256 digests, optional dependency/observation/oracle files, and output directory.
The direct task form records an equivalent resolved binding in the output. Existing production API Tester v1/v2 presets are unchanged.`;
}

export async function runApiTaskCli(args: string[], cwd = process.cwd()) {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${apiTaskCliHelp()}\n`);
    return undefined;
  }
  const report = await runApiTask(parseApiTaskCliArguments(args, cwd));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === "failed") process.exitCode = 1;
  return report;
}

if (import.meta.main) {
  runApiTaskCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
