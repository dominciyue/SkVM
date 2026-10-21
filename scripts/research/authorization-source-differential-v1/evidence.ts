import { readFile, mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
export const repo = path.resolve(import.meta.dir, "../../..")
export const root = path.join(repo, "results/skill-ir/skill-dsl-research/development")
export const base = path.join(root, "authorization-source-differential-v1")
export const prior = path.join(root, "authorization-semantic-validation-v1")
export const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
export const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex")
export const relative = (p: string) => path.relative(repo, p).replaceAll("\\", "/")
export async function save(p: string, data: unknown) { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8") }
