import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("validated artifact assembly parity runner", () => {
  test("writes the default two-phenotype compact report", async () => {
    const module = await import("./validated-artifact-assembly-parity-run").catch(() => ({}));
    expect(module).toHaveProperty("writeDefaultValidatedArtifactAssemblyParityReport");
    const writeReport = (module as {
      writeDefaultValidatedArtifactAssemblyParityReport: (
        rootDir: string,
        outPath: string,
      ) => Promise<void>;
    }).writeDefaultValidatedArtifactAssemblyParityReport;
    const directory = await mkdtemp(join(tmpdir(), "artifact-assembly-parity-run-"));
    tempDirs.push(directory);
    const outPath = join(directory, "report.json");

    await writeReport(process.cwd(), outPath);

    const report = JSON.parse(await readFile(outPath, "utf8")) as {
      schemaVersion: string;
      summary: { ready: boolean };
    };
    expect(report.schemaVersion).toBe("validated-artifact-assembly-parity/v1");
    expect(report.summary.ready).toBe(true);
  });
});
