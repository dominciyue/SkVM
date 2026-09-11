import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { validateDutyDraft, type DutySourceFile } from "./skill-duty-extraction";
import { buildObligationLedger } from "./skill-family-obligation-ledger";
import {
  decideClassResult,
  evaluateClassCriteria,
  inventoryFromSourceFiles,
  ledgerFromDutyDraft,
  memberSlug,
  semanticAdjudications,
} from "./skill-family-heldout-evaluation";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const file = (id: string, kind: DutySourceFile["kind"], text: string): DutySourceFile => {
  const bytes = Buffer.from(text, "utf8");
  return { id, kind, bytes, sha256: sha(bytes) };
};

test("member slug is a portable directory name", () => {
  expect(memberSlug("JuliaComputing-OpenAPI.jl:SKILL.md")).toBe("JuliaComputing-OpenAPI.jl__SKILL.md");
});

test("in-class constructor source satisfies all four frozen criteria", () => {
  const source = "Given an OpenAPI 3.0 file, construct a valid request for every operation and omit a required field.";
  const ledger = buildObligationLedger({
    memberId: "in-class",
    obligations: [
      { obligationId: "a", text: "construct a valid request for every operation", sourceLocator: "SKILL.md:1-1", sourceVerified: true },
      { obligationId: "b", text: "omit a required property", sourceLocator: "SKILL.md:1-1", sourceVerified: true },
    ],
  });
  const assessed = evaluateClassCriteria(source, ledger.rows.map((row) => row.key));
  expect(assessed.inClass).toBe(true);
  expect(assessed.inputQualified).toBe(true);
  expect(Object.values(assessed.criteria).every((row) => row.satisfied)).toBe(true);
});

test("client generation from OpenAPI is out of class and not input-qualified", () => {
  const source = "Use this guide to inspect an OpenAPI description and generate a Julia client. Exercise a real or local HTTP endpoint.";
  const ledger = buildObligationLedger({
    memberId: "client",
    obligations: [
      { obligationId: "a", text: "inspect operations in the openapi description", sourceLocator: "SKILL.md:1-1", sourceVerified: true },
      { obligationId: "b", text: "exercise a real or local HTTP endpoint against the live api", sourceLocator: "SKILL.md:2-2", sourceVerified: true },
    ],
  });
  const assessed = evaluateClassCriteria(source, ledger.rows.map((row) => row.key));
  expect(assessed.criteria["public-api-contract-input"]!.satisfied).toBe(false);
  expect(assessed.inClass).toBe(false);
  expect(assessed.inputQualified).toBe(false);
});

test("API-design skills that write specs are out of class", () => {
  const source = "When creating API specifications or OpenAPI documentation. Design OpenAPI specifications. Generate Postman collection.";
  const ledger = buildObligationLedger({
    memberId: "design",
    obligations: [
      { obligationId: "a", text: "design openapi specifications", sourceLocator: "SKILL.md:1-1", sourceVerified: true },
      { obligationId: "b", text: "generate postman collection from the spec", sourceLocator: "SKILL.md:2-2", sourceVerified: true },
    ],
  });
  const assessed = evaluateClassCriteria(source, ledger.rows.map((row) => row.key));
  expect(assessed.inClass).toBe(false);
  expect(assessed.inputQualified).toBe(false);
});

test("live service clients without contract ingestion are out of class", () => {
  const source = "Query your media server from the terminal. Authenticate with an API key and execute requests against the live service.";
  const ledger = buildObligationLedger({
    memberId: "live",
    obligations: [
      { obligationId: "a", text: "execute requests against the live service", sourceLocator: "SKILL.md:1-1", sourceVerified: true },
      { obligationId: "b", text: "login and print an access token", sourceLocator: "SKILL.md:2-2", sourceVerified: true },
    ],
  });
  const assessed = evaluateClassCriteria(source, ledger.rows.map((row) => row.key));
  expect(assessed.inClass).toBe(false);
  expect(assessed.inputQualified).toBe(false);
  expect(assessed.applicableInputCount(2)).toBe(0);
});

test("paraphrased constructible keys are ignored unless the quote contains the matched term", () => {
  const draft = {
    schemaVersion: "skill-duty-draft/v1" as const,
    responsibilities: [{
      id: "verify-output",
      description: "verify generated client",
      evidence: [{ fileId: "skill", startLine: 1, endLine: 1, quote: "Test a documented success and a documented error response." }],
      obligations: [{
        text: "construct a valid request for every operation",
        evidence: [{ fileId: "skill", startLine: 1, endLine: 1, quote: "Test a documented success and a documented error response." }],
      }],
    }],
    unresolved: [],
  };
  const built = ledgerFromDutyDraft("client", draft);
  expect(built.rows[0]!.key).toBeNull();
  expect(built.rows[0]!.plannedDisposition).toBe("unresolved");
});

test("agent inventory after a failed model request stays source-grounded", () => {
  const text = "# Inspect\n\n- Load openapi.yaml\n- Generate a client\n";
  const files = [file("skill", "skill", text)];
  const draft = inventoryFromSourceFiles(files);
  const validation = validateDutyDraft(files, draft);
  expect(validation.status).toBe("grounded-draft");
  expect(draft.unresolved[0]).toMatch(/agent-authored/);
  const built = ledgerFromDutyDraft("m1", draft);
  expect(built.rowCount).toBeGreaterThan(0);
  expect(built.rows.every((row) => row.sourceLocator && row.plannedDisposition)).toBe(true);
});

test("semantic adjudication never silently approves live or native rows", () => {
  const rows = semanticAdjudications([
    "execute the test against the live api",
    "emit tests in pytest",
    "missing credential should return 401 or 403",
  ]);
  expect(rows.every((row) => row.silentlyApproved === false)).toBe(true);
  expect(rows.some((row) => row.disposition === "outside-class")).toBe(true);
});

test("fewer than three input-qualified members is insufficient-evidence", () => {
  const decision = decideClassResult({
    methodReady: true, freezeStatus: "method-frozen", selectedCount: 3, sharedRevision: "none-required",
    remainingSharedDefect: false, acceptedHaveChecker: true,
    members: [
      { inputQualified: false, acceptedArtifactCount: 0, classified: true },
      { inputQualified: false, acceptedArtifactCount: 0, classified: true },
      { inputQualified: true, acceptedArtifactCount: 2, classified: true },
    ],
  });
  expect(decision.decision).toBe("insufficient-evidence");
  expect(decision.inputQualifiedCount).toBe(1);
});

test("a fair three-member panel with fewer than two accepted members is bounded-negative", () => {
  const decision = decideClassResult({
    methodReady: true, freezeStatus: "method-frozen", selectedCount: 3, sharedRevision: "none-required",
    remainingSharedDefect: false, acceptedHaveChecker: true,
    members: [
      { inputQualified: true, acceptedArtifactCount: 0, classified: true },
      { inputQualified: true, acceptedArtifactCount: 0, classified: true },
      { inputQualified: true, acceptedArtifactCount: 2, classified: true },
    ],
  });
  expect(decision.decision).toBe("bounded-negative");
});

test("bounded-positive requires three input-qualified members and two accepted sets", () => {
  const decision = decideClassResult({
    methodReady: true, freezeStatus: "method-frozen", selectedCount: 3, sharedRevision: "none-required",
    remainingSharedDefect: false, acceptedHaveChecker: true,
    members: [
      { inputQualified: true, acceptedArtifactCount: 2, classified: true },
      { inputQualified: true, acceptedArtifactCount: 2, classified: true },
      { inputQualified: true, acceptedArtifactCount: 0, classified: true },
    ],
  });
  expect(decision.decision).toBe("bounded-positive");
});

test("calibration failure is method-not-ready even with held-out files present", () => {
  expect(decideClassResult({
    methodReady: false, freezeStatus: "method-frozen", selectedCount: 3, sharedRevision: "none-required",
    remainingSharedDefect: false, acceptedHaveChecker: true,
    members: [{ inputQualified: true, acceptedArtifactCount: 2, classified: true }],
  }).decision).toBe("method-not-ready");
});
