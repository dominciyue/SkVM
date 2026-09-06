import { describe, expect, test } from "bun:test";
import {
  ARTIFACT_PRESETS,
  parseArtifactCliArguments,
  resolveArtifactPreset,
} from "./artifact";

describe("top-level verified artifact CLI", () => {
  test("parses the Env Manager machine-checked preset with contained paths", () => {
    expect(parseArtifactCliArguments([
      "--preset=env-manager",
      "--quality=machine-checked",
      "--root=D:/repo",
      "--workdir=work/env",
      "--out=out/env",
      "--completed-at=2026-09-04T00:00:00.000Z",
    ], "D:/fallback")).toEqual({
      preset: "env-manager",
      quality: "machine-checked",
      rootDir: "D:/repo",
      workDir: "D:/repo/work/env",
      outDir: "D:/repo/out/env",
      completedAt: "2026-09-04T00:00:00.000Z",
    });
  });

  test("requires an explicit API Tester variant or binding and rejects path escapes", () => {
    expect(() => parseArtifactCliArguments([
      "--preset=api-tester",
      "--root=D:/repo",
      "--workdir=work/api",
      "--out=out/api",
    ], "D:/fallback")).toThrow("--variant or --binding");

    expect(() => parseArtifactCliArguments([
      "--preset=api-tester",
      "--variant=openapi-json",
      "--root=D:/repo",
      "--workdir=../outside",
      "--out=out/api",
    ], "D:/fallback")).toThrow(/contained|escapes/u);

    expect(parseArtifactCliArguments([
      "--preset=api-tester",
      "--binding=config/api-binding.json",
      "--root=D:/repo",
      "--workdir=work/api",
      "--out=out/api",
      "--completed-at=2026-09-07T00:00:00.000Z",
    ], "D:/fallback")).toEqual({
      preset: "api-tester",
      bindingPath: "D:/repo/config/api-binding.json",
      quality: "machine-checked",
      rootDir: "D:/repo",
      workDir: "D:/repo/work/api",
      outDir: "D:/repo/out/api",
      completedAt: "2026-09-07T00:00:00.000Z",
    });

    expect(() => parseArtifactCliArguments([
      "--preset=api-tester",
      "--variant=openapi-json",
      "--binding=config/api-binding.json",
      "--root=D:/repo",
      "--workdir=work/api",
      "--out=out/api",
      "--completed-at=2026-09-07T00:00:00.000Z",
    ], "D:/fallback")).toThrow(/mutually exclusive/u);
    expect(() => parseArtifactCliArguments([
      "--preset=api-tester",
      "--binding=../api-binding.json",
      "--root=D:/repo",
      "--workdir=work/api",
      "--out=out/api",
      "--completed-at=2026-09-07T00:00:00.000Z",
    ], "D:/fallback")).toThrow(/contained/u);
  });

  test("rejects unknown options and non-empty output identity", () => {
    expect(() => parseArtifactCliArguments([
      "--preset=env-manager",
      "--root=D:/repo",
      "--workdir=work/env",
      "--out=out/env",
      "--unknown=value",
    ], "D:/fallback")).toThrow("unknown artifact option");
    expect(() => parseArtifactCliArguments([
      "--preset=env-manager",
      "--root=D:/repo",
      "--workdir=work/env",
      "--out=work/env",
      "--completed-at=2026-09-04T00:00:00.000Z",
    ], "D:/fallback")).toThrow("different");
  });

  test("exposes exactly the two current golden-path presets", () => {
    expect(Object.keys(ARTIFACT_PRESETS).sort()).toEqual(["api-tester", "env-manager"]);
    expect(resolveArtifactPreset("api-tester", "openapi-json", undefined).variant).toBe("openapi-json");
    expect(resolveArtifactPreset("api-tester", undefined, "binding.json").bindingPath).toBe("binding.json");
    expect(() => resolveArtifactPreset("api-tester", undefined, undefined)).toThrow("variant or --binding");
    expect(resolveArtifactPreset("env-manager", undefined, undefined).variant).toBeUndefined();
  });
});
