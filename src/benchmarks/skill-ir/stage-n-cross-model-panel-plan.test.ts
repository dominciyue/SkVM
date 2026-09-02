import { describe, expect, test } from "bun:test";
import { buildStageNPlanProjection } from "./stage-n-cross-model-panel-plan";

describe("Stage N plan", () => {
  test("projects exact denominator, GPT bindings, and smoke rows without matrix authorization", async () => {
    const projection = await buildStageNPlanProjection({
      rootDir: "D:/skill优化/SkVM",
      lockPath: "D:/skill优化/SkVM/benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json",
      outDir: "D:/skill优化/SkVM/results/skill-ir/stage-n-cross-model-aot-stability-001",
      verifyFiles: false,
    });
    expect(projection.denominator).toEqual({ originalRows: 24, artifactRows: 8, logicalRows: 32 });
    expect(projection.matrixAuthorized).toBe(false);
    expect(projection.smokeRows).toHaveLength(6);
    expect(projection.gptBindings).toHaveLength(2);
  });
});
