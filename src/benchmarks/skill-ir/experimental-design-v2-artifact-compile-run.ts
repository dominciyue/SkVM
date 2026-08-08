import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256Bytes } from "./source-fixture";
import {
  compileExperimentalDesignV2Artifact,
  loadExperimentalDesignV2ArtifactCompilerInput,
} from "./experimental-design-v2-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const DEFAULT_OUT =
  "benchmarks/skill-ir/pilots/experimental-design/v2/packages/validated-skill-artifact-v1";

export async function writeExperimentalDesignV2ArtifactPackage(
  rootDir: string,
  outDir: string,
): Promise<{
  skillId: string;
  catalog: string;
  packageBytes: number;
  packageManifestSha256: string;
}> {
  await compileExperimentalDesignV2Artifact(
    await loadExperimentalDesignV2ArtifactCompilerInput(rootDir),
    outDir,
  );
  const packageRecord = await validateValidatedArtifactPackage(outDir);
  return {
    skillId: packageRecord.manifest.skillId,
    catalog: packageRecord.manifest.catalog,
    packageBytes: packageRecord.packageBytes,
    packageManifestSha256: sha256Bytes(await readFile(resolve(outDir, "package-manifest.json"))),
  };
}

function outputArgument(argv: string[], rootDir: string): string {
  const raw = argv.find((argument) => argument.startsWith("--out="));
  return resolve(rootDir, raw?.slice("--out=".length) || DEFAULT_OUT);
}

if (import.meta.main) {
  const rootDir = resolve(import.meta.dir, "../../..");
  const outDir = outputArgument(process.argv.slice(2), rootDir);
  const report = await writeExperimentalDesignV2ArtifactPackage(rootDir, outDir);
  process.stdout.write(`${JSON.stringify({ outDir, ...report }, null, 2)}\n`);
}
