import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createAcquirer } from "./deadline-acquire";
import { normalizeRepositoryRelativePath } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

export function supplementIndexNames(source = "sources.json", output = "sources-with-supplements.json") {
  source = normalizeRepositoryRelativePath(source, "supplement source index");
  output = normalizeRepositoryRelativePath(output, "supplement output index");
  if (source.toLowerCase() === output.toLowerCase()) throw new Error("supplement index must be a new revision");
  return { source, output };
}

export function verifySupplementBlob(entry: { type: string; mode: string; sha: string; size: number }, bytes: Buffer): true {
  if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode) || entry.size !== bytes.length
    || bytes.length > 1024 * 1024 || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== entry.sha)
    throw new Error("supplement does not match pinned regular blob");
  return true;
}

if (import.meta.main) {
  const arg = (key: string) => process.argv.find((s) => s.startsWith(`--${key}=`))?.slice(key.length + 3);
  const rootArg = arg("root"), configPath = arg("config");
  if (!rootArg || !configPath) throw new Error("--root=<acquisition-directory> --config=<explicit-resources.json>");
  const root = resolve(rootArg);
  const names = supplementIndexNames(arg("source-index"), arg("output-index"));
  const sourceBytes = await readFile(resolve(root, names.source));
  const index = JSON.parse(sourceBytes.toString());
  const config = JSON.parse(await readFile(configPath, "utf8")) as { resources: Array<{ skillId: string; path: string }> };
  const fetcher = await createAcquirer(root);
  const json = async (endpoint: string) => JSON.parse((await fetcher.get(endpoint)).body.toString());
  const supplemented = [];
  for (const row of config.resources) {
    const matches = index.skills.filter((s: any) => s.skillId === row.skillId);
    if (matches.length !== 1) throw new Error("supplement skill identity must be unique");
    const skill = matches[0];
    const path = normalizeRepositoryRelativePath(row.path, "supplement path");
    if (skill.files.some((f: any) => f.sourcePath === path)) throw new Error("resource already acquired");
    const commit = await json(`repos/${skill.repository}/git/commits/${skill.commit}`);
    if (commit.sha !== skill.commit) throw new Error("supplement commit drift");
    const tree = await json(`repos/${skill.repository}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error("supplement tree incomplete");
    const entries = tree.tree.filter((t: any) => t.path === path);
    if (entries.length !== 1 || entries[0].size > 1024 * 1024) throw new Error("supplement path absent, ambiguous or oversized");
    const blob = await json(`repos/${skill.repository}/git/blobs/${entries[0].sha}`);
    if (blob.encoding !== "base64") throw new Error("unsupported blob encoding");
    const bytes = Buffer.from(blob.content, "base64");
    verifySupplementBlob(entries[0], bytes);
    const localPath = normalizeRepositoryRelativePath(`supplements/${skill.repository}/${skill.commit}/${path}`, "supplement output");
    const target = resolve(root, localPath);
    await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await readFile(target)).equals(bytes)) throw error; }
    const record = { kind: "resource", sourcePath: path, localPath, sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length, gitBlobOid: entries[0].sha };
    skill.files.push(record);
    supplemented.push({ skillId: skill.skillId, ...record });
    console.log(JSON.stringify({ skillId: skill.skillId, path, bytes: bytes.length }));
  }
  index.supplementReview = { priorReview: index.supplementReview ?? null, sourceIndex: names.source, originalIndexSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    originalIssuesRetained: true, configPath, supplemented };
  await writeFile(resolve(root, names.output), JSON.stringify(index, null, 2) + "\n", { flag: "wx" });
}
