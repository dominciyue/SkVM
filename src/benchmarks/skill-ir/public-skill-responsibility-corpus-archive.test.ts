import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  gitBlobOid,
  planPublicSkillResourceClosure,
  PublicSkillSourceArchiveManifestSchema,
  verifyPublicSkillSourceArchiveFiles,
} from "./public-skill-responsibility-corpus-archive";

function oid(seed: string): string {
  return createHash("sha1").update(seed).digest("hex");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const child = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  return stdout.trim();
}

function entry(
  path: string,
  type: "blob" | "tree" | "commit" = "blob",
  mode: "040000" | "100644" | "100755" | "120000" | "160000" = "100644",
  size: number | null = 128,
) {
  return { path, type, mode, size, oid: oid(`${path}:${mode}`) };
}

describe("public skill licensed source archive and direct resource closure", () => {
  test("plans only directly named contained resources and preserves every closure issue", () => {
    const plan = planPublicSkillResourceClosure({
      skillPath: "skills/demo/SKILL.md",
      skillBody: [
        "# Demo",
        "Read [the guide](references/guide.md) and run `scripts/run.ts`.",
        "Use the templates directory and [shared schema](/shared/schema.json).",
        "Reject [escape](../../../escape.txt), [missing](missing.txt), and [external](https://example.com/data.json).",
        "Do not follow `links/shortcut` or `vendor/external`.",
      ].join("\n"),
      treeEntries: [
        entry("skills/demo/references", "tree", "040000", null),
        entry("skills/demo/references/guide.md"),
        entry("skills/demo/scripts", "tree", "040000", null),
        entry("skills/demo/scripts/run.ts", "blob", "100755"),
        entry("skills/demo/templates", "tree", "040000", null),
        entry("skills/demo/templates/prompt.txt"),
        entry("shared/schema.json"),
        entry("skills/demo/links/shortcut", "blob", "120000", 12),
        entry("skills/demo/vendor/external", "commit", "160000", null),
      ],
      directlyNamedDirectories: ["scripts", "references", "templates", "assets", "examples"],
      maximumFiles: 100,
      maximumTotalBytes: 5 * 1024 * 1024,
      maximumBytesPerResource: 1024 * 1024,
    });

    expect(plan.status).toBe("resource-closure-incomplete");
    expect(plan.resources.map((resource) => resource.path)).toEqual([
      "shared/schema.json",
      "skills/demo/references/guide.md",
      "skills/demo/scripts/run.ts",
      "skills/demo/templates/prompt.txt",
    ]);
    expect(plan.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "external-resource",
      "missing-resource",
      "path-escape",
      "unsupported-submodule",
      "unsupported-symlink",
    ]));
    expect(plan.accounting).toEqual({ files: 4, bytes: 512 });
  });

  test("records each per-file, file-count, and total-byte budget omission", () => {
    const plan = planPublicSkillResourceClosure({
      skillPath: "skills/demo/SKILL.md",
      skillBody: "Use the assets directory.",
      treeEntries: [
        entry("skills/demo/assets", "tree", "040000", null),
        entry("skills/demo/assets/a.txt", "blob", "100644", 20),
        entry("skills/demo/assets/b.txt", "blob", "100644", 60),
        entry("skills/demo/assets/c.txt", "blob", "100644", 20),
        entry("skills/demo/assets/d.txt", "blob", "100644", 20),
      ],
      directlyNamedDirectories: ["scripts", "references", "templates", "assets", "examples"],
      maximumFiles: 2,
      maximumTotalBytes: 30,
      maximumBytesPerResource: 50,
    });

    expect(plan.status).toBe("resource-closure-incomplete");
    expect(plan.resources.map((resource) => resource.path)).toEqual(["skills/demo/assets/a.txt"]);
    expect(plan.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "resource-too-large", paths: ["skills/demo/assets/b.txt"] }),
      expect.objectContaining({ code: "file-count-budget-exceeded", paths: ["skills/demo/assets/d.txt"] }),
      expect.objectContaining({ code: "total-bytes-budget-exceeded", paths: ["skills/demo/assets/c.txt"] }),
    ]));
    expect(plan.accounting).toEqual({ files: 1, bytes: 20 });
  });

  test("independently rejects missing, extra, digest-drifted, and Git-OID-drifted archive files", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-public-skill-archive-"));
    const archiveDir = "results/archive";
    const archiveRoot = join(rootDir, archiveDir);
    try {
      const rows = [];
      const selected = [];
      let archivedBytes = 0;
      for (let index = 1; index <= 40; index += 1) {
        const rowDirectory = `rows/${String(index).padStart(3, "0")}`;
        const skillBytes = new TextEncoder().encode(`# Skill ${index}\n${"x".repeat(90)}`);
        const licenseBytes = new TextEncoder().encode(`MIT ${index}\n${"l".repeat(93)}`);
        const files = [
          { kind: "skill", sourcePath: `skills/skill-${index}/SKILL.md`, archivePath: `${rowDirectory}/SKILL.md`, bytes: skillBytes },
          { kind: "license", sourcePath: "LICENSE", archivePath: `${rowDirectory}/LICENSE`, bytes: licenseBytes },
        ];
        for (const file of files) {
          const target = join(archiveRoot, file.archivePath);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.bytes);
          archivedBytes += file.bytes.byteLength;
        }
        rows.push({
          selectionRank: index,
          repositoryFullName: `owner-${index}/repo-${index}`,
          commit: oid(`commit-${index}`),
          skillPath: `skills/skill-${index}/SKILL.md`,
          status: "complete",
          files: files.map((file) => ({
            kind: file.kind,
            sourcePath: file.sourcePath,
            archivePath: file.archivePath,
            retention: "archived",
            retentionReason: null,
            byteLength: file.bytes.byteLength,
            sha256: sha256(file.bytes),
            gitBlobOid: gitBlobOid(file.bytes),
          })),
          issues: [],
        });
        selected.push({
          selectionRank: index,
          selectionRound: 1,
          repositoryOrder: index,
          repositorySelectionIndex: 1,
          repositoryFullName: `owner-${index}/repo-${index}`,
          repositoryUrl: `https://github.com/owner-${index}/repo-${index}`,
          commit: oid(`commit-${index}`),
          path: `skills/skill-${index}/SKILL.md`,
          blobOid: gitBlobOid(skillBytes),
          blobSize: skillBytes.byteLength,
          provisionalLineageId: `git-blob-sha1:${gitBlobOid(skillBytes)}`,
          license: {
            spdxId: "MIT",
            authorityPath: "LICENSE",
            blobOid: gitBlobOid(licenseBytes),
            size: licenseBytes.byteLength,
          },
        });
      }
      const selectionSemantic = {
        schemaVersion: "skill-ir-public-skill-responsibility-metadata-selection/v1",
        identity: "skill-ir-public-skill-responsibility-corpus-development-001",
        status: "frozen-selection-pending-commit",
        selectedAt: "2026-09-10T07:59:00.000Z",
        protocol: {
          path: "benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json",
          sha256: "a".repeat(64),
        },
        discovery: {
          path: "results/discovery.json",
          sha256: "b".repeat(64),
          portableSha256: "c".repeat(64),
        },
        selected,
        exclusions: [],
        totals: {
          selectedSkills: 40,
          selectedRepositories: 40,
          provisionalLineages: 40,
          searchUniverseRepositories: 40,
          inspectedRepositories: 25,
          uninspectedRepositories: 15,
          targetSkills: 40,
          minimumRepositories: 8,
          bodyExposures: 0,
        },
        accounting: {
          publicMetadataRequests: 58,
          publicSkillBodyRequests: 0,
          publicSkillBodyBytes: 0,
          modelCalls: 0,
          businessApiCalls: 0,
          paidCalls: 0,
          heldOutAccesses: 0,
          q1ReservedAccesses: 0,
          pendingProspectiveAccesses: 0,
        },
      };
      const selection = {
        ...selectionSemantic,
        portableSemanticSha256: sha256(new TextEncoder().encode(canonical(selectionSemantic))),
      };
      const selectionPath = join(rootDir, "results", "selection.json");
      const selectionBytes = new TextEncoder().encode(`${JSON.stringify(selection, null, 2)}\n`);
      await writeFile(selectionPath, selectionBytes);
      await git(rootDir, ["init"]);
      await git(rootDir, ["add", "results/selection.json"]);
      await git(rootDir, ["-c", "user.name=SkVM Test", "-c", "user.email=skvm-test@example.invalid", "commit", "-m", "freeze selection"]);
      const selectionCommit = await git(rootDir, ["rev-parse", "HEAD"]);
      const selectionCommittedAt = new Date(await git(rootDir, ["show", "-s", "--format=%cI", selectionCommit])).toISOString();
      const firstBodyExposureAt = new Date(Date.parse(selectionCommittedAt) + 60_000).toISOString();
      const manifest = {
        schemaVersion: "skill-ir-public-skill-responsibility-source-archive/v1",
        identity: "skill-ir-public-skill-responsibility-corpus-development-001",
        status: "source-archive-complete",
        selection: {
          path: "results/selection.json",
          commit: selectionCommit,
          sha256: sha256(selectionBytes),
          committedAt: selectionCommittedAt,
        },
        firstBodyExposureAt,
        rows,
        accounting: {
          publicSourceRequests: 80,
          publicSourceBytes: archivedBytes,
          archivedFiles: 80,
          archivedBytes,
          locatorOnlyFiles: 0,
          modelCalls: 0,
          businessApiCalls: 0,
          paidCalls: 0,
          heldOutAccesses: 0,
          q1ReservedAccesses: 0,
          pendingProspectiveAccesses: 0,
        },
      };
      const manifestPath = join(archiveRoot, "archive-manifest.json");
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" })).resolves.toMatchObject({
        status: "verified-source-archive",
        rows: 40,
        archivedFiles: 80,
      });
      const baselineManifest = PublicSkillSourceArchiveManifestSchema.parse(manifest);

      const earlyExposureManifest = {
        ...baselineManifest,
        firstBodyExposureAt: new Date(Date.parse(selectionCommittedAt) - 1).toISOString(),
      };
      await writeFile(manifestPath, `${JSON.stringify(earlyExposureManifest, null, 2)}\n`, "utf8");
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" }))
        .rejects.toThrow(/exposure|selection commit|precedes/iu);

      const locatorBytes = new TextEncoder().encode("resource fetched but redistribution became ambiguous");
      const locatorManifest = structuredClone(baselineManifest);
      locatorManifest.status = "source-archive-incomplete";
      const locatorRow = locatorManifest.rows[0];
      expect(locatorRow).toBeDefined();
      if (!locatorRow) throw new Error("fixture must contain the first selected row");
      locatorRow.status = "locator-only";
      locatorRow.issues = [{ code: "redistribution-ambiguous", reference: "references/private.md", paths: ["skills/skill-1/references/private.md"] }];
      locatorRow.files.push({
        kind: "resource",
        sourcePath: "skills/skill-1/references/private.md",
        archivePath: null,
        retention: "locator-only",
        retentionReason: "redistribution status became ambiguous after retrieval",
        byteLength: locatorBytes.byteLength,
        sha256: sha256(locatorBytes),
        gitBlobOid: gitBlobOid(locatorBytes),
      });
      locatorManifest.accounting.publicSourceRequests += 1;
      locatorManifest.accounting.publicSourceBytes += locatorBytes.byteLength;
      locatorManifest.accounting.locatorOnlyFiles = 1;
      await writeFile(manifestPath, `${JSON.stringify(locatorManifest, null, 2)}\n`, "utf8");
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" })).resolves.toMatchObject({
        status: "verified-source-archive",
        rows: 40,
        locatorOnlyFiles: 1,
      });

      await writeFile(manifestPath, `${JSON.stringify(baselineManifest, null, 2)}\n`, "utf8");

      const firstFile = rows[0]?.files[0];
      expect(firstFile).toBeDefined();
      if (!firstFile) {
        throw new Error("fixture must contain an archived skill file");
      }
      const firstPath = join(archiveRoot, firstFile.archivePath);
      const original = await readFile(firstPath);
      await unlink(firstPath);
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" })).rejects.toThrow(/missing|closure|file set/iu);
      await writeFile(firstPath, original);
      await writeFile(join(archiveRoot, "extra.txt"), "extra", "utf8");
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" })).rejects.toThrow(/extra|closure|file set/iu);
      await unlink(join(archiveRoot, "extra.txt"));
      await writeFile(firstPath, "tampered", "utf8");
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" })).rejects.toThrow(/digest|sha256|byte length|Git blob OID/iu);
      await writeFile(firstPath, original);
      const reformattedSelectionBytes = new TextEncoder().encode(`${JSON.stringify(selection)}\n`);
      await writeFile(selectionPath, reformattedSelectionBytes);
      const gitDriftManifest = structuredClone(baselineManifest);
      gitDriftManifest.selection.sha256 = sha256(reformattedSelectionBytes);
      await writeFile(manifestPath, `${JSON.stringify(gitDriftManifest, null, 2)}\n`, "utf8");
      await expect(verifyPublicSkillSourceArchiveFiles({ rootDir, archiveDir, gitExecutable: "git" }))
        .rejects.toThrow(/selection.*Git|Git-bound|digest/iu);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
