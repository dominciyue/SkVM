import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  buildApiTesterProductionContractV2,
  parseApiTesterProductionBindingV2,
  parseApiTesterProductionDocumentV2,
} from "./api-tester-production-contract-v2";
import {
  ApiTesterProductionValidationReportSchemaV2,
  buildApiTesterProductionCheckerSourceV2,
  buildApiTesterProductionGeneratorSourceV2,
} from "./api-tester-production-programs-v2";

const FIXTURE = join(import.meta.dir, "fixtures", "api-tester-production-v2", "local-ref-arrays");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function execute(program: string, args: string[]) {
  const child = Bun.spawn([Bun.which("node")!, program, ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function runFixture() {
  const root = await mkdtemp(join(tmpdir(), "skvm-api-production-v2-programs-"));
  temporaryDirectories.push(root);
  const workdir = join(root, "workdir");
  const packageDir = join(root, "package");
  await cp(FIXTURE, workdir, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  const binding = parseApiTesterProductionBindingV2(JSON.parse(
    await readFile(join(FIXTURE, "binding.json"), "utf8"),
  ));
  const inputBytes = await readFile(join(workdir, binding.input.path));
  const contract = buildApiTesterProductionContractV2(parseApiTesterProductionDocumentV2(
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
    writeFile(paths.generator, buildApiTesterProductionGeneratorSourceV2(), "utf8"),
    writeFile(paths.checker, buildApiTesterProductionCheckerSourceV2(), "utf8"),
  ]);
  const args = [
    "--binding", paths.binding,
    "--contract", paths.contract,
    "--workdir", workdir,
    "--input-sha256", sha256(inputBytes),
  ];
  const generated = await execute(paths.generator, args);
  if (generated.exitCode !== 0) {
    throw new Error(`v2 generator diagnostic: ${generated.stderr || generated.stdout}`);
  }
  const checked = await execute(paths.checker, args);
  const planPath = join(workdir, binding.outputs.plan);
  const reportPath = join(workdir, binding.outputs.report);
  return {
    root,
    workdir,
    binding,
    contract,
    paths,
    args,
    generated,
    checked,
    planPath,
    reportPath,
    plan: JSON.parse(await readFile(planPath, "utf8")),
    report: JSON.parse(await readFile(reportPath, "utf8")),
  };
}

describe("API Tester production programs v2", () => {
  test("generates and independently checks local-ref primitive-array obligations", async () => {
    const run = await runFixture();
    expect(run.generated).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    expect(run.checked.exitCode).toBe(0);
    expect(ApiTesterProductionValidationReportSchemaV2.parse(JSON.parse(run.checked.stdout))).toMatchObject({
      status: "pass",
      checks: {
        inputGrounding: true,
        artifactShape: true,
        operationCoverage: true,
        arrayEncoding: true,
        schemaDerivedCases: true,
        securityResponse: true,
        independenceVerification: true,
        reportGrounding: true,
      },
      errors: [],
    });
    expect(run.plan.schemaVersion).toBe("api-test-plan/v2");
    expect(run.plan.endpoints[0].arrayParameterEncodings).toEqual([{
      location: "query",
      name: "tags",
      style: "form",
      explode: false,
      wireFormat: "comma-separated",
    }]);
    const happy = run.plan.endpoints[0].cases.find((value: { category: string }) => value.category === "happy");
    expect(happy.request.query.tags).toEqual(["weather"]);
    expect(run.report.generatedCaseCount).toBe(
      run.plan.endpoints.flatMap((endpoint: { cases: unknown[] }) => endpoint.cases).length,
    );
  });

  test("checker rejects array encoding, witness, and report mutations", async () => {
    const encoding = await runFixture();
    encoding.plan.endpoints[0].arrayParameterEncodings[0].wireFormat = "repeated-value";
    await writeFile(encoding.planPath, `${JSON.stringify(encoding.plan, null, 2)}\n`, "utf8");
    const badEncoding = ApiTesterProductionValidationReportSchemaV2.parse(
      JSON.parse((await execute(encoding.paths.checker, encoding.args)).stdout),
    );
    expect(badEncoding).toMatchObject({ status: "fail", checks: { arrayEncoding: false } });

    const witness = await runFixture();
    for (const endpoint of witness.plan.endpoints) {
      for (const testCase of endpoint.cases) {
        if (testCase.category !== "boundary") continue;
        for (const location of ["query", "body"] as const) {
          if (Array.isArray(testCase.request[location]?.tags)
            && testCase.request[location].tags.length === 1) {
            testCase.request[location].tags = [];
          }
        }
      }
    }
    await writeFile(witness.planPath, `${JSON.stringify(witness.plan, null, 2)}\n`, "utf8");
    const missingWitness = ApiTesterProductionValidationReportSchemaV2.parse(
      JSON.parse((await execute(witness.paths.checker, witness.args)).stdout),
    );
    expect(missingWitness).toMatchObject({ status: "fail", checks: { schemaDerivedCases: false } });

    const report = await runFixture();
    report.report.generatedCaseCount += 1;
    await writeFile(report.reportPath, `${JSON.stringify(report.report, null, 2)}\n`, "utf8");
    const badReport = ApiTesterProductionValidationReportSchemaV2.parse(
      JSON.parse((await execute(report.paths.checker, report.args)).stdout),
    );
    expect(badReport).toMatchObject({ status: "fail", checks: { reportGrounding: false } });
  });

  test("ships generic, distinct generator and checker programs", () => {
    const generator = buildApiTesterProductionGeneratorSourceV2();
    const checker = buildApiTesterProductionCheckerSourceV2();
    expect(sha256(generator)).not.toBe(sha256(checker));
    expect(checker).not.toContain("planFromContract");
    expect(checker).not.toContain("api-test-generate");
    expect(`${generator}\n${checker}`).not.toMatch(/local-ref-arrays-api|Open-Meteo|forecast\.yml|taskId|held.?out/iu);
  });
});
