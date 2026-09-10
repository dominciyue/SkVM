import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireApiTesterOperationProspectiveSources } from "./api-tester-operation-prospective-source";
import {
  buildApiTesterOperationProspectiveSourceFailureAudit,
  parseApiTesterOperationProspectiveSourceFailureAuditCommand,
  verifyApiTesterOperationProspectiveSourceFailureAudit,
} from "./api-tester-operation-prospective-source-failure-audit";
import {
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR,
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH,
} from "./api-tester-operation-prospective-source-run";

const repositoryRoot = process.cwd();
const freezeCommit = "e4c006fe32a6321ce5e4696758d53024c160f6db";

describe("API Tester prospective source failure audit", () => {
  test("closes a terminal HTTP failure archive and rejects later raw drift", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-source-failure-audit-"));
    const outputDir = "results/source-failure";
    try {
      const freezeBytes = await readFile(join(repositoryRoot, API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH));
      await mkdir(dirname(join(rootDir, API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH)), { recursive: true });
      await writeFile(join(rootDir, API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH), freezeBytes);
      await expect(acquireApiTesterOperationProspectiveSources({
        rootDir,
        outputDir,
        preSourceFreezePath: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH,
        preSourceFreezeCommit: freezeCommit,
        selectedAt: "2026-09-10T13:10:00.000Z",
        request: async () => ({
          status: 403,
          headers: { "content-type": "application/json", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1789045200" },
          body: new TextEncoder().encode('{"message":"API rate limit exceeded"}\n'),
        }),
      })).rejects.toThrow(/HTTP 403/u);

      const audit = await buildApiTesterOperationProspectiveSourceFailureAudit({
        rootDir,
        outputDir,
        auditedAt: "2026-09-10T13:11:00.000Z",
      });
      expect(audit).toMatchObject({
        status: "verified-source-acquisition-failure",
        totals: { requestsAttempted: 1, archivedResponses: 1, partialInputBundles: 0, authoritativeSelections: 0 },
        terminal: { statusCode: 403, rateLimitRemaining: "0" },
      });
      await expect(verifyApiTesterOperationProspectiveSourceFailureAudit({ rootDir, outputDir }))
        .resolves.toMatchObject({ status: "verified-source-acquisition-failure", requestsAttempted: 1 });

      const failure = JSON.parse(await readFile(join(rootDir, outputDir, "failure.json"), "utf8"));
      await writeFile(join(rootDir, failure.requests[0].response.path), "tampered", "utf8");
      await expect(verifyApiTesterOperationProspectiveSourceFailureAudit({ rootDir, outputDir }))
        .rejects.toThrow(/digest|byte|raw|response/iu);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("keeps the CLI on the fixed failure identity", () => {
    expect(parseApiTesterOperationProspectiveSourceFailureAuditCommand([
      "--mode=create", "--root=.", `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`,
      "--audited-at=2026-09-10T13:11:00.000Z",
    ])).toMatchObject({ mode: "create", outputDir: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR });
    expect(() => parseApiTesterOperationProspectiveSourceFailureAuditCommand([
      "--mode=verify", "--root=.", "--out=results/alternate",
    ])).toThrow(/--out must be/iu);
    expect(() => parseApiTesterOperationProspectiveSourceFailureAuditCommand([
      "--mode=verify", "--root=.", `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`, "--retry=true",
    ])).toThrow(/unknown argument/iu);
  });
});
