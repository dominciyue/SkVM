import { expect, test } from "bun:test";
import { CLASS_OBLIGATION_VOCABULARY } from "./skill-family-obligation-ledger";
import {
  MINIMUM_DELIVERY_CLASS_ID,
  validateMinimumDeliveryContract,
  validateDevelopmentPanel,
  classScopeIsComplete,
} from "./skill-family-minimum-delivery-contract";

const contract = () => ({
  schemaVersion: "skill-family-minimum-delivery-contract/v1",
  identity: "skill-family-minimum-delivery-contract-001",
  classId: MINIMUM_DELIVERY_CLASS_ID,
  planRevision: 2,
  status: "candidate-pre-freeze",
  criteria: [
    { criterionId: "public-api-contract-input", question: "public API contract?" },
    { criterionId: "explicit-coverage-requirements", question: "explicit coverage?" },
    { criterionId: "offline-request-or-test-artifacts", question: "offline artifacts?" },
    { criterionId: "independent-check-possible", question: "independent check?" },
  ],
  negatives: [
    { exampleId: "implementation-source-api-testing", kind: "out-of-class", skillId: "event4u/api-testing", reason: "implementation source" },
    { exampleId: "unbound-rest-without-public-contract", kind: "out-of-class", skillId: "pramod/api-testing-rest", reason: "no public contract ingestion" },
  ],
  unsupportedInFamily: [
    { exampleId: "native-framework-emission", kind: "in-family-currently-unsupported", obligationKey: "requested-output-format", reason: "native emission not implemented" },
  ],
  dispositionSchema: ["constructed", "rejected-with-reason", "unresolved", "outside-class", "source-blocked"],
  inputAdmissibility: { minApplicableInputsPerMember: 2, formats: ["json", "yaml"], openapi: "3.0.x", mustBePublicContract: true },
  profile: { id: "skill-family-class-construction/v1", originalOutputConformance: "not-implemented", boundedV2Label: "bounded-subtask-not-family-wide-support" },
  checkers: [
    { checkerId: "api-request-specimens-checker", checkerVersion: "api-request-specimens/v1" },
    { checkerId: "api-request-body-negatives-checker", checkerVersion: "api-request-body-negatives/v1" },
  ],
  claimBoundary: "class-scoped slice only",
});

const candidate = (id: string, owner: string, repo: string, over: Record<string, unknown> = {}) => ({
  candidateId: id, skillId: `${repo}:SKILL.md`, repository: repo, owner, commit: "a".repeat(40),
  sourcePath: `results/skill-ir/skill-family-deepening-20260911/sources/${id}/SKILL.md`,
  fork: false, duplicateOf: null, readable: true, selection: "excluded", selectionReason: "not selected", ...over,
});

const panel = () => ({
  schemaVersion: "skill-family-minimum-delivery-panel/v1",
  classId: MINIMUM_DELIVERY_CLASS_ID,
  heldOutBodiesRead: false,
  candidates: [
    candidate("lambda", "LambdaTest", "LambdaTest/agent-skills", { selection: "selected", selectionReason: "in-class, independent repo" }),
    candidate("jeremy", "jeremylongshore", "jeremylongshore/tons-of-skills-marketplace", { selection: "selected", selectionReason: "in-class, independent repo" }),
    candidate("pactflow", "pactflow", "pactflow/pactflow-agent-skills", { selection: "selected", selectionReason: "in-class, independent repo" }),
    candidate("postman", "LambdaTest", "LambdaTest/agent-skills", { selection: "excluded", selectionReason: "same repository as lambda" }),
    candidate("event4u", "event4u-app", "event4u-app/agent-config", { selection: "excluded", selectionReason: "out-of-class implementation analysis" }),
    candidate("pramod", "PramodDutta", "PramodDutta/qaskills", { selection: "excluded", selectionReason: "no public contract ingestion" }),
  ],
  selectedMemberIds: ["lambda", "jeremy", "pactflow"],
  provenance: { distinctOwners: true, distinctRepositories: true, knownExactCopyAmongSelected: false, knownForkAmongSelected: false, relatednessFlagsAmongSelected: [] },
});

test("accepts the candidate class contract", () => {
  expect(validateMinimumDeliveryContract(contract()).classId).toBe(MINIMUM_DELIVERY_CLASS_ID);
});

test("rejects a contract that silently treats native emission as accepted support", () => {
  const c = contract();
  c.profile.originalOutputConformance = "accepted";
  expect(() => validateMinimumDeliveryContract(c)).toThrow(/not-implemented/);
});

test("requires two negatives and one in-family unsupported case", () => {
  const c = contract();
  c.negatives = [c.negatives[0]!];
  expect(() => validateMinimumDeliveryContract(c)).toThrow(/negatives/);
  const d = contract();
  d.unsupportedInFamily = [];
  expect(() => validateMinimumDeliveryContract(d)).toThrow(/unsupported/);
  expect(CLASS_OBLIGATION_VOCABULARY["requested-output-format"]!.role).toBe("in-class-unsupported");
});

test("accepts a six-candidate panel with three provenance-reviewed members", () => {
  const p = validateDevelopmentPanel(panel());
  expect(p.selectedMemberIds).toEqual(["lambda", "jeremy", "pactflow"]);
});

test("rejects a panel that shrinks below five candidates or three distinct repositories", () => {
  const p = panel();
  p.candidates = p.candidates.slice(0, 4);
  expect(() => validateDevelopmentPanel(p)).toThrow(/five candidates/);
  const q = panel();
  q.candidates[2]!.repository = "LambdaTest/agent-skills";
  q.candidates[2]!.owner = "LambdaTest";
  q.provenance.distinctRepositories = true;
  expect(() => validateDevelopmentPanel(q)).toThrow(/distinct/);
});

test("rejects held-out body reads during panel construction", () => {
  const p = panel();
  p.heldOutBodiesRead = true;
  expect(() => validateDevelopmentPanel(p)).toThrow(/held-out/);
});

test("class scope is complete only when every obligation maps into the class vocabulary", () => {
  expect(classScopeIsComplete([
    { role: "in-class-constructible", plannedDisposition: "to-construct" },
    { role: "outside-class", plannedDisposition: "outside-class" },
    { role: "in-class-unsupported", plannedDisposition: "unresolved" },
  ])).toBe(true);
  expect(classScopeIsComplete([{ role: null, plannedDisposition: "unresolved" }])).toBe(false);
  expect(classScopeIsComplete([{ role: "in-class-constructible", plannedDisposition: "to-construct" }, { role: "in-class-constructible", plannedDisposition: undefined }])).toBe(false);
});

test("class construction has no repository-specific dispatch", async () => {
  const text = await Bun.file("src/skill-ir/skill-family-class-construction.ts").text();
  expect(text).not.toMatch(/LambdaTest|jeremylongshore|pactflow|fishzjp|event4u|PramodDutta/i);
});

test("on-disk candidate contract validates", async () => {
  const file = JSON.parse(await Bun.file("benchmarks/skill-ir/classification/skill-family-minimum-delivery-contract-v1.json").text());
  expect(validateMinimumDeliveryContract(file).status).toBe("candidate-pre-freeze");
});
