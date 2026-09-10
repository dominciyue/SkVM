import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  acquireApiTesterOperationProspectiveSources,
  verifyApiTesterOperationProspectiveSourceArchive,
} from "./api-tester-operation-prospective-source";

const repositoryRoot = process.cwd();
const freezePath = "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze-revision-001.json";
const freezeCommit = "e4c006fe32a6321ce5e4696758d53024c160f6db";

function gitOid(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function response(body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    status: 200,
    headers: { "content-type": "application/json", "x-ratelimit-remaining": "50", "x-ratelimit-reset": "1789045200" },
    body: bytes,
  };
}

describe("API Tester prospective public source acquisition", () => {
  test("selects twelve independent repositories in frozen order and verifies the exact archive", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-prospective-source-"));
    const outputDir = "results/source-selection";
    try {
      const freezeBytes = await readFile(join(repositoryRoot, freezePath));
      await mkdir(dirname(join(rootDir, freezePath)), { recursive: true });
      await writeFile(join(rootDir, freezePath), freezeBytes);
      const repositories = [
        { id: 1, full_name: "open-meteo/open-meteo" },
        ...Array.from({ length: 12 }, (_, index) => ({ id: index + 2, full_name: `prospective-owner-${index + 1}/api-${index + 1}` })),
      ].map((entry) => ({
        ...entry,
        html_url: `https://github.com/${entry.full_name}`,
        url: `https://api.github.com/repos/${entry.full_name}`,
        private: false,
        fork: false,
        archived: false,
        default_branch: "main",
        license: { spdx_id: "MIT" },
      }));
      const sourceByRepository = new Map(repositories.slice(1).map((entry, index) => {
        const body = `openapi: 3.1.0\ninfo:\n  title: prospective-${index + 1}\n  version: '1'\npaths:\n  /items/${index + 1}:\n    get:\n      responses:\n        '200':\n          description: ok\n`;
        return [entry.full_name, new TextEncoder().encode(body)] as const;
      }));
      const licenseBytes = new TextEncoder().encode("MIT License\nPermission is hereby granted for this deterministic fixture.\n");
      const calls: string[] = [];
      const request = async (url: string) => {
        calls.push(url);
        const parsed = new URL(url);
        if (parsed.pathname === "/search/repositories") {
          const query = parsed.searchParams.get("q");
          return response(JSON.stringify({
            total_count: query?.includes("openapi-specification") ? repositories.length : 0,
            incomplete_results: false,
            items: query?.includes("openapi-specification") ? repositories : [],
          }));
        }
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parsed.hostname === "api.github.com" && parts[0] === "repos") {
          const fullName = `${parts[1]}/${parts[2]}`;
          if (parts[3] === "branches") return response(JSON.stringify({ commit: { sha: gitOid(new TextEncoder().encode(`commit:${fullName}`)) } }));
          if (parts[3] === "git" && parts[4] === "trees") {
            const source = sourceByRepository.get(fullName)!;
            return response(JSON.stringify({
              sha: parts[5],
              truncated: false,
              tree: [
                { path: "LICENSE", type: "blob", mode: "100644", sha: gitOid(licenseBytes), size: licenseBytes.byteLength },
                { path: "openapi.yaml", type: "blob", mode: "100644", sha: gitOid(source), size: source.byteLength },
              ],
            }));
          }
        }
        if (parsed.hostname === "raw.githubusercontent.com") {
          const fullName = `${parts[0]}/${parts[1]}`;
          return response(parts.at(-1) === "LICENSE" ? licenseBytes : sourceByRepository.get(fullName)!);
        }
        throw new Error(`unexpected request ${url}`);
      };

      const selection = await acquireApiTesterOperationProspectiveSources({
        rootDir,
        outputDir,
        preSourceFreezePath: freezePath,
        preSourceFreezeCommit: freezeCommit,
        selectedAt: "2026-09-10T12:30:00.000Z",
        request,
      });
      expect(selection.selected).toHaveLength(12);
      expect(selection.selected.map((row) => row.repository.fullName)).toEqual(repositories.slice(1).map((entry) => entry.full_name));
      expect(selection.excluded).toEqual(expect.arrayContaining([
        expect.objectContaining({ repositoryFullName: "open-meteo/open-meteo", reasons: ["EXPOSED_REPOSITORY"] }),
      ]));
      expect(calls.some((url) => /candidate|operation-input|checker/iu.test(url))).toBe(false);
      await expect(verifyApiTesterOperationProspectiveSourceArchive({ rootDir, outputDir })).resolves.toMatchObject({
        status: "verified-source-selection-archive",
        selectedRealDocuments: 12,
        publicSourceSearchRequests: 2,
        candidateTrialsBeforeSelection: 0,
      });

      const acquisitionPath = join(rootDir, outputDir, "acquisition.json");
      const outputManifestPath = join(rootDir, outputDir, "output-manifest.json");
      const originalAcquisition = await readFile(acquisitionPath);
      const originalOutputManifest = await readFile(outputManifestPath);
      const acquisition = JSON.parse(originalAcquisition.toString("utf8"));
      const firstSelectedCandidate = acquisition.candidates.find((entry: any) => entry.selectedOrder === 1);
      firstSelectedCandidate.sourceBlobOid = "0".repeat(40);
      const tamperedAcquisition = new TextEncoder().encode(`${JSON.stringify(acquisition, null, 2)}\n`);
      await writeFile(acquisitionPath, tamperedAcquisition);
      const outputManifest = JSON.parse(originalOutputManifest.toString("utf8"));
      const acquisitionFile = outputManifest.files.find((entry: any) => entry.path === "acquisition.json");
      acquisitionFile.byteLength = tamperedAcquisition.byteLength;
      acquisitionFile.sha256 = sha256(tamperedAcquisition);
      outputManifest.acquisition.byteLength = tamperedAcquisition.byteLength;
      outputManifest.acquisition.sha256 = sha256(tamperedAcquisition);
      await writeFile(outputManifestPath, `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
      await expect(verifyApiTesterOperationProspectiveSourceArchive({ rootDir, outputDir }))
        .rejects.toThrow(/tree|blob|candidate|source.*binding/iu);
      await writeFile(acquisitionPath, originalAcquisition);
      await writeFile(outputManifestPath, originalOutputManifest);

      const selectionPath = join(rootDir, outputDir, "selection.json");
      const originalSelection = await readFile(selectionPath);
      const omittedAcquisition = JSON.parse(originalAcquisition.toString("utf8"));
      omittedAcquisition.candidates.shift();
      omittedAcquisition.candidates.forEach((entry: any, index: number) => { entry.order = index + 1; });
      omittedAcquisition.accounting.excludedCandidates -= 1;
      const omittedSelection = JSON.parse(originalSelection.toString("utf8"));
      omittedSelection.excluded.shift();
      omittedSelection.excluded.forEach((entry: any, index: number) => { entry.order = index + 1; });
      omittedSelection.discovery.candidatesInspected -= 1;
      omittedSelection.discovery.excludedCandidates -= 1;
      const omittedSelectionBytes = new TextEncoder().encode(`${JSON.stringify(omittedSelection, null, 2)}\n`);
      omittedAcquisition.selection.byteLength = omittedSelectionBytes.byteLength;
      omittedAcquisition.selection.sha256 = sha256(omittedSelectionBytes);
      const omittedAcquisitionBytes = new TextEncoder().encode(`${JSON.stringify(omittedAcquisition, null, 2)}\n`);
      const omittedOutputManifest = JSON.parse(originalOutputManifest.toString("utf8"));
      for (const [path, bytes] of [["selection.json", omittedSelectionBytes], ["acquisition.json", omittedAcquisitionBytes]] as const) {
        const file = omittedOutputManifest.files.find((entry: any) => entry.path === path);
        file.byteLength = bytes.byteLength;
        file.sha256 = sha256(bytes);
      }
      omittedOutputManifest.selection = { path: "selection.json", byteLength: omittedSelectionBytes.byteLength, sha256: sha256(omittedSelectionBytes) };
      omittedOutputManifest.acquisition = { path: "acquisition.json", byteLength: omittedAcquisitionBytes.byteLength, sha256: sha256(omittedAcquisitionBytes) };
      await writeFile(selectionPath, omittedSelectionBytes);
      await writeFile(acquisitionPath, omittedAcquisitionBytes);
      await writeFile(outputManifestPath, `${JSON.stringify(omittedOutputManifest, null, 2)}\n`, "utf8");
      await expect(verifyApiTesterOperationProspectiveSourceArchive({ rootDir, outputDir }))
        .rejects.toThrow(/search|coverage|replay|candidate/iu);
      await writeFile(selectionPath, originalSelection);
      await writeFile(acquisitionPath, originalAcquisition);
      await writeFile(outputManifestPath, originalOutputManifest);

      const firstSource = join(rootDir, selection.selected[0]!.source.archivePath);
      await writeFile(firstSource, "tampered", "utf8");
      await expect(verifyApiTesterOperationProspectiveSourceArchive({ rootDir, outputDir }))
        .rejects.toThrow(/digest|sha256|byte|closure/iu);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("archives the terminal non-success response and counts the attempted request", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-prospective-source-failure-"));
    const outputDir = "results/source-selection-failure";
    try {
      const freezeBytes = await readFile(join(repositoryRoot, freezePath));
      await mkdir(dirname(join(rootDir, freezePath)), { recursive: true });
      await writeFile(join(rootDir, freezePath), freezeBytes);
      const terminalBody = new TextEncoder().encode('{"message":"API rate limit exceeded"}\n');
      await expect(acquireApiTesterOperationProspectiveSources({
        rootDir,
        outputDir,
        preSourceFreezePath: freezePath,
        preSourceFreezeCommit: freezeCommit,
        selectedAt: "2026-09-10T12:45:00.000Z",
        request: async () => ({
          status: 403,
          headers: { "content-type": "application/json", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1789045200" },
          body: terminalBody,
        }),
      })).rejects.toThrow(/HTTP 403/u);

      const archivedBody = await readFile(join(rootDir, outputDir, "raw/search/github-topic-openapi-specification.json"));
      expect([...archivedBody]).toEqual([...terminalBody]);
      const metadata = JSON.parse(await readFile(join(rootDir, outputDir, "raw/search/github-topic-openapi-specification.metadata.json"), "utf8"));
      expect(metadata).toMatchObject({ status: 403, headers: { "x-ratelimit-remaining": "0" } });
      const failure = JSON.parse(await readFile(join(rootDir, outputDir, "failure.json"), "utf8"));
      expect(failure).toMatchObject({
        status: "source-acquisition-failed",
        accounting: { requestsAttempted: 1, publicSourceResponsesArchived: 1 },
      });
      await expect(readFile(join(rootDir, outputDir, "output-manifest.json"))).rejects.toThrow();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("closes and verifies an unrelaxed source shortfall", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-prospective-source-shortfall-"));
    const outputDir = "results/source-selection-shortfall";
    try {
      const freezeBytes = await readFile(join(repositoryRoot, freezePath));
      await mkdir(dirname(join(rootDir, freezePath)), { recursive: true });
      await writeFile(join(rootDir, freezePath), freezeBytes);
      let calls = 0;
      const selection = await acquireApiTesterOperationProspectiveSources({
        rootDir,
        outputDir,
        preSourceFreezePath: freezePath,
        preSourceFreezeCommit: freezeCommit,
        selectedAt: "2026-09-10T12:50:00.000Z",
        request: async () => {
          calls += 1;
          return response(JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }));
        },
      });
      expect(calls).toBe(2);
      expect(selection.selected).toHaveLength(0);
      expect(selection.shortfall).toEqual({ target: 12, actual: 0, missing: 12, ruleRelaxed: false });
      expect(JSON.parse(await readFile(join(rootDir, outputDir, "acquisition.json"), "utf8")))
        .toMatchObject({ status: "source-selection-shortfall", accounting: { publicSourceSearchRequests: 2, publicSourceDownloadRequests: 0 } });
      await expect(verifyApiTesterOperationProspectiveSourceArchive({ rootDir, outputDir })).resolves.toMatchObject({
        status: "verified-source-selection-archive",
        selectedRealDocuments: 0,
        publicSourceSearchRequests: 2,
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
