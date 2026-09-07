import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  AiAssistedDevelopmentRoutingSchema,
  buildAiAssistedDevelopmentRouting,
} from "./ai-assisted-development-routing";

const rootDir = process.cwd();
const workspaceRoot = resolve(rootDir, "..");
const annotationRoot = join(workspaceRoot, "q1-ai-annotation-2026-09-07");

describe("AI-assisted development routing", () => {
  test("consolidates the two preserved revision-2 drafts into 24 unique development rows", async () => {
    const routing = await buildAiAssistedDevelopmentRouting({ rootDir, workspaceRoot, annotationRoot });

    expect(routing).toMatchObject({
      schemaVersion: "skill-ir-ai-assisted-development-routing/v1",
      identity: "skill-ir-ai-assisted-development-routing-001",
      denominator: {
        sourceDrafts: 2,
        uniqueUnits: 24,
        exactRevision2LabelMatches: 24,
      },
      predictionCounts: {
        "rules-sufficient-capability-supported": 1,
        "rules-sufficient-capability-missing": 11,
        "partial-semantic-choice-required": 5,
        "insufficient-information": 7,
      },
      evidenceBoundary: {
        developmentRoutingOnly: true,
        completesOriginalQ1: false,
        provesHumanAgreement: false,
        provesClassificationAccuracy: false,
      },
    });
    expect(new Set(routing.rows.map((row) => row.unitId)).size).toBe(24);
    expect(routing.rows.every((row) => row.sourceRevisions.length === 2)).toBe(true);
    expect(routing.rows.every((row) => row.description.length > 0 && row.unitKind.length > 0)).toBe(true);
    expect(routing.provenance).toMatchObject({
      commonRepairer: "ai-main-repair-20260907",
      repairerSawBothDrafts: true,
      repairerSawProjectResultSummaries: true,
      independentAnnotations: false,
      humanAnnotations: false,
    });
  });

  test("committed routing artifact is a byte-deterministic reproduction", async () => {
    const fresh = await buildAiAssistedDevelopmentRouting({ rootDir, workspaceRoot, annotationRoot });
    const committedPath = join(
      rootDir,
      "benchmarks",
      "skill-ir",
      "classification",
      "ai-assisted-development-routing-v1.json",
    );
    const committedBytes = await readFile(committedPath);
    const committed = AiAssistedDevelopmentRoutingSchema.parse(JSON.parse(committedBytes.toString("utf8")));
    const candidate = JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v1.json"),
      "utf8",
    )) as { routingTable: { sha256: string } };
    const committedSha256 = createHash("sha256").update(committedBytes).digest("hex");
    expect(fresh).toEqual(committed);
    expect(Buffer.from(`${JSON.stringify(fresh, null, 2)}\n`, "utf8")).toEqual(committedBytes);
    expect(committedSha256).toBe("124817bc4315cb69a3adfb864b89ebf770ff785783a7eb738237323d2410afc3");
    expect(committedSha256).toBe(candidate.routingTable.sha256);
  });

  test("rejects duplicate units and any attempted human-agreement claim", async () => {
    const routing = await buildAiAssistedDevelopmentRouting({ rootDir, workspaceRoot, annotationRoot });
    expect(() => AiAssistedDevelopmentRoutingSchema.parse({
      ...routing,
      rows: [...routing.rows, routing.rows[0]],
    })).toThrow(/24|unique/iu);
    expect(() => AiAssistedDevelopmentRoutingSchema.parse({
      ...routing,
      evidenceBoundary: { ...routing.evidenceBoundary, provesHumanAgreement: true },
    })).toThrow();
  });
});
