import { resolve } from "node:path";
import { resolveArtifactNodeExecutable } from "./verified-artifact-presets";
import { runApiTesterProductionSuccessorDevelopment } from "./api-tester-production-successor-development";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const rootDir = resolve(flag("root") ?? process.cwd());
const externalCache = flag("external-cache");
const out = flag("out");
if (!externalCache) throw new Error("--external-cache=<directory> is required");
if (!out) throw new Error("--out=<new-empty-directory> is required");

const report = await runApiTesterProductionSuccessorDevelopment({
  rootDir,
  externalCacheRoot: resolve(externalCache),
  outDir: resolve(rootDir, out),
  nodeExecutable: resolveArtifactNodeExecutable(),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
