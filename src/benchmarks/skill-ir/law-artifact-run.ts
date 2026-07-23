import { resolve } from "node:path";
import {
  compileLawValidatedArtifact,
  loadLawArtifactCompilerInput,
} from "./law-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const verifyOnly = option("verify-only");
if (verifyOnly) {
  const record = await validateValidatedArtifactPackage(resolve(verifyOnly));
  console.log(JSON.stringify({
    status: "ok",
    catalog: record.manifest.catalog,
    skillId: record.manifest.skillId,
    artifacts: record.manifest.artifacts.length,
    nodes: record.executionPlan.nodes.length,
    packageBytes: record.packageBytes,
  }, null, 2));
} else {
  const rootDir = resolve(option("root-dir") ?? ".");
  const outDirOption = option("out-dir");
  if (!outDirOption) throw new Error("Missing --out-dir=<path>");
  const outDir = resolve(outDirOption);
  await compileLawValidatedArtifact(await loadLawArtifactCompilerInput(rootDir), outDir);
  const record = await validateValidatedArtifactPackage(outDir);
  console.log(JSON.stringify({
    status: "compiled",
    catalog: record.manifest.catalog,
    skillId: record.manifest.skillId,
    artifacts: record.manifest.artifacts.length,
    nodes: record.executionPlan.nodes.length,
    packageBytes: record.packageBytes,
    outDir,
  }, null, 2));
}
