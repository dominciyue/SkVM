import { afterEach, describe, expect, test } from "bun:test";
import { link, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEnvManagerExecutableRepairContract } from "./executable-repair-contract";
import {
  DeterministicRepairReportSchema,
  repairEnvManagerArtifactsDeterministically,
} from "./deterministic-artifact-repairer";
import {
  assertFrozenReplayFile,
  assertFrozenDevelopmentReplay,
  parseDeterministicReplayArgs,
} from "./deterministic-repair-replay-run";
import type { SkillIRBenchmarkTask } from "./real-agent";
import type { RawAgentRunRow } from "./scoring";
import { PublicRuntimeContractSchema, type PublicRuntimeContract } from "./public-contract";
import { sha256Bytes } from "./source-fixture";

const roots: string[] = [];
const DIGEST = "b".repeat(64);
const DEVELOPMENT_DIGEST = "d".repeat(64);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function evidence(
  relativePath: string,
  symbol: string,
  evidenceKind: "dotenv-definition" | "environment-reference" | "client-environment-reference" | "public-skill-rule",
) {
  return { relativePath, symbol, evidenceKind } as const;
}

function runtimeContract(): PublicRuntimeContract {
  return PublicRuntimeContractSchema.parse({
    schemaVersion: "skill-ir-public-runtime-contract/v3",
    codeCatalog: "public-contract-error-codes/v2",
    skillId: "env-manager",
    taskContractDigest: DIGEST,
    generatedOutputs: [".env.example", ".env.schema.json", "env-report.json"],
    publicPrefixes: ["VITE_"],
    variables: [
      {
        name: "CACHE_DSN",
        definitions: [],
        references: [evidence("src/config.ts", "CACHE_DSN", "environment-reference")],
        rules: [{
          field: "required",
          value: true,
          disposition: "confirmed",
          evidenceRefs: [evidence("src/config.ts", "CACHE_DSN", "environment-reference")],
        }],
      },
      {
        name: "SERVER_SIGNING_KEY",
        definitions: [evidence(".env", "SERVER_SIGNING_KEY", "dotenv-definition")],
        references: [evidence("src/config.ts", "SERVER_SIGNING_KEY", "environment-reference")],
        rules: [{
          field: "sensitive",
          value: true,
          disposition: "confirmed",
          evidenceRefs: [evidence("SKILL.md", "SERVER_SIGNING_KEY", "public-skill-rule")],
        }],
      },
      {
        name: "UNUSED_FLAG",
        definitions: [evidence(".env", "UNUSED_FLAG", "dotenv-definition")],
        references: [],
        rules: [{
          field: "type",
          value: "boolean",
          disposition: "confirmed",
          evidenceRefs: [evidence(".env", "UNUSED_FLAG", "dotenv-definition")],
        }],
      },
      {
        name: "VITE_PUBLIC_TOKEN",
        definitions: [evidence(".env", "VITE_PUBLIC_TOKEN", "dotenv-definition")],
        references: [evidence("src/client.ts", "VITE_PUBLIC_TOKEN", "client-environment-reference")],
        rules: [{
          field: "sensitive",
          value: true,
          disposition: "confirmed",
          evidenceRefs: [evidence("SKILL.md", "VITE_PUBLIC_TOKEN", "public-skill-rule")],
        }],
      },
    ],
    sourceQualifiedFindings: [{
      relativePath: "src/auth.ts",
      symbol: "INLINE_TOKEN",
      findingKind: "hardcoded-sensitive-literal",
      evidenceRefs: [{
        relativePath: "src/auth.ts",
        symbol: "INLINE_TOKEN",
        evidenceKind: "sensitive-literal-shape",
      }],
    }],
    limitations: [],
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "skvm-v4-repair-"));
  roots.push(root);
  await mkdir(join(root, ".skvm-artifact"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  const contract = runtimeContract();
  await writeFile(join(root, ".env"), "SERVER_SIGNING_KEY=redacted\nUNUSED_FLAG=true\n", "utf8");
  await writeFile(join(root, "src", "config.ts"), "process.env.CACHE_DSN\n", "utf8");
  const repairContract = await bindRuntimeContract(root, contract);
  await writeFile(
    join(root, ".env.example"),
    "# model comment with PRIVATE_VALUE\nCACHE_DSN=https://private.invalid\nSERVER_SIGNING_KEY=PRIVATE_VALUE\nUNUSED_FLAG=true\nVITE_PUBLIC_TOKEN=PRIVATE_VALUE\n",
    "utf8",
  );
  await writeFile(join(root, ".env.schema.json"), JSON.stringify({
    variables: {
      CACHE_DSN: { required: true, minLength: 999 },
      SERVER_SIGNING_KEY: { sensitive: true, maximum: 999 },
      UNUSED_FLAG: { type: "boolean" },
      VITE_PUBLIC_TOKEN: { sensitive: true, format: "uri" },
      MODEL_ONLY_GOLD: { type: "string", sensitive: true },
    },
  }, null, 2));
  await writeFile(join(root, "env-report.json"), JSON.stringify({
    definedAndUsed: [{ name: "SERVER_SIGNING_KEY" }, { name: "VITE_PUBLIC_TOKEN" }],
    definedUnconfirmedUnused: [{ name: "UNUSED_FLAG" }],
    usedUndefined: [{ name: "CACHE_DSN" }],
    hardcodedSecrets: [{ path: "src/auth.ts", symbol: "INLINE_TOKEN" }],
    exposureRisks: [{ path: "src/client.ts", name: "VITE_PUBLIC_TOKEN" }],
  }, null, 2));
  return { root, contract, repairContract };
}

async function bindRuntimeContract(root: string, contract: PublicRuntimeContract) {
  const text = `${JSON.stringify(contract, null, 2)}\n`;
  await writeFile(
    join(root, ".skvm-artifact", "public-runtime-contract.json"),
    text,
    "utf8",
  );
  return buildEnvManagerExecutableRepairContract({
    taskContractDigest: contract.taskContractDigest,
    runtimeContractSha256: sha256Bytes(Buffer.from(text, "utf8")),
    developmentEvidenceSha256: DEVELOPMENT_DIGEST,
  });
}

describe("deterministic V4 artifact repairer", () => {
  test("parses replay paths without enabling destructive overwrite", () => {
    const args = parseDeterministicReplayArgs([
      "--raw=raw.jsonl",
      "--tasks=tasks.json",
      "--output-contract=output-contract.json",
      "--lock=v3-lock.json",
      "--source-evidence=v3-summary.json",
      "--method-freeze=v4-freeze.json",
      "--replay-dir=replay-workdirs",
      "--out=summary.json",
    ]);
    expect(args).toEqual({
      raw: "raw.jsonl",
      tasks: "tasks.json",
      outputContract: "output-contract.json",
      lock: "v3-lock.json",
      sourceEvidence: "v3-summary.json",
      methodFreeze: "v4-freeze.json",
      replayDir: "replay-workdirs",
      out: "summary.json",
    });
    expect(() => parseDeterministicReplayArgs(["--force=true"])).toThrow("Unknown argument");
  });

  test("rejects a held-out task before replay evidence can be labeled development", () => {
    const task: SkillIRBenchmarkTask = {
      id: "task-1",
      split: "held-out",
      prompt: "test",
      successCriteria: [],
    };
    const row: RawAgentRunRow = {
      caseId: "env-manager:skvm:windows:clean:task-1",
      system: "ir-public-artifact-dev",
      model: "model",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "v3",
      runIndex: 1,
      panelConfigId: "panel",
      taskPath: "task.json",
      exitCode: 1,
      runStatus: "adapter-crashed",
      durationMs: 1,
      stdout: "",
      stderr: "",
      successSource: "execution-only",
    };
    expect(() => assertFrozenDevelopmentReplay({
      rows: [row],
      tasks: new Map([[task.id, task]]),
      identity: {
        skillId: "env-manager",
        system: "ir-public-artifact-dev",
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskIds: [task.id],
        repetitions: 1,
        initialGenerationRows: 1,
        model: "model",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "v3",
        panelConfigId: "panel",
      },
    })).toThrow("frozen development task set");
  });

  test("rejects task or scorer bytes that drift from the replay method freeze", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-v4-freeze-"));
    roots.push(root);
    const path = join(root, "tasks.json");
    await writeFile(path, "original", "utf8");
    await expect(assertFrozenReplayFile("tasks", path, {
      path,
      sha256: "0".repeat(64),
    })).rejects.toThrow("method freeze tasks input drift");
  });

  test("rewrites report sets and lowers public schema rules without exposing repaired values", async () => {
    const { root, repairContract } = await fixture();
    const protectedEnv = await readFile(join(root, ".env"), "utf8");
    const protectedSource = await readFile(join(root, "src", "config.ts"), "utf8");
    const report = await repairEnvManagerArtifactsDeterministically({
      workDir: root,
      repairContract,
    });

    expect(report.status).toBe("changed");
    expect(report.operations.map((operation) => operation.operation)).toEqual([
      "rewrite-canonical-report",
      "rewrite-redacted-example",
      "upsert-confirmed-schema-rules",
    ]);
    expect(report.operations.map((operation) => operation.contractRef)).toEqual([
      "derivations/public-classification/v3",
      "policies/redacted-dotenv/v1",
      "policies/env-manager-development-repair-policy/v1",
    ]);
    expect(DeterministicRepairReportSchema.parse(report)).toEqual(report);

    const repairedReport = JSON.parse(await readFile(join(root, "env-report.json"), "utf8"));
    expect(repairedReport).toEqual({
      definedAndUsed: ["SERVER_SIGNING_KEY", "VITE_PUBLIC_TOKEN"],
      definedUnconfirmedUnused: ["UNUSED_FLAG"],
      usedUndefined: ["CACHE_DSN"],
      hardcodedSecrets: ["src/auth.ts:INLINE_TOKEN"],
      exposureRisks: ["src/client.ts:VITE_PUBLIC_TOKEN"],
    });

    const schema = JSON.parse(await readFile(join(root, ".env.schema.json"), "utf8"));
    expect(schema.variables.CACHE_DSN).toMatchObject({
      type: "string",
      format: "uri",
      sensitive: true,
    });
    expect(schema.variables.SERVER_SIGNING_KEY).toMatchObject({
      type: "string",
      minLength: 32,
      sensitive: true,
    });
    expect(schema.variables.UNUSED_FLAG).toEqual({ type: "boolean" });
    expect(schema.variables.VITE_PUBLIC_TOKEN).toMatchObject({ type: "string", sensitive: true });
    expect(schema.variables.CACHE_DSN.minLength).toBeUndefined();
    expect(schema.variables.SERVER_SIGNING_KEY.maximum).toBeUndefined();
    expect(schema.variables.VITE_PUBLIC_TOKEN.format).toBeUndefined();
    expect(schema.variables.MODEL_ONLY_GOLD).toBeUndefined();
    expect(await readFile(join(root, ".env.example"), "utf8")).toBe(
      "CACHE_DSN=\nSERVER_SIGNING_KEY=\nUNUSED_FLAG=\nVITE_PUBLIC_TOKEN=\n",
    );

    expect(await readFile(join(root, ".env"), "utf8")).toBe(protectedEnv);
    expect(await readFile(join(root, "src", "config.ts"), "utf8")).toBe(protectedSource);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("CACHE_DSN");
    expect(serialized).not.toContain("SERVER_SIGNING_KEY");
    expect(serialized).not.toContain("src/auth.ts:INLINE_TOKEN");
  });

  test("is idempotent and does not infer signing constraints without matching public evidence", async () => {
    const { root, contract, repairContract } = await fixture();
    await repairEnvManagerArtifactsDeterministically({ workDir: root, repairContract });
    const second = await repairEnvManagerArtifactsDeterministically({
      workDir: root,
      repairContract,
    });
    expect(second).toMatchObject({ status: "no-change", operations: [] });

    const reverse = structuredClone(contract);
    reverse.variables[1]!.name = "SERVER_KEY";
    for (const ref of [...reverse.variables[1]!.definitions, ...reverse.variables[1]!.references]) {
      ref.symbol = "SERVER_KEY";
    }
    reverse.variables[1]!.rules[0]!.evidenceRefs[0]!.symbol = "SERVER_KEY";
    const reverseRoot = (await fixture()).root;
    const reverseRepairContract = await bindRuntimeContract(
      reverseRoot,
      PublicRuntimeContractSchema.parse(reverse),
    );
    await repairEnvManagerArtifactsDeterministically({
      workDir: reverseRoot,
      repairContract: reverseRepairContract,
    });
    const reverseSchema = JSON.parse(await readFile(join(reverseRoot, ".env.schema.json"), "utf8"));
    expect(reverseSchema.variables.SERVER_KEY?.minLength).toBeUndefined();

    const client = structuredClone(contract);
    client.variables[0]!.name = "VITE_CACHE_DSN";
    client.variables[0]!.references[0] = evidence(
      "src/client.ts",
      "VITE_CACHE_DSN",
      "client-environment-reference",
    );
    const clientRoot = (await fixture()).root;
    const clientRepairContract = await bindRuntimeContract(
      clientRoot,
      PublicRuntimeContractSchema.parse(client),
    );
    await repairEnvManagerArtifactsDeterministically({
      workDir: clientRoot,
      repairContract: clientRepairContract,
    });
    const clientSchema = JSON.parse(await readFile(join(clientRoot, ".env.schema.json"), "utf8"));
    expect(clientSchema.variables.VITE_CACHE_DSN?.sensitive).toBeUndefined();
  });

  test("rejects a repair contract that is not bound to the runtime evidence", async () => {
    const { root, contract, repairContract } = await fixture();
    const changed = structuredClone(contract);
    changed.variables[0]!.name = "FORGED_GOLD_NAME";
    changed.variables[0]!.references[0]!.symbol = "FORGED_GOLD_NAME";
    await writeFile(
      join(root, ".skvm-artifact", "public-runtime-contract.json"),
      `${JSON.stringify(changed, null, 2)}\n`,
      "utf8",
    );
    await expect(repairEnvManagerArtifactsDeterministically({
      workDir: root,
      repairContract,
    })).rejects.toThrow("runtime contract digest mismatch");
  });

  test("rejects hard-linked generated outputs before any protected bytes change", async () => {
    const { root, repairContract } = await fixture();
    const protectedPath = join(root, ".env");
    const reportPath = join(root, "env-report.json");
    const before = await readFile(protectedPath);
    await rm(reportPath);
    await link(protectedPath, reportPath);

    await expect(repairEnvManagerArtifactsDeterministically({
      workDir: root,
      repairContract,
    })).rejects.toThrow("hard link");
    expect(await readFile(protectedPath)).toEqual(before);
  });
});
