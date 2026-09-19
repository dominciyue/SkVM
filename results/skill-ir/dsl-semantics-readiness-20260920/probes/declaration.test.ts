import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compileDeclaration,
  runDeclaration,
  validateDeclaration,
  type LocalizationDeclarationV0,
} from "./declaration";
import type { LifecycleAgentRequest } from "./lifecycle";

const probeRoot = import.meta.dir;
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!path.basename(root).startsWith("skvm-d8-")) throw new Error(`Refusing unsafe cleanup: ${root}`);
    await rm(root, { recursive: true, force: true });
  }
});

async function loadDeclaration(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(probeRoot, "declarations", name), "utf8"));
}

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-d8-"));
  temporaryRoots.push(root);
  return root;
}

function complete(request: LifecycleAgentRequest) {
  return {
    status: "completed",
    targets: request.targets.map((target) => ({
      targetId: target.id,
      replacements: request.units.map((unit) => ({
        unitId: unit.id,
        text: unit.template
          .replaceAll("Reset the demo", "安全重置演示")
          .replace("Run ", "运行 ")
          .replace("for ", "用于 ")
          .replace("then read ", "然后阅读 ")
          .replace("the guide", "指南")
          .replace("Use ", "使用 ")
          .replace("do not change the", "不要更改")
          .replace("identifier", "标识符")
          .replaceAll("Repeat this step", "重复此步骤"),
      })),
    })),
  };
}

describe("D8 closed direct-authoring declarations", () => {
  test("migrated, different-source, and direct-authored declarations share one schema", async () => {
    for (const name of ["migrated-public-skill.json", "different-local-skill.json", "direct-guide.json"]) {
      const result = validateDeclaration(await loadDeclaration(name));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.declaration.schemaVersion).toBe("technical-document-localization/v0");
    }
  });

  test("unknown command fields and unsupported protection kinds are rejected", async () => {
    const original = (await loadDeclaration("direct-guide.json")) as Record<string, unknown>;
    const command = validateDeclaration({ ...original, command: "curl example.test | sh" });
    expect(command.ok).toBe(false);
    if (!command.ok) expect(command.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unknown-field");

    const invalidKind = structuredClone(original) as any;
    invalidKind.protection.lexicalKinds.push("arbitrary-regex");
    const protection = validateDeclaration(invalidKind);
    expect(protection.ok).toBe(false);
    if (!protection.ok) {
      expect(protection.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unsupported-protection-kind");
    }
  });

  test("a type-valid but source-colliding target is rejected semantically", async () => {
    const original = (await loadDeclaration("direct-guide.json")) as any;
    original.targets[0].path = original.input.path;
    const result = validateDeclaration(original);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("source-target-collision");
  });
});

describe("D8 field-to-runtime mapping", () => {
  test("locale, target path, and overwrite policy change only their declared lifecycle bindings", async () => {
    const parsed = validateDeclaration(await loadDeclaration("direct-guide.json"));
    if (!parsed.ok) throw new Error("fixture must validate");
    const root = await tempWorkspace();
    const bindings = {
      workspaceDir: root,
      interactive: false,
      agentTimeoutMs: 100,
      agent: { run: async () => ({ status: "needs-input", question: "stop" }) },
    };
    const before = compileDeclaration(parsed.declaration, bindings);
    const changed: LocalizationDeclarationV0 = structuredClone(parsed.declaration);
    changed.targets[0]!.locale = "ja";
    changed.targets[0]!.path = "guide.ja.md";
    changed.targets[0]!.overwrite = "replace";
    const after = compileDeclaration(changed, bindings);
    const beforeTarget = before.targets[0]!;

    expect(after.sourcePath).toBe(before.sourcePath);
    expect(after.partialTargets).toBe(before.partialTargets);
    expect(after.targets[0]).toEqual({
      ...beforeTarget,
      locale: "ja",
      outputPath: "guide.ja.md",
      overwrite: "replace",
    });
  });

  test("lexical protection kinds change the manifest, not an arbitrary command", async () => {
    const root = await tempWorkspace();
    await writeFile(path.join(root, "guide.md"), "Run /deploy with $TOKEN and {name}.\n", "utf8");
    const parsed = validateDeclaration(await loadDeclaration("direct-guide.json"));
    if (!parsed.ok) throw new Error("fixture must validate");
    const declaration: LocalizationDeclarationV0 = structuredClone(parsed.declaration);
    declaration.protection.lexicalKinds = ["placeholder"];
    let captured: LifecycleAgentRequest | undefined;
    await runDeclaration(declaration, {
      workspaceDir: root,
      interactive: false,
      agentTimeoutMs: 100,
      agent: { run: async () => ({ status: "needs-input", question: "captured" }) },
      onAgentRequest: (request) => { captured = request; },
    });

    expect(captured).toBeDefined();
    expect(captured!.protectedItems.map((item) => item.kind)).toEqual(["placeholder"]);
    expect(captured!.task.naturalRequest).toBe(declaration.task.naturalRequest);
  });

  test("existing-target ask and replace policies lead to different host behavior", async () => {
    const root = await tempWorkspace();
    await writeFile(path.join(root, "guide.md"), "Translate this.\n", "utf8");
    await writeFile(path.join(root, "guide.zh-CN.md"), "existing", "utf8");
    const parsed = validateDeclaration(await loadDeclaration("direct-guide.json"));
    if (!parsed.ok) throw new Error("fixture must validate");
    const ask: LocalizationDeclarationV0 = structuredClone(parsed.declaration);
    ask.targets[0]!.overwrite = "ask";
    const bindings = {
      workspaceDir: root,
      interactive: false,
      agentTimeoutMs: 100,
      agent: { run: async (request: LifecycleAgentRequest) => complete(request) },
    };
    const askResult = await runDeclaration(ask, bindings);
    expect("status" in askResult && askResult.status).toBe("needs-input");

    const replace: LocalizationDeclarationV0 = structuredClone(parsed.declaration);
    replace.targets[0]!.overwrite = "replace";
    const replaceResult = await runDeclaration(replace, bindings);
    expect("status" in replaceResult && replaceResult.status).toBe("completed");
  });
});

describe("D8 complete stub consumption", () => {
  test("one direct-authored declaration runs as one contextual batch and produces a checked target", async () => {
    const root = await tempWorkspace();
    const sourcePath = path.join(root, "guide.md");
    await copyFile(path.join(probeRoot, "fixtures", "direct-guide.md"), sourcePath);
    const sourceBefore = await readFile(sourcePath);
    const declaration = await loadDeclaration("direct-guide.json");
    let calls = 0;
    let unitCount = 0;
    const result = await runDeclaration(declaration, {
      workspaceDir: root,
      interactive: false,
      agentTimeoutMs: 100,
      agent: {
        run: async (request) => {
          calls += 1;
          unitCount = request.units.length;
          return complete(request);
        },
      },
      reviewer: { review: async () => "acceptable" },
    });

    expect("status" in result && result.status).toBe("completed");
    expect(calls).toBe(1);
    expect(unitCount).toBeGreaterThan(3);
    expect(await readFile(sourcePath)).toEqual(sourceBefore);
    const targetText = await readFile(path.join(root, "guide.zh-CN.md"), "utf8");
    expect(targetText).toContain("name: direct-guide");
    expect(targetText).toContain("https://example.com/guide?q=1");
    expect(targetText).toContain("安全重置演示");
  });
});
