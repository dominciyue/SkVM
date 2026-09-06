import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  buildApiTesterProductionContract,
  parseApiTesterProductionBinding,
  parseApiTesterProductionDocument,
} from "./api-tester-production-contract";
import {
  ApiTesterProductionValidationReportSchema,
  buildApiTesterProductionCheckerSource,
  buildApiTesterProductionGeneratorSource,
} from "./api-tester-production-programs";

const FIXTURES = join(import.meta.dir, "fixtures", "api-tester-production");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function execute(program: string, args: string[]) {
  const child = Bun.spawn([Bun.which("node")!, program, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function runFixture(name: "books" | "orders") {
  const root = await mkdtemp(join(tmpdir(), `skvm-api-production-${name}-`));
  temporaryDirectories.push(root);
  const source = join(FIXTURES, name);
  const workdir = join(root, "workdir");
  const packageDir = join(root, "package");
  await cp(source, workdir, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  const binding = parseApiTesterProductionBinding(JSON.parse(await readFile(join(source, "binding.json"), "utf8")));
  const inputBytes = await readFile(join(workdir, binding.input.path));
  const contract = buildApiTesterProductionContract(parseApiTesterProductionDocument(
    inputBytes.toString("utf8"),
    binding.input.format,
  ));
  const paths = {
    binding: join(packageDir, "binding.json"),
    contract: join(packageDir, "public-contract.json"),
    generator: join(packageDir, "api-test-generate.mjs"),
    checker: join(packageDir, "api-test-check.mjs"),
  };
  await Promise.all([
    writeFile(paths.binding, `${JSON.stringify(binding, null, 2)}\n`, "utf8"),
    writeFile(paths.contract, `${JSON.stringify(contract, null, 2)}\n`, "utf8"),
    writeFile(paths.generator, buildApiTesterProductionGeneratorSource(), "utf8"),
    writeFile(paths.checker, buildApiTesterProductionCheckerSource(), "utf8"),
  ]);
  const args = [
    "--binding", paths.binding,
    "--contract", paths.contract,
    "--workdir", workdir,
    "--input-sha256", sha256(inputBytes),
  ];
  const generated = await execute(paths.generator, args);
  const checked = await execute(paths.checker, args);
  const plan = JSON.parse(await readFile(join(workdir, binding.outputs.plan), "utf8"));
  const report = JSON.parse(await readFile(join(workdir, binding.outputs.report), "utf8"));
  return { root, workdir, binding, contract, paths, args, generated, checked, plan, report };
}

describe("API Tester production programs", () => {
  test("generate and independently check both new development inputs", async () => {
    for (const name of ["books", "orders"] as const) {
      const run = await runFixture(name);
      expect(run.generated).toMatchObject({ exitCode: 0, stderr: "" });
      expect(run.checked.exitCode).toBe(0);
      expect(ApiTesterProductionValidationReportSchema.parse(JSON.parse(run.checked.stdout))).toMatchObject({
        status: "pass",
        checks: {
          inputGrounding: true,
          artifactShape: true,
          operationCoverage: true,
          schemaDerivedCases: true,
          securityResponse: true,
          independenceVerification: true,
          reportGrounding: true,
        },
        errors: [],
      });
      expect(run.plan.endpoints).toHaveLength(run.contract.operations.length);
      expect(run.plan.endpoints.flatMap((endpoint: { cases: unknown[] }) => endpoint.cases).length)
        .toBe(run.report.generatedCaseCount);
      expect(run.report.verification.status).toBe("not-run");
    }
  });

  test("checker rejects plan and report tampering without regenerating a gold plan", async () => {
    const run = await runFixture("books");
    run.plan.endpoints.shift();
    await writeFile(join(run.workdir, run.binding.outputs.plan), `${JSON.stringify(run.plan, null, 2)}\n`, "utf8");
    const missing = await execute(run.paths.checker, run.args);
    expect(missing.exitCode).toBe(1);
    expect(ApiTesterProductionValidationReportSchema.parse(JSON.parse(missing.stdout))).toMatchObject({
      status: "fail",
      checks: { operationCoverage: false },
    });

    const fresh = await runFixture("orders");
    fresh.report.generatedCaseCount += 1;
    await writeFile(
      join(fresh.workdir, fresh.binding.outputs.report),
      `${JSON.stringify(fresh.report, null, 2)}\n`,
      "utf8",
    );
    const badReport = await execute(fresh.paths.checker, fresh.args);
    expect(badReport.exitCode).toBe(1);
    expect(ApiTesterProductionValidationReportSchema.parse(JSON.parse(badReport.stdout))).toMatchObject({
      status: "fail",
      checks: { reportGrounding: false },
    });
  });

  test("ships distinct generator and checker programs", () => {
    const generator = buildApiTesterProductionGeneratorSource();
    const checker = buildApiTesterProductionCheckerSource();
    expect(sha256(generator)).not.toBe(sha256(checker));
    expect(checker).not.toContain("buildPlan(");
    expect(checker).not.toContain("api-test-generate");
    expect(generator).not.toContain("checkArtifacts(");
  });
});
