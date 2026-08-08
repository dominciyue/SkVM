import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runValidatedArtifactAssemblyParity } from "./validated-artifact-assembly-parity";

const DEFAULT_OUT = "results/skill-ir/validated-artifact-assembly-parity.json";

export async function writeDefaultValidatedArtifactAssemblyParityReport(
  rootDir: string,
  outPath: string,
): Promise<void> {
  const report = await runValidatedArtifactAssemblyParity({
    rootDir,
    cases: [
      {
        caseId: "api-tester-openapi-yaml",
        phenotype: "schema-derived-tool-generation",
        packagePath:
          "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1/openapi-yaml",
      },
      {
        caseId: "experimental-design-v1-mechanism",
        phenotype: "deterministic-design-generation",
        packagePath:
          "benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1",
      },
    ],
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function outArgument(argv: string[]): string {
  const raw = argv.find((argument) => argument.startsWith("--out="));
  return resolve(process.cwd(), raw?.slice("--out=".length) || DEFAULT_OUT);
}

if (import.meta.main) {
  const outPath = outArgument(process.argv.slice(2));
  await writeDefaultValidatedArtifactAssemblyParityReport(process.cwd(), outPath);
  process.stdout.write(`${JSON.stringify({ out: outPath, ready: true }, null, 2)}\n`);
}
