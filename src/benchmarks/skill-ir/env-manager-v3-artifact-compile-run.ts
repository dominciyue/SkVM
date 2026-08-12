import path from "node:path";
import {
  compileEnvManagerV3ValidatedArtifact,
  loadEnvManagerV3ArtifactCompilerInput,
  type EnvManagerV3ArtifactVariantId,
} from "./env-manager-v3-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

export async function compileEnvManagerV3ArtifactVariants(
  rootDir = process.cwd(),
  outRoot = "benchmarks/skill-ir/pilots/env-manager/successor-v3/packages/validated-skill-artifact-v1",
) {
  const variants: EnvManagerV3ArtifactVariantId[] = ["node", "vite"];
  const report = [];
  for (const variantId of variants) {
    const packageDir = path.resolve(rootDir, outRoot, variantId);
    await compileEnvManagerV3ValidatedArtifact(
      await loadEnvManagerV3ArtifactCompilerInput(rootDir, variantId),
      packageDir,
    );
    const validated = await validateValidatedArtifactPackage(packageDir);
    report.push({ variantId, packageDir, packageBytes: validated.packageBytes });
  }
  return report;
}

if (import.meta.main) {
  console.log(JSON.stringify(await compileEnvManagerV3ArtifactVariants(), null, 2));
}
