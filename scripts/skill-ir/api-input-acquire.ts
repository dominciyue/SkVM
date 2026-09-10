import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createAcquirer, qualifySource, type Request } from "./deadline-acquire";
import { gitBlobOid } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive";
import { normalizeRepositoryRelativePath } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const Config = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  commit: z.string().regex(/^[a-f0-9]{40}$/u), tree: z.string().regex(/^[a-f0-9]{40}$/u),
  documents: z.array(z.object({ inputId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u), provider: z.string().min(1), path: z.string().min(1) }).strict()).min(1),
}).strict();
type Input = { inputId: string; provider: string; sourcePath: string; sourceUrl: string; status: "acquired" | "failed";
  localPath: string | null; format: "json" | "yaml" | null; byteLength: number | null; sha256: string | null; gitBlobOid: string | null;
  qualification: ReturnType<typeof qualifySource> | null; error: string | null };

/** A declared-input adapter over the common cache; no operation-based selection. */
export async function acquireApiInputs(options: { root: string; config: unknown; request?: Request }) {
  const config = Config.parse(options.config);
  if (new Set(config.documents.map((d) => d.inputId)).size !== config.documents.length) throw new Error("duplicate input identity");
  for (const doc of config.documents) normalizeRepositoryRelativePath(doc.path, "source document");
  const cache = await createAcquirer(options.root, options.request);
  const json = async (endpoint: string) => JSON.parse((await cache.get(endpoint)).body.toString("utf8"));
  const commit = await json(`repos/${config.repository}/git/commits/${config.commit}`);
  if (commit.tree?.sha !== config.tree) throw new Error("commit/tree mismatch");
  const tree = await json(`repos/${config.repository}/git/trees/${config.tree}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("incomplete tree");
  const report = { schemaVersion: "skill-family-api-inputs/v1", exposure: "development", repository: config.repository,
    commit: config.commit, tree: config.tree, provenanceLimit: "public repository copy; upstream currency and API behavior not verified",
    inputs: [] as Input[], accounting: { modelCalls: 0, paidCalls: 0 } };
  const target = join(options.root, "inputs.json");
  try { await appendFile(join(options.root, "input-history.jsonl"), (await readFile(target, "utf8")).trim() + "\n"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await mkdir(join(options.root, "sources"), { recursive: true });
  for (const doc of config.documents) {
    const row: Input = { inputId: doc.inputId, provider: doc.provider, sourcePath: doc.path,
      sourceUrl: `https://github.com/${config.repository}/blob/${config.commit}/${doc.path}`,
      status: "failed", localPath: null, format: null, byteLength: null, sha256: null, gitBlobOid: null, qualification: null, error: null };
    report.inputs.push(row);
    try {
      const matches = tree.tree.filter((e: any) => e.path === doc.path);
      if (matches.length !== 1 || matches[0].type !== "blob" || !["100644", "100755"].includes(matches[0].mode)) throw new Error("declared regular source not in pinned tree");
      const entry = matches[0];
      if (!/^[a-f0-9]{40}$/u.test(entry.sha) || entry.size > 2 * 1024 * 1024) throw new Error("invalid/oversized source blob");
      const blob = await json(`repos/${config.repository}/git/blobs/${entry.sha}`);
      if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error("unsupported blob encoding");
      const bytes = Buffer.from(blob.content, "base64");
      if (bytes.length > 2 * 1024 * 1024 || gitBlobOid(bytes) !== entry.sha) throw new Error("blob integrity failure");
      const format = doc.path.endsWith(".json") ? "json" : /\.ya?ml$/u.test(doc.path) ? "yaml" : null;
      if (!format) throw new Error("input format not recognized");
      const localPath = `sources/${doc.inputId}.${format}`;
      try { await writeFile(join(options.root, localPath), bytes, { flag: "wx" }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!(await readFile(join(options.root, localPath))).equals(bytes)) throw new Error("existing input drift");
      }
      Object.assign(row, { status: "acquired", localPath, format, byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"), gitBlobOid: entry.sha, qualification: qualifySource(bytes, format) });
    } catch (error) { row.error = String(error); }
    await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}

if (import.meta.main) {
  const configPath = process.argv.find((v) => v.startsWith("--config="))?.slice(9);
  const root = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
  if (!configPath || !root) throw new Error("usage: --config=<input-list.json> --out=<acquisition-directory>");
  const report = await acquireApiInputs({ root, config: JSON.parse(await readFile(configPath, "utf8")) });
  console.log(JSON.stringify(report.inputs.map(({ inputId, status, byteLength, qualification, error }) => ({ inputId, status, byteLength, qualification, error })), null, 2));
}
