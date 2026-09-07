import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildAiAssistedDevelopmentRouting } from "./ai-assisted-development-routing";

function value(name: string): string {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!entry) throw new Error(`Missing --${name}=...`);
  return entry.slice(prefix.length);
}

const rootDir = resolve(value("root"));
const workspaceRoot = resolve(value("workspace-root"));
const annotationRoot = resolve(value("annotation-root"));
const outPath = resolve(value("out"));
const routing = await buildAiAssistedDevelopmentRouting({ rootDir, workspaceRoot, annotationRoot });
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(routing, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({
  identity: routing.identity,
  units: routing.denominator.uniqueUnits,
  originalQ1Complete: routing.evidenceBoundary.completesOriginalQ1,
}));
