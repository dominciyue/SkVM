import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runLifecycle,
  type LifecycleAgent,
  type LifecycleAgentRequest,
  type LifecycleOptions,
  type LifecycleTarget,
} from "./lifecycle";

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!path.basename(root).startsWith("skvm-d7-")) throw new Error(`Refusing unsafe cleanup: ${root}`);
    await rm(root, { recursive: true, force: true });
  }
});

async function workspace(source = "# Guide\n\nRun `reset --all` safely.\n") {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-d7-"));
  temporaryRoots.push(root);
  await writeFile(path.join(root, "guide.md"), source, "utf8");
  return root;
}

function target(
  id: string,
  locale: string,
  overrides: Partial<LifecycleTarget> = {},
): LifecycleTarget {
  return {
    id,
    locale,
    outputPath: `guide.${locale}.md`,
    overwrite: "never",
    independent: true,
    ...overrides,
  };
}

function translated(request: LifecycleAgentRequest, mutate?: (text: string, targetId: string) => string) {
  return {
    status: "completed",
    targets: request.targets.map((candidate) => ({
      targetId: candidate.id,
      replacements: request.units.map((unit) => ({
        unitId: unit.id,
        text: mutate
          ? mutate(unit.template, candidate.id)
          : unit.template.replace("Guide", "指南").replace("Run", "安全运行").replace("safely", "操作"),
      })),
    })),
  };
}

function baseOptions(
  root: string,
  adapter: LifecycleAgent,
  targets: LifecycleTarget[] = [target("zh", "zh-CN")],
): LifecycleOptions {
  return {
    runId: "d7-test",
    workspaceDir: root,
    sourcePath: "guide.md",
    targets,
    partialTargets: "forbid",
    interactive: false,
    agentTimeoutMs: 100,
    semanticReview: "optional",
    agent: adapter,
  };
}

describe("D7 host-controlled happy path and review state", () => {
  test("the host stages, checks, reviews, and publishes while leaving the source byte exact", async () => {
    const root = await workspace();
    const sourceBefore = await readFile(path.join(root, "guide.md"));
    const result = await runLifecycle({
      ...baseOptions(root, { run: async (request) => translated(request) }),
      reviewer: { review: async () => "acceptable" },
    });

    expect(result).toMatchObject({
      status: "completed",
      execution: "succeeded",
      checks: "passed",
      semanticReview: "acceptable",
      published: "all",
    });
    expect(result.targets[0]).toMatchObject({ state: "published", published: true });
    expect(await readFile(path.join(root, "guide.md"))).toEqual(sourceBefore);
    expect(await readFile(path.join(root, "guide.zh-CN.md"), "utf8")).toContain("安全运行");
  });

  test("deterministic success does not manufacture semantic acceptance", async () => {
    const root = await workspace();
    const result = await runLifecycle(baseOptions(root, { run: async (request) => translated(request) }));

    expect(result.status).toBe("completed");
    expect(result.checks).toBe("passed");
    expect(result.semanticReview).toBe("unknown");
    expect(result.published).toBe("all");
  });

  test("required review without a reviewer stops before publication", async () => {
    const root = await workspace();
    const result = await runLifecycle({
      ...baseOptions(root, { run: async (request) => translated(request) }),
      semanticReview: "required",
    });

    expect(result.status).toBe("needs-input");
    expect(result.semanticReview).toBe("pending");
    expect(result.published).toBe("none");
    expect(await Bun.file(path.join(root, "guide.zh-CN.md")).exists()).toBe(false);
  });
});

describe("D7 agent termination and postprocessing", () => {
  test("an early completed claim with no target results still runs coverage checks and cannot publish", async () => {
    const root = await workspace();
    const result = await runLifecycle(
      baseOptions(root, { run: async () => ({ status: "completed", targets: [] }) }),
    );
    expect(result).toMatchObject({ status: "failed", execution: "succeeded", checks: "failed", published: "none" });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "missing-target-result")).toBe(true);
  });

  test("a malformed agent envelope fails before checks or publication", async () => {
    const root = await workspace();
    const result = await runLifecycle(
      baseOptions(root, { run: async () => ({ status: "completed", targets: "not-an-array" }) }),
    );
    expect(result).toMatchObject({ status: "failed", execution: "failed", checks: "not-run", published: "none" });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-agent-result")).toBe(true);
  });

  test("a host timeout is terminal and never trusts a later model completion", async () => {
    const root = await workspace();
    const never = new Promise<unknown>(() => {});
    const result = await runLifecycle({
      ...baseOptions(root, { run: async () => never }),
      agentTimeoutMs: 5,
    });
    expect(result).toMatchObject({ status: "failed", execution: "timed-out", checks: "not-run", published: "none" });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "agent-timeout")).toBe(true);
  });

  test("an explicit agent needs-input result does not wait indefinitely", async () => {
    const root = await workspace();
    const result = await runLifecycle(
      baseOptions(root, { run: async () => ({ status: "needs-input", question: "Which product term?" }) }),
    );
    expect(result).toMatchObject({ status: "needs-input", execution: "succeeded", checks: "not-run", published: "none" });
  });
});

describe("D7 independent targets and source/target safety", () => {
  test("one failed independent locale may yield partial publication only when declared", async () => {
    const root = await workspace();
    const targets = [target("zh", "zh-CN"), target("ja", "ja")];
    const adapter: LifecycleAgent = {
      run: async (request) =>
        translated(request, (text, targetId) => {
          const translatedText = text.replace("Guide", targetId === "zh" ? "指南" : "ガイド").replace("Run", "运行");
          if (targetId !== "ja") return translatedText;
          const protectedToken = request.units.flatMap((unit) => unit.protectedItemIds).length > 0
            ? translatedText.match(/⟦p:[^⟧]+⟧/u)?.[0]
            : undefined;
          return protectedToken ? translatedText.replace(protectedToken, "") : "";
        }),
    };
    const result = await runLifecycle({
      ...baseOptions(root, adapter, targets),
      partialTargets: "publish-independent",
    });

    expect(result).toMatchObject({ status: "partial", execution: "succeeded", checks: "failed", published: "partial" });
    expect(await Bun.file(path.join(root, "guide.zh-CN.md")).exists()).toBe(true);
    expect(await Bun.file(path.join(root, "guide.ja.md")).exists()).toBe(false);
  });

  test("a failed coupled target prevents every publication", async () => {
    const root = await workspace();
    const targets = [
      target("zh", "zh-CN", { independent: false }),
      target("ja", "ja", { independent: false }),
    ];
    const result = await runLifecycle({
      ...baseOptions(root, {
        run: async (request) => translated(request, (text, id) => (id === "ja" ? "" : text.replace("Guide", "指南"))),
      }, targets),
      partialTargets: "forbid",
    });

    expect(result).toMatchObject({ status: "failed", checks: "failed", published: "none" });
    expect(await Bun.file(path.join(root, "guide.zh-CN.md")).exists()).toBe(false);
  });

  test("a source/target path collision is invalid before the agent runs", async () => {
    const root = await workspace();
    let calls = 0;
    const result = await runLifecycle(
      baseOptions(root, { run: async () => { calls += 1; return {}; } }, [
        target("zh", "zh-CN", { outputPath: "guide.md", overwrite: "replace" }),
      ]),
    );
    expect(result).toMatchObject({ status: "invalid-input", execution: "not-started", published: "none" });
    expect(calls).toBe(0);
  });

  test("an unattended ask conflict becomes needs-input before agent execution", async () => {
    const root = await workspace();
    await writeFile(path.join(root, "guide.zh-CN.md"), "existing", "utf8");
    let calls = 0;
    const result = await runLifecycle(
      baseOptions(root, { run: async () => { calls += 1; return {}; } }, [
        target("zh", "zh-CN", { overwrite: "ask" }),
      ]),
    );
    expect(result).toMatchObject({ status: "needs-input", execution: "not-started", published: "none" });
    expect(calls).toBe(0);
  });
});

describe("D7 publish-time revalidation", () => {
  test("a target appearing after preflight is not overwritten without explicit replacement", async () => {
    const root = await workspace();
    const destination = path.join(root, "guide.zh-CN.md");
    const result = await runLifecycle({
      ...baseOptions(root, { run: async (request) => translated(request) }),
      beforePublish: async () => writeFile(destination, "intruder", "utf8"),
    });

    expect(result).toMatchObject({ status: "failed", published: "none" });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "target-appeared-before-publish")).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("intruder");
  });

  test("explicit replace authorization permits an existing target to be replaced", async () => {
    const root = await workspace();
    const destination = path.join(root, "guide.zh-CN.md");
    await writeFile(destination, "old target", "utf8");
    const result = await runLifecycle(
      baseOptions(root, { run: async (request) => translated(request) }, [
        target("zh", "zh-CN", { overwrite: "replace" }),
      ]),
    );

    expect(result).toMatchObject({ status: "completed", published: "all" });
    expect(await readFile(destination, "utf8")).toContain("安全运行");
  });

  test("a changed source snapshot blocks every target before publication", async () => {
    const root = await workspace();
    const sourcePath = path.join(root, "guide.md");
    const result = await runLifecycle(
      baseOptions(root, {
        run: async (request) => {
          await writeFile(sourcePath, "# Changed externally\n", "utf8");
          return translated(request);
        },
      }),
    );

    expect(result).toMatchObject({ status: "failed", checks: "failed", published: "none" });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "stale-source-snapshot")).toBe(true);
    expect(await readFile(sourcePath, "utf8")).toBe("# Changed externally\n");
    expect(await Bun.file(path.join(root, "guide.zh-CN.md")).exists()).toBe(false);
  });
});
