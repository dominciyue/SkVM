import { describe, expect, test } from "bun:test";
import { parseVerifiedArtifactCliArguments, requireUserAcceptance } from "./verified-artifact-cli";

describe("verified artifact standalone CLI", () => {
  test("parses one-command workflow inputs and keeps acceptance explicit", () => {
    expect(parseVerifiedArtifactCliArguments([
      "--root=D:/repo",
      "--config=config.json",
      "--workdir=workdir",
      "--out=product",
      "--accept",
      "--accepted-at=2026-08-29T01:10:00.000Z",
      "--human-minutes=3",
      "--note=Reviewed exact delta",
    ], "D:/fallback")).toEqual({
      rootDir: "D:/repo",
      configPath: "D:/repo/config.json",
      workDir: "D:/repo/workdir",
      outDir: "D:/repo/product",
      acceptance: {
        decision: "accepted",
        acceptedAt: "2026-08-29T01:10:00.000Z",
        humanMinutes: 3,
        note: "Reviewed exact delta",
      },
    });
  });

  test("rejects implicit or zero-cost B acceptance", () => {
    const common = ["--config=config.json", "--workdir=workdir", "--out=product"];
    expect(() => requireUserAcceptance(parseVerifiedArtifactCliArguments(common, "D:/repo"))).toThrow("--accept");
    expect(() => parseVerifiedArtifactCliArguments([
      ...common,
      "--accept",
      "--accepted-at=2026-08-29T01:10:00.000Z",
      "--human-minutes=0",
      "--note=Reviewed",
    ], "D:/repo")).toThrow("positive");
  });
});
