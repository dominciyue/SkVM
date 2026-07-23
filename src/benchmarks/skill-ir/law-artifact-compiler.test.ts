import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileLawValidatedArtifact,
  type LawArtifactCompilerInput,
} from "./law-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { sha256Bytes } from "./source-fixture";

const rootDir = process.cwd();
const pilotDir = "benchmarks/skill-ir/pilots/law-to-markdown";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function digest(path: string): Promise<string> {
  return sha256Bytes(await readFile(join(rootDir, path)));
}

async function compilerInput(overrides: Partial<LawArtifactCompilerInput> = {}): Promise<LawArtifactCompilerInput> {
  const sourcePaths = [
    `${pilotDir}/source/SKILL.md`,
    `${pilotDir}/source/scripts/cn_law_normalizer.py`,
    `${pilotDir}/source/scripts/law_to_markdown.py`,
    `${pilotDir}/source/scripts/stage3_checker.py`,
  ];
  return {
    rootDir,
    sourceFiles: await Promise.all(sourcePaths.map(async (path) => ({ path, sha256: await digest(path) }))),
    baseIr: { path: `${pilotDir}/base-ir.json`, sha256: await digest(`${pilotDir}/base-ir.json`) },
    sourceAudit: {
      path: `${pilotDir}/base-ir-source-audit.json`,
      sha256: await digest(`${pilotDir}/base-ir-source-audit.json`),
    },
    resourceContract: {
      path: `${pilotDir}/resource-contract.json`,
      sha256: await digest(`${pilotDir}/resource-contract.json`),
    },
    taskContract: {
      tasks: [
        {
          id: "law-to-markdown-statute-dev-001",
          prompt: "处理 document.txt，按 minimal 产物写入 markdown/document/。",
        },
        {
          id: "law-to-markdown-standard-dev-002",
          prompt: "判断文档类型；非法律文档不得生成最终成果。",
        },
      ],
    },
    ...overrides,
  };
}

async function packageText(root: string): Promise<string> {
  const files: string[] = [];
  const walk = async (current = "") => {
    for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
      const path = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk();
  const parts = await Promise.all(
    files.sort().map(async (path) => `${path}\n${await readFile(join(root, path), "utf8")}`),
  );
  return parts.join("\n---FILE---\n");
}

describe("law validated artifact compiler", () => {
  test("compiles a valid skill-neutral package from public Law evidence", async () => {
    const outDir = await tempDir("law-validated-artifact-");
    await compileLawValidatedArtifact(await compilerInput(), outDir);
    const validated = await validateValidatedArtifactPackage(outDir);

    expect(validated.manifest.catalog).toBe("validated-skill-artifact/v1");
    expect(validated.manifest.skillId).toBe("law-to-markdown");
    expect(validated.executionPlan.nodes.map((node) => node.kind)).toEqual(["process", "validate"]);
    expect(validated.executionPlan.nodes[0]?.command.args).toContain("--law-decision");
    expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toContain("tool-plan");
    expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toContain("schema");
    expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toContain("template");
    expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toContain("validation-notes");
  });

  test("is byte-for-byte reproducible and isolates forbidden evidence canaries", async () => {
    const first = await tempDir("law-artifact-first-");
    const second = await tempDir("law-artifact-second-");
    const input = await compilerInput();
    const poisoned = {
      ...input,
      taskContract: {
        ...input.taskContract,
        evaluatorPayload: "EVALUATOR_CANARY_48291",
        heldOutPrompt: "HELDOUT_CANARY_48291",
        runtimeOutput: "RUNTIME_CANARY_48291",
        secret: "SECRET_CANARY_48291",
      },
    } as LawArtifactCompilerInput;

    await compileLawValidatedArtifact(poisoned, first);
    await compileLawValidatedArtifact(poisoned, second);

    const firstText = await packageText(first);
    expect(firstText).toBe(await packageText(second));
    for (const canary of [
      "EVALUATOR_CANARY_48291",
      "HELDOUT_CANARY_48291",
      "RUNTIME_CANARY_48291",
      "SECRET_CANARY_48291",
    ]) {
      expect(firstText).not.toContain(canary);
    }
  });

  test("can regenerate into a directory containing only empty generated subdirectories", async () => {
    const outDir = await tempDir("law-artifact-empty-tree-");
    await mkdir(join(outDir, "artifacts/scripts"), { recursive: true });

    await compileLawValidatedArtifact(await compilerInput(), outDir);

    expect((await validateValidatedArtifactPackage(outDir)).manifest.skillId)
      .toBe("law-to-markdown");
  });

  test("fails when the public bundled script no longer contains the canonical report contract", async () => {
    const fixtureRoot = await tempDir("law-artifact-source-");
    await cp(join(rootDir, pilotDir), join(fixtureRoot, pilotDir), { recursive: true });
    const scriptPath = join(fixtureRoot, pilotDir, "source/scripts/law_to_markdown.py");
    const changed = (await readFile(scriptPath, "utf8")).replace("最终审核结论：", "结果：");
    await writeFile(scriptPath, changed, "utf8");
    const base = await compilerInput();
    const sourceFiles = await Promise.all(base.sourceFiles.map(async (record) => ({
      path: record.path,
      sha256: sha256Bytes(await readFile(join(fixtureRoot, record.path))),
    })));
    const outDir = await tempDir("law-artifact-reverse-");

    await expect(compileLawValidatedArtifact({
      ...base,
      rootDir: fixtureRoot,
      sourceFiles,
      baseIr: { ...base.baseIr, sha256: sha256Bytes(await readFile(join(fixtureRoot, base.baseIr.path))) },
      sourceAudit: {
        ...base.sourceAudit,
        sha256: sha256Bytes(await readFile(join(fixtureRoot, base.sourceAudit.path))),
      },
      resourceContract: {
        ...base.resourceContract,
        sha256: sha256Bytes(await readFile(join(fixtureRoot, base.resourceContract.path))),
      },
    }, outDir)).rejects.toThrow(/canonical report evidence/i);
  });
});
