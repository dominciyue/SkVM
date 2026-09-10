import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PUBLIC_SKILL_CORPUS_PROTOCOL_PATH } from "./public-skill-responsibility-corpus";
import {
  createPublicSkillMetadataFailureAudit,
  verifyPublicSkillMetadataFailureAuditFiles,
} from "./public-skill-responsibility-corpus-failure-audit";
import { parsePublicSkillMetadataFailureAuditCommand } from "./public-skill-responsibility-corpus-failure-audit-run";

const rootDir = process.cwd();

describe("public skill metadata failure archive audit", () => {
  test("exposes only contained create and verify audit modes", () => {
    expect(parsePublicSkillMetadataFailureAuditCommand([
      "--mode=create",
      "--root=repo",
      "--output-dir=results/failure",
      "--audit=results/failure/failure-audit.json",
    ])).toEqual({ mode: "create", rootDir: "repo", outputDir: "results/failure", auditPath: "results/failure/failure-audit.json" });
    expect(parsePublicSkillMetadataFailureAuditCommand([
      "--mode=verify",
      "--root=repo",
      "--audit=results/failure/failure-audit.json",
    ])).toEqual({ mode: "verify", rootDir: "repo", auditPath: "results/failure/failure-audit.json" });
    expect(() => parsePublicSkillMetadataFailureAuditCommand([
      "--mode=create",
      "--root=repo",
      "--output-dir=../outside",
      "--audit=results/failure/failure-audit.json",
    ])).toThrow(/contained|relative|output/iu);
    expect(() => parsePublicSkillMetadataFailureAuditCommand([
      "--mode=verify",
      "--root=repo",
      "--audit=results/failure/failure-audit.json",
      "--url=https://example.com",
    ])).toThrow(/unknown|url/iu);
  });

  test("binds the exact successful search prefix and detects file-set or digest drift", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-public-skill-failure-audit-"));
    const outputDir = "results/skill-ir/public-skill-responsibility-corpus-selection-development-001";
    const auditPath = `${outputDir}/failure-audit.json`;
    try {
      const protocolBytes = await readFile(join(rootDir, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH));
      const protocol = JSON.parse(protocolBytes.toString("utf8"));
      await mkdir(dirname(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH)), { recursive: true });
      await mkdir(dirname(join(temporaryRoot, protocol.exclusions.q1Registry.path)), { recursive: true });
      await writeFile(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), protocolBytes);
      await writeFile(
        join(temporaryRoot, protocol.exclusions.q1Registry.path),
        await readFile(join(rootDir, protocol.exclusions.q1Registry.path)),
      );
      for (const [index, remaining] of [1, 0].entries()) {
        const page = index + 1;
        const bodyPath = join(temporaryRoot, outputDir, `raw/search/query-1-page-${page}.json`);
        await mkdir(dirname(bodyPath), { recursive: true });
        await writeFile(bodyPath, JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }), "utf8");
        await writeFile(bodyPath.replace(/\.json$/u, ".metadata.json"), `${JSON.stringify({
          schemaVersion: "skill-ir-public-skill-responsibility-http-metadata/v1",
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-ratelimit-remaining": String(remaining),
            "x-ratelimit-reset": "1789045200",
          },
        }, null, 2)}\n`, "utf8");
      }
      const protocolSha256 = new Bun.CryptoHasher("sha256").update(protocolBytes).digest("hex");
      await writeFile(join(temporaryRoot, outputDir, "failure.json"), `${JSON.stringify({
        schemaVersion: "skill-ir-public-skill-responsibility-metadata-discovery-failure/v1",
        identity: "skill-ir-public-skill-responsibility-corpus-development-001",
        status: "metadata-discovery-failed",
        failedAt: "2026-09-10T12:00:00.000Z",
        protocol: { path: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH, sha256: protocolSha256 },
        error: { name: "Error", message: "GitHub search rate limit exhausted before fixed metadata sequence completed" },
        accounting: {
          metadataRequestsAttempted: 2,
          publicSkillBodyRequests: 0,
          publicSkillBodyBytes: 0,
          modelCalls: 0,
          businessApiCalls: 0,
          paidCalls: 0,
          heldOutAccesses: 0,
          q1ReservedAccesses: 0,
          pendingProspectiveAccesses: 0,
        },
      }, null, 2)}\n`, "utf8");

      await createPublicSkillMetadataFailureAudit({ rootDir: temporaryRoot, outputDir, auditPath });
      const verified = await verifyPublicSkillMetadataFailureAuditFiles({
        rootDir: temporaryRoot,
        auditPath,
      });
      expect(verified).toMatchObject({
        status: "verified-metadata-failure-audit",
        metadataRequestsAttempted: 2,
        archivedSuccessfulResponses: 2,
        lastRateLimitRemaining: 0,
        publicSkillBodyRequests: 0,
      });

      const firstBody = join(temporaryRoot, outputDir, "raw/search/query-1-page-1.json");
      const original = await readFile(firstBody);
      await writeFile(firstBody, JSON.stringify({ total_count: 1, incomplete_results: false, items: [] }), "utf8");
      await expect(verifyPublicSkillMetadataFailureAuditFiles({ rootDir: temporaryRoot, auditPath }))
        .rejects.toThrow(/digest|sha256|byte/iu);
      await writeFile(firstBody, original);
      await writeFile(join(temporaryRoot, outputDir, "extra.json"), "{}", "utf8");
      await expect(verifyPublicSkillMetadataFailureAuditFiles({ rootDir: temporaryRoot, auditPath }))
        .rejects.toThrow(/closure|file set|extra/iu);
      await unlink(join(temporaryRoot, outputDir, "extra.json"));
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
