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

describe("experimental-design v2 artifact local qualification", () => {
  test.skipIf(!process.env.SKVM_PYTHON)(
    "writes a compact two-task scorer-authoritative report",
    async () => {
      const module = await import("./experimental-design-v2-artifact-qualification-run").catch(() => ({}));
      expect(module).toHaveProperty("writeExperimentalDesignV2ArtifactQualificationReport");
      const writeReport = (module as {
        writeExperimentalDesignV2ArtifactQualificationReport: (options: {
          rootDir: string;
          packageDir: string;
          outPath: string;
          python: string;
        }) => Promise<{ summary: { ready: boolean } }>;
      }).writeExperimentalDesignV2ArtifactQualificationReport;
      const directory = await mkdtemp(join(tmpdir(), "experimental-design-v2-qualification-"));
      tempDirs.push(directory);
      const outPath = join(directory, "report.json");

      const returned = await writeReport({
        rootDir: process.cwd(),
        packageDir: join(
          process.cwd(),
          "benchmarks/skill-ir/pilots/experimental-design/v2/packages/validated-skill-artifact-v1",
        ),
        outPath,
        python: process.env.SKVM_PYTHON!,
      });

      const report = JSON.parse(await readFile(outPath, "utf8")) as {
        schemaVersion: string;
        summary: Record<string, unknown>;
      };
      expect(report.schemaVersion).toBe("experimental-design-v2-artifact-local-qualification/v1");
      expect(report.summary).toEqual({
        taskCount: 2,
        runtimeCompleteCount: 2,
        scorerSuccessCount: 2,
        meanScore: 1,
        protectedInputPassCount: 2,
        modelGenerationTokens: 0,
        modelRepairTokens: 0,
        ready: true,
      });
      expect(returned.summary.ready).toBe(true);
    },
    120_000,
  );
});
