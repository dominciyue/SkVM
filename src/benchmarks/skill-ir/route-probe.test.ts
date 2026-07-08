import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildProbeRunArgs,
  classifyProbeExecution,
  parseModelList,
  summarizeProbeResult,
  tailText,
} from "./route-probe";

describe("route-probe helpers", () => {
  test("parseModelList trims comma-separated model ids and rejects empty lists", () => {
    expect(parseModelList("xty/gpt-4.1-nano, xty/gemini-2.5-flash")).toEqual([
      "xty/gpt-4.1-nano",
      "xty/gemini-2.5-flash",
    ]);

    expect(() => parseModelList(" , ")).toThrow("--models must include at least one model id");
  });

  test("classifyProbeExecution separates ok, timeout, infrastructure, and agent failures", () => {
    expect(classifyProbeExecution({ exitCode: 0, timedOut: false, stdout: "Final output:\nDone", stderr: "" })).toBe(
      "ok",
    );
    expect(classifyProbeExecution({ timedOut: true, stdout: "", stderr: "" })).toBe("timeout");
    expect(
      classifyProbeExecution({
        exitCode: 1,
        timedOut: false,
        stdout: "",
        stderr: "ProviderNetworkError: operation timed out",
      }),
    ).toBe("infrastructure");
    expect(classifyProbeExecution({ exitCode: 1, timedOut: false, stdout: "Task failed", stderr: "Syntax error" })).toBe(
      "agent",
    );
  });

  test("tailText keeps compact probe evidence", () => {
    expect(tailText("abcdef", 3)).toBe("def");
    expect(tailText("abc", 10)).toBe("abc");
  });

  test("buildProbeRunArgs creates a one-case dry-run plan for a model", () => {
    const args = buildProbeRunArgs({
      model: "xty/gpt-4.1-nano",
      adapter: "bare-agent",
      outDir: "results/probe",
      rootDir: ".",
      system: "original",
      context: "compressed",
      agent: "skvm",
      environment: "linux",
      task: "report-overclaim-hard-001",
    });

    expect(args).toMatchObject({
      model: "xty/gpt-4.1-nano",
      adapter: "bare-agent",
      outDir: join("results/probe", "xty-gpt-4-1-nano"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 0,
      rootDir: ".",
    });
    expect(args.systems).toEqual(new Set(["original"]));
    expect(args.contexts).toEqual(new Set(["compressed"]));
    expect(args.agents).toEqual(new Set(["skvm"]));
    expect(args.environments).toEqual(new Set(["linux"]));
    expect(args.tasks).toEqual(new Set(["report-overclaim-hard-001"]));
  });

  test("summarizeProbeResult emits a compact JSONL-safe record", () => {
    expect(
      summarizeProbeResult({
        model: "xty/gpt-4.1-nano",
        caseId: "skill-report-synthesis:skvm:linux:compressed:report-overclaim-hard-001",
        system: "original",
        command: ["bun", "run", "skvm"],
        execution: {
          timedOut: false,
          exitCode: 0,
          durationMs: 1200,
          stdout: "x".repeat(120),
          stderr: "",
        },
        stdoutTailChars: 10,
        stderrTailChars: 10,
      }),
    ).toEqual({
      model: "xty/gpt-4.1-nano",
      caseId: "skill-report-synthesis:skvm:linux:compressed:report-overclaim-hard-001",
      system: "original",
      status: "ok",
      exitCode: 0,
      timedOut: false,
      durationMs: 1200,
      command: ["bun", "run", "skvm"],
      stdoutTail: "xxxxxxxxxx",
      stderrTail: "",
    });
  });
});
