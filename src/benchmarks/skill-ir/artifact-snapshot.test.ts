import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  captureArtifactSnapshot,
  verifyArtifactSnapshot,
  type ArtifactSnapshotReference,
} from "./artifact-snapshot";
import { sha256Bytes } from "./source-fixture";

const tempDirs: string[] = [];
const generationIdentity = "a".repeat(64);

async function tempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), label));
  tempDirs.push(dir);
  return dir;
}

async function fixture() {
  const root = await tempDir("skill-ir-snapshot-");
  const workDir = join(root, "workdir");
  const snapshotRoot = join(root, "snapshots");
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(join(workDir, "fixture.txt"), "protected\n", "utf8");
  await writeFile(join(workDir, "src", "generated.txt"), "before repair\n", "utf8");
  return {
    root,
    workDir,
    snapshotRoot,
    protectedFiles: [{
      relativePath: "fixture.txt",
      sha256: sha256Bytes(Buffer.from("protected\n", "utf8")),
    }],
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("artifact snapshots", () => {
  test("captures and verifies an immutable scoreable workdir snapshot", async () => {
    const input = await fixture();
    const reference = await captureArtifactSnapshot({
      ...input,
      generationIdentity,
      phase: "pre-repair",
    });

    expect(reference).toMatchObject({
      schemaVersion: "skill-ir-artifact-snapshot-ref/v1",
      generationIdentity,
      phase: "pre-repair",
    });
    expect(reference.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(join(reference.path, "src", "generated.txt"), "utf8"))
      .toBe("before repair\n");
    await expect(verifyArtifactSnapshot(reference)).resolves.toEqual(reference);
  });

  test("rejects a snapshot reference whose path escapes its frozen root", async () => {
    const input = await fixture();
    const reference = await captureArtifactSnapshot({
      ...input,
      generationIdentity,
      phase: "pre-repair",
    });
    const escaped: ArtifactSnapshotReference = {
      ...reference,
      path: input.workDir,
    };

    await expect(verifyArtifactSnapshot(escaped)).rejects.toThrow("snapshot path");
  });

  test("rejects symbolic links while capturing a snapshot", async () => {
    const input = await fixture();
    await symlink(join(input.workDir, "fixture.txt"), join(input.workDir, "linked.txt"), "file");

    await expect(captureArtifactSnapshot({
      ...input,
      generationIdentity,
      phase: "pre-repair",
    })).rejects.toThrow("symbolic links");
  });

  test("rejects digest drift before a snapshot is scored", async () => {
    const input = await fixture();
    const reference = await captureArtifactSnapshot({
      ...input,
      generationIdentity,
      phase: "pre-repair",
    });
    await writeFile(join(reference.path, "src", "generated.txt"), "tampered\n", "utf8");

    await expect(verifyArtifactSnapshot(reference)).rejects.toThrow("digest mismatch");
  });

  test("rejects capture when a protected input is missing or changed", async () => {
    const missing = await fixture();
    await rm(join(missing.workDir, "fixture.txt"));
    await expect(captureArtifactSnapshot({
      ...missing,
      generationIdentity,
      phase: "pre-repair",
    })).rejects.toThrow("protected input");

    const changed = await fixture();
    await writeFile(join(changed.workDir, "fixture.txt"), "changed\n", "utf8");
    await expect(captureArtifactSnapshot({
      ...changed,
      generationIdentity,
      phase: "pre-repair",
    })).rejects.toThrow("protected input");
  });
});
