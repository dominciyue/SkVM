import { resolve } from "node:path";
import { validateArtifactPackage } from "./artifact-package";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function requiredArg(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`--${name} is required`);
  return resolve(value);
}

const verifyOnly = arg("verify-only");
if (verifyOnly) {
  const validated = await validateArtifactPackage({
    packageDir: resolve(verifyOnly),
    expectedCatalog: "executable-semantic-artifact/v2",
  });
  console.log(JSON.stringify({
    verified: true,
    catalog: validated.manifest.catalog,
    packageDir: validated.packageDir,
  }, null, 2));
} else {
  const result = await compileEnvManagerSemanticArtifactPackage({
    rootDir: requiredArg("root-dir"),
    baseIrPath: requiredArg("base-ir"),
    taskSetPath: requiredArg("tasks"),
    sourcePath: requiredArg("source"),
    outDir: requiredArg("out-dir"),
  });
  console.log(JSON.stringify({
    compiled: true,
    catalog: result.manifest.catalog,
    skillId: result.manifest.skillId,
  }, null, 2));
}
