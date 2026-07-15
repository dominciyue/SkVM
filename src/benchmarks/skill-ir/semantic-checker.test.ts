import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RuntimeSemanticValidationReportSchema, type SemanticRuntimeContract } from "./semantic-contract";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";

const projectRoot = join(import.meta.dir, "../../..");
const baseIrPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const taskSetPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
const sourcePath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md");
let root = "";
let packageDir = "";

const contract: SemanticRuntimeContract = {
  schemaVersion: "skill-ir-semantic-runtime-contract/v1",
  codeCatalog: "semantic-error-codes/v1",
  skillId: "env-manager",
  observedVariables: [
    {
      name: "APP_PORT",
      evidenceKinds: ["dotenv-definition", "environment-reference", "integer-conversion", "public-skill-rule"],
      sourceRefs: [{
        relativePath: "src/config.js",
        symbol: "APP_PORT",
        evidenceKind: "integer-conversion",
      }],
      inferredType: "integer",
      constraints: [
        { field: "minimum", value: 1 },
        { field: "maximum", value: 65535 },
      ],
      sensitiveMarkerRequired: false,
    },
    {
      name: "DB_PASSWORD",
      evidenceKinds: ["dotenv-definition", "sensitive-name-pattern"],
      sourceRefs: [{
        relativePath: ".env",
        symbol: "DB_PASSWORD",
        evidenceKind: "dotenv-definition",
      }],
      constraints: [],
      sensitiveMarkerRequired: true,
    },
  ],
  sourceQualifiedFindings: [{
    relativePath: "src/auth.js",
    symbol: "INTERNAL_TOKEN",
    findingKind: "hardcoded-sensitive-literal",
    evidenceRefs: [{
      relativePath: "src/auth.js",
      symbol: "INTERNAL_TOKEN",
      evidenceKind: "literal-assignment",
    }],
  }],
  limitations: [],
};

type Generated = {
  schema: { variables: Record<string, Record<string, unknown>> };
  report: Record<string, string[]>;
};

function validGenerated(): Generated {
  return {
    schema: {
      variables: {
        APP_PORT: { type: "integer", minimum: 1, maximum: 65535 },
        DB_PASSWORD: { type: "string", sensitive: true },
      },
    },
    report: {
      definedAndUsed: [],
      definedUnconfirmedUnused: [],
      usedUndefined: [],
      hardcodedSecrets: ["src/auth.js:INTERNAL_TOKEN"],
      exposureRisks: [],
    },
  };
}

async function runChecker(mutate: (generated: Generated) => void) {
  const workDir = await mkdtemp(join(tmpdir(), "skill-ir-semantic-checker-case-"));
  const generated = validGenerated();
  mutate(generated);
  await mkdir(join(workDir, ".skvm-artifact"), { recursive: true });
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(join(workDir, ".env.example"), "APP_PORT=\nDB_PASSWORD=\n", "utf8");
  await writeFile(join(workDir, ".env.schema.json"), `${JSON.stringify(generated.schema, null, 2)}\n`, "utf8");
  await writeFile(join(workDir, "env-report.json"), `${JSON.stringify(generated.report, null, 2)}\n`, "utf8");
  await writeFile(join(workDir, ".skvm-artifact", "semantic-contract.json"), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  const checkerPath = join(packageDir, "artifacts/checks/validate-semantic-output.ts");
  const child = Bun.spawn([process.execPath, checkerPath, `--workdir=${workDir}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  await rm(workDir, { recursive: true, force: true });
  expect(exitCode, stderr).toBe(0);
  return RuntimeSemanticValidationReportSchema.parse(JSON.parse(stdout));
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "skill-ir-semantic-checker-"));
  packageDir = join(root, "package");
  await compileEnvManagerSemanticArtifactPackage({
    rootDir: projectRoot,
    baseIrPath,
    taskSetPath,
    sourcePath,
    outDir: packageDir,
  });
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("standalone semantic artifact checker", () => {
  test("reports MISSING_OBSERVED_VARIABLE", async () => {
    const report = await runChecker(({ schema }) => delete schema.variables.APP_PORT);
    expect(report.errors).toEqual([{
      code: "MISSING_OBSERVED_VARIABLE",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/APP_PORT",
      expectedType: "object",
    }]);
  });

  test("reports INVALID_RULE_TYPE", async () => {
    const report = await runChecker(({ schema }) => { schema.variables.APP_PORT!.type = "string"; });
    expect(report.errors).toEqual([{
      code: "INVALID_RULE_TYPE",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/APP_PORT/type",
      expectedType: "integer",
    }]);
  });

  test("reports MISSING_RULE_CONSTRAINT", async () => {
    const report = await runChecker(({ schema }) => delete schema.variables.APP_PORT!.minimum);
    expect(report.errors).toEqual([{
      code: "MISSING_RULE_CONSTRAINT",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/APP_PORT/minimum",
      missingField: "minimum",
      expectedType: "number",
    }]);
  });

  test("reports MISSING_SENSITIVE_MARKER", async () => {
    const report = await runChecker(({ schema }) => delete schema.variables.DB_PASSWORD!.sensitive);
    expect(report.errors).toEqual([{
      code: "MISSING_SENSITIVE_MARKER",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/DB_PASSWORD/sensitive",
      missingField: "sensitive",
      expectedType: "boolean",
    }]);
  });

  test("reports UNSUPPORTED_RULE_FIELD", async () => {
    const report = await runChecker(({ schema }) => { schema.variables.APP_PORT!.pattern = "CANARY"; });
    expect(report.errors).toEqual([{
      code: "UNSUPPORTED_RULE_FIELD",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/APP_PORT/pattern",
    }]);
  });

  test("reports INVALID_SOURCE_QUALIFIED_FINDING", async () => {
    const report = await runChecker(({ report: output }) => {
      output.hardcodedSecrets = ["src/auth.js:INTERNAL_TOKEN", "src/missing.js:NOPE"];
    });
    expect(report.errors).toEqual([{
      code: "INVALID_SOURCE_QUALIFIED_FINDING",
      relativePath: "env-report.json",
      jsonPointer: "/hardcodedSecrets/1",
    }]);
  });

  test("reports MISSING_SOURCE_QUALIFIED_FINDING", async () => {
    const report = await runChecker(({ report }) => { report.hardcodedSecrets = []; });
    expect(report.errors).toEqual([{
      code: "MISSING_SOURCE_QUALIFIED_FINDING",
      relativePath: "env-report.json",
      jsonPointer: "/hardcodedSecrets",
    }]);
  });
});
