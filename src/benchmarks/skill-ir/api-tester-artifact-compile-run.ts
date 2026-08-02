import { resolve } from "node:path";
import { compileApiTesterValidatedArtifactVariants } from "./api-tester-artifact-compiler";

const rootDir = resolve(import.meta.dir, "../../..");
const outRoot = resolve(
  rootDir,
  "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1",
);
const report = await compileApiTesterValidatedArtifactVariants(rootDir, outRoot);
console.log(JSON.stringify({
  schemaVersion: "api-tester-artifact-compile-report/v1",
  packages: report.map((entry) => ({
    variantId: entry.variantId,
    packageDir: entry.packageDir,
    packageBytes: entry.packageBytes,
  })),
}, null, 2));
