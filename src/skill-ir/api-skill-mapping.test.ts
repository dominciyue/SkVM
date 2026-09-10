import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareApiSkillMapping, runApiSkillMapping } from "./api-skill-mapping";

const sha = (body: string) => createHash("sha256").update(body).digest("hex");
async function setup(name = "Synthetic API skill") {
  const root = await mkdtemp(join(tmpdir(), "api-skill-mapping-"));
  await mkdir(join(root, "skill"));
  const body = `---\nname: ${name}\ndescription: API tests\n---\nRead OpenAPI and generate request cases.\nRun business lifecycle tests.\n`;
  await writeFile(join(root, "skill/SKILL.md"), body);
  await writeFile(join(root, "skill/rules.md"), "Rules");
  const input = JSON.stringify({ openapi: "3.0.3", info: { title: "Bounded test", version: "1" }, paths: {
    "/ok": { get: { responses: { "200": { description: "ok" } } } },
    "/bad": { post: { parameters: [{ in: "cookie", name: "session", schema: { type: "string" } }], responses: { default: { description: "unknown" } } } },
  } });
  await writeFile(join(root, "input.json"), input);
  await writeFile(join(root, "sources.json"), JSON.stringify({ skills: [{ skillId: "source-member", skillPath: "SKILL.md", commit: "a".repeat(40), repository: "example/skill",
    files: [{ kind: "skill", localPath: "skill/SKILL.md", sha256: sha(body) }, { kind: "resource", localPath: "skill/rules.md", sha256: sha("Rules") }] }] }));
  await writeFile(join(root, "analysis.json"), JSON.stringify({ sourceIndex: "sources.json", skills: [{ skillId: "source-member", bodyReadComplete: true,
    bodyLines: 7, membershipEvidence: { startLine: 5, endLine: 5, marker: "Read OpenAPI" },
    responsibilities: [{ id: "construct", description: "Generate request cases", lines: [5, 5], obligations: ["valid-request", "missing-required"] },
      { id: "lifecycle", description: "Run business lifecycle", lines: [6, 6], obligations: ["live-state"] }] }] }));
  const mapping = { schemaVersion: "api-skill-mapping/v1", mappingId: "shared-member", analysisPath: "analysis.json", skillId: "source-member",
    responsibilityId: "construct", obligations: ["valid-request", "missing-required"], profile: "api-tester-openapi-subset-v2",
    requestedOutputFormat: "pytest", extraction: "agent-reviewed-declaration", tasks: [{ taskId: "example-one", inputPath: "input.json", format: "json", sha256: sha(input) }] };
  await writeFile(join(root, "mapping.json"), JSON.stringify(mapping));
  return { root, mapping };
}

test("mapping preserves unexecuted responsibilities and uses the real common construction/checker chain", async () => {
  const { root } = await setup();
  const result = await runApiSkillMapping({ rootDir: root, mappingPath: "mapping.json", outputPath: "result", nodeExecutable: Bun.which("node")! });
  expect(result.residualResponsibilities.map((x) => x.id)).toEqual(["lifecycle"]);
  expect(result.tasks[0]!.operationReport!.totals).toMatchObject({ operations: 2, accepted: 1, rejected: 1, artifactCheckedPassedOperations: 1 });
  expect(result.wholeSkillCompleted).toBe(false);
  expect(result.originalOutputConformance).toBe("not-implemented-by-v2");
  expect(result.tasks[0]!.sourceObligations.map((x) => x.status)).toEqual(["not-fully-verified", "not-fully-verified"]);
});

test("source field binding, resource loss and source text drift are rejected before execution", async () => {
  const { root, mapping } = await setup();
  const bad = { ...mapping, obligations: ["valid-request"] };
  await writeFile(join(root, "mapping.json"), JSON.stringify(bad));
  await expect(prepareApiSkillMapping(root, "mapping.json")).rejects.toThrow("obligation binding");
  await writeFile(join(root, "mapping.json"), JSON.stringify(mapping));
  await writeFile(join(root, "skill/rules.md"), "changed rules");
  await expect(prepareApiSkillMapping(root, "mapping.json")).rejects.toThrow("source digest");
  await writeFile(join(root, "skill/rules.md"), "Rules");
  await writeFile(join(root, "skill/SKILL.md"), "replacement body");
  await expect(prepareApiSkillMapping(root, "mapping.json")).rejects.toThrow("source digest");
});

test("skill display-name changes have no effect on selected contract or obligations", async () => {
  const one = await setup("Name One");
  const two = await setup("Unrelated Display Name");
  const a = await prepareApiSkillMapping(one.root, "mapping.json");
  const b = await prepareApiSkillMapping(two.root, "mapping.json");
  expect(a.mapping.tasks).toEqual(b.mapping.tasks);
  expect(a.selectedResponsibility).toEqual(b.selectedResponsibility);
  expect(a.boundedTaskFamilyAssessment).toEqual(b.boundedTaskFamilyAssessment);
});

test("a missing declared resource cannot be treated as reviewed input", async () => {
  const { root } = await setup();
  await unlink(join(root, "skill/rules.md"));
  await expect(prepareApiSkillMapping(root, "mapping.json")).rejects.toThrow();
});

test("new recursive capability is explicit and shares source-bound mapping without relabeling v2", async () => {
  const { root, mapping } = await setup();
  await writeFile(join(root, "mapping.json"), JSON.stringify({ ...mapping, profile: "api-request-cases/v2" }));
  const report = await runApiSkillMapping({ rootDir: root, mappingPath: "mapping.json", outputPath: "recursive", nodeExecutable: Bun.which("node")! });
  expect(report.tasks[0]!.operationReport).toBeNull();
  expect(report.tasks[0]!.requestCasesVerification!.status).toBe("pass");
  expect(report.tasks[0]!.requestCasesReport!.operations.length).toBe(2);
  expect(report.wholeSkillCompleted).toBe(false);
  expect(report.tasks[0]!.sourceObligations.every((o) => o.status === "not-fully-verified")).toBe(true);
});

test("assembled specimens use an explicit source-bound profile and retain unsupported whole-skill duties", async () => {
  const { root, mapping } = await setup();
  await writeFile(join(root, "mapping.json"), JSON.stringify({ ...mapping, profile: "api-request-specimens/v1" }));
  const report = await runApiSkillMapping({ rootDir: root, mappingPath: "mapping.json", outputPath: "specimens", nodeExecutable: Bun.which("node")! });
  expect(report.tasks[0]!.operationReport).toBeNull();
  expect(report.tasks[0]!.requestCasesReport).toBeNull();
  expect(report.tasks[0]!.requestSpecimensVerification!.status).toBe("pass");
  expect(report.tasks[0]!.requestSpecimensReport!.operations).toHaveLength(2);
  expect(report.originalOutputConformance).toBe("not-implemented-by-request-specimens");
  expect(report.wholeSkillCompleted).toBe(false);
  expect(report.residualResponsibilities.map((r) => r.id)).toEqual(["lifecycle"]);
});
