import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateVerifiedArtifactProduct } from "../../skill-ir/verified-artifact-product";
import {
  ENV_MANAGER_E1_CONFIG_PATH,
  runEnvManagerVerifiedArtifactE1,
} from "./verified-artifact-product-e1";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified artifact product E1", () => {
  test("runs the existing Env pilot through one evaluator-free product chain", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-verified-artifact-e1-"));
    temporaryDirectories.push(temporaryRoot);
    const workDir = join(temporaryRoot, "workdir");
    const outDir = join(temporaryRoot, "product");

    const result = await runEnvManagerVerifiedArtifactE1({
      rootDir,
      workDir,
      outDir,
      acceptedAt: "2026-08-29T02:00:00.000Z",
      acceptanceHumanMinutes: 1,
      acceptanceNote: "Conditionally accepted the exact declared output delta for this frozen reviewed pilot.",
    });

    expect(result.fixtureMaterialization).toMatchObject({
      role: "fixture-only",
      taskId: "env-manager-scorer-authority-node-dev-001",
      evaluatorLoaded: false,
    });
    expect(result.product).toMatchObject({
      candidate: { status: "review-required", automaticConstructionStatus: "non-executable", coreBranchDelta: 0 },
      qualityEvidence: { qualityEvidence: "user-accepted", researchDisposition: "not-eligible" },
      cost: {
        qualityEvidence: "user-accepted",
        claim: "token-saving-under-user-accepted-quality",
        researchEligibility: "not-eligible",
        breakEven: { status: "computed", calls: 1 },
        production: {
          oneTime: { acceptance: { humanMinutes: 1 }, reviewAdapter: { humanMinutes: 8, physicalLoc: 125 } },
          recurring: { acceptanceHumanMinutesPerRun: 0 },
        },
      },
    });
    const configText = await readFile(join(rootDir, ENV_MANAGER_E1_CONFIG_PATH), "utf8");
    expect(configText).not.toMatch(/taskSet|evaluator|scorer/iu);
    expect(await readFile(join(workDir, ".env.example"), "utf8")).toContain("APP_PORT=");
    expect(await validateVerifiedArtifactProduct(outDir)).toMatchObject({
      cost: { breakEven: { status: "computed", calls: 1 } },
    });
  });
});
