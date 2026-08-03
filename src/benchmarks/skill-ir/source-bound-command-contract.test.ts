import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { matchSourceBoundCommand } from "./source-bound-command-contract.ts"

describe("source-bound command semantic contract", () => {
  test("accepts exact public variants and caller-supplied aliases or script bodies", async () => {
    const contract = {
      variants: ["npm run start", "npm start", "node src/cli.js"],
      slots: [],
    } as const
    await expect(matchSourceBoundCommand("npm start", contract, process.cwd()))
      .resolves.toMatchObject({ status: "matched", reason: "exact-variant" })
    await expect(matchSourceBoundCommand("node src/cli.js", contract, process.cwd()))
      .resolves.toMatchObject({ status: "matched", reason: "exact-variant" })
    await expect(matchSourceBoundCommand("npm run deploy", contract, process.cwd()))
      .resolves.toMatchObject({ status: "rejected" })
  })

  test("accepts only declared whole placeholders and existing repository-local path arguments", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "skvm-command-contract-"))
    try {
      await mkdir(path.join(rootDir, "notes"))
      const contract = {
        variants: ["note-index scan notes/"],
        slots: [{ tokenIndex: 2, allowed: ["placeholder", "repository-path"] }],
      } as const
      await expect(matchSourceBoundCommand("note-index scan <notes-directory>", contract, rootDir))
        .resolves.toMatchObject({ status: "matched", reason: "declared-slot" })
      await expect(matchSourceBoundCommand("note-index scan .", contract, rootDir))
        .resolves.toMatchObject({ status: "matched", reason: "declared-slot" })
      await expect(matchSourceBoundCommand("note-index scan notes", contract, rootDir))
        .resolves.toMatchObject({ status: "matched", reason: "declared-slot" })
      await expect(matchSourceBoundCommand("note-index scan missing", contract, rootDir))
        .resolves.toMatchObject({ status: "rejected", reason: "repository-path-missing" })
      await expect(matchSourceBoundCommand("note-index <verb> notes", contract, rootDir))
        .resolves.toMatchObject({ status: "rejected", reason: "literal-token-mismatch" })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test("rejects shell control, absolute paths, parent traversal, and symlink escape", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-command-boundary-"))
    const repositoryRoot = path.join(temporaryRoot, "repository")
    const outsideRoot = path.join(temporaryRoot, "outside")
    await mkdir(repositoryRoot)
    await mkdir(outsideRoot)
    await writeFile(path.join(outsideRoot, "secret.txt"), "secret\n")
    const contract = {
      variants: ["note-index scan notes/"],
      slots: [{ tokenIndex: 2, allowed: ["repository-path"] }],
    } as const
    try {
      await expect(matchSourceBoundCommand("note-index scan . && echo leaked", contract, repositoryRoot))
        .resolves.toMatchObject({ status: "rejected", reason: "shell-control" })
      await expect(matchSourceBoundCommand(`note-index scan ${outsideRoot}`, contract, repositoryRoot))
        .resolves.toMatchObject({ status: "rejected", reason: "repository-path-absolute" })
      await expect(matchSourceBoundCommand("note-index scan ../outside", contract, repositoryRoot))
        .resolves.toMatchObject({ status: "rejected", reason: "repository-path-escape" })
      try {
        await symlink(outsideRoot, path.join(repositoryRoot, "linked-outside"), "junction")
        await expect(matchSourceBoundCommand("note-index scan linked-outside", contract, repositoryRoot))
          .resolves.toMatchObject({ status: "rejected", reason: "repository-path-symlink-escape" })
      } catch (error) {
        if (!["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("returns unconfirmed instead of guessing when no public variant exists", async () => {
    await expect(matchSourceBoundCommand("npm test", { variants: [], slots: [] }, process.cwd()))
      .resolves.toEqual({ status: "unconfirmed", reason: "no-public-variant" })
  })
})
