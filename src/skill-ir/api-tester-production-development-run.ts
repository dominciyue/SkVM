import { resolve } from "node:path";
import { resolveArtifactNodeExecutable } from "./verified-artifact-presets";
import { runApiTesterProductionDevelopment } from "./api-tester-production-development";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const rootDir = resolve(flag("root") ?? process.cwd());
const out = flag("out");
if (!out) throw new Error("--out=<new-empty-directory> is required");

const report = await runApiTesterProductionDevelopment({
  rootDir,
  outDir: resolve(rootDir, out),
  nodeExecutable: resolveArtifactNodeExecutable(),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
