import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AcquisitionError, createAcquirer, type Request } from "./deadline-acquire";
import { gitBlobOid, planPublicSkillResourceClosure } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive";

type Repository = { repository: string; maximumSkills: number; paths?: string[] };
type Entry = { path: string; sha: string; mode: string; type: string; size?: number };
type File = { kind: "skill" | "resource" | "license"; sourcePath: string; localPath: string; sha256: string; byteLength: number; gitBlobOid: string };
type Issue = { code: string; reference: string; paths: string[] };
type Skill = { skillId: string; repository: string; commit: string; skillPath: string; exposure: "development";
  sourceUrl: string; files: File[]; issues: Issue[]; duplicateOf: string | null; acquiredAt: string };

const sha256 = (body: Buffer) => createHash("sha256").update(body).digest("hex");
const safePath = (path: string) => !path.startsWith("/") && !/[\\:\u0000]/u.test(path) && path.split("/").every((part) => part && part !== "." && part !== "..");
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function relevance(path: string) {
  if (/api.*(?:test|contract)|(?:test|contract).*api|openapi.*(?:postman|convert)/iu.test(path)) return 0;
  if (/contract|openapi|swagger|postman/iu.test(path)) return 1;
  if (/test|validation|schema/iu.test(path)) return 2;
  return 3;
}

export async function acquireSkills(options: { root: string; repositories: Repository[]; request?: Request }) {
  const cache = await createAcquirer(options.root, options.request);
  const priorSkills = new Map<string, Skill>();
  try {
    const previous = await readFile(join(options.root, "sources.json"), "utf8");
    const parsed = JSON.parse(previous);
    for (const skill of parsed.skills as Skill[]) priorSkills.set(`${skill.skillId}@${skill.commit}`, skill);
    await appendFile(join(options.root, "source-history.jsonl"), JSON.stringify(parsed) + "\n");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const report = { schemaVersion: "skill-family-acquisition/v1", exposure: "development",
    sampling: "purposive search-discovered repositories; path relevance then lexical order; per-repository cap; no outcome selection",
    repositories: [] as Array<{ repository: string; status: string; commit?: string; selected?: string[]; reason?: string; license?: string | null }>,
    skills: [] as Skill[], accounting: { modelCalls: 0, paidCalls: 0, developerAgentCost: "not-measured-by-runner" } };
  const contentOwners = new Map<string, string>();
  const checkpoint = () => writeFile(join(options.root, "sources.json"), JSON.stringify(report, null, 2) + "\n");
  async function json(endpoint: string): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      try { return JSON.parse((await cache.get(endpoint)).body.toString("utf8")); }
      catch (error) {
        if (attempt < 2 && error instanceof AcquisitionError && ["transient", "transport-failure"].includes(error.category)) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
  }
  async function saveBlob(repository: string, commit: string, entry: Entry, kind: File["kind"]): Promise<File> {
    if (!safePath(entry.path) || !/^[0-9a-f]{40}$/u.test(entry.sha) || !["100644", "100755"].includes(entry.mode)) throw new Error("invalid regular blob");
    const data = await json(`repos/${repository}/git/blobs/${entry.sha}`);
    if (data.encoding !== "base64" || typeof data.content !== "string") throw new Error("unsupported blob encoding");
    const body = Buffer.from(data.content, "base64");
    if (body.length > 1024 * 1024 || gitBlobOid(body) !== entry.sha) throw new Error("blob size/integrity failure");
    const localPath = `sources/${repository}/${commit}/${entry.path}`;
    const target = join(options.root, localPath);
    await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, body, { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await readFile(target)).equals(body)) throw new Error(`existing source drift: ${localPath}`);
    }
    return { kind, sourcePath: entry.path, localPath, sha256: sha256(body), byteLength: body.length, gitBlobOid: entry.sha };
  }
  for (const config of options.repositories) {
    const repository = config.repository;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error("invalid repository name");
    if (!Number.isInteger(config.maximumSkills) || config.maximumSkills < 1 || config.maximumSkills > 5) throw new Error("per repository cap must be 1..5");
    try {
      const metadata = await json(`repos/${repository}`);
      if (metadata.private || metadata.fork || metadata.archived || metadata.disabled || metadata.full_name.toLowerCase() !== repository.toLowerCase()) throw new Error("repository is private/fork/archived/disabled or renamed");
      const commitData = await json(`repos/${repository}/commits/${encodeURIComponent(metadata.default_branch)}`);
      const commit: string = commitData.sha;
      if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("invalid commit");
      const treeData = await json(`repos/${repository}/git/trees/${commitData.commit.tree.sha}?recursive=1`);
      if (treeData.truncated || !Array.isArray(treeData.tree)) throw new Error("incomplete tree");
      const entries: Entry[] = treeData.tree;
      const regular = entries.filter((e) => e.type === "blob" && ["100644", "100755"].includes(e.mode) && safePath(e.path));
      const seenBlobs = new Set<string>();
      const eligible = regular.filter((e) => /(^|\/)SKILL\.md$/u.test(e.path) && (e.size ?? Infinity) <= 524288
        && !/(^|\/)(node_modules|vendor|third_party|dist|build|\.cache)(\/|$)/u.test(e.path))
        .sort((a, b) => relevance(a.path) - relevance(b.path) || compare(a.path, b.path));
      const selected = eligible.filter((entry) => {
        if (config.paths && !config.paths.includes(entry.path)) return false;
        if (seenBlobs.has(entry.sha)) return false;
        seenBlobs.add(entry.sha); return true;
      }).slice(0, config.maximumSkills);
      const record = { repository, status: "metadata-pinned", commit, selected: selected.map((e) => e.path), license: metadata.license?.spdx_id ?? null };
      report.repositories.push(record);
      await checkpoint();
      const license = regular.find((e) => /^(LICENSE|COPYING)(\.[^/]*)?$/iu.test(e.path));
      for (const entry of selected) {
        const skill: Skill = { skillId: `${repository}:${entry.path}`, repository, commit, skillPath: entry.path,
          sourceUrl: `https://github.com/${repository}/blob/${commit}/${entry.path}`, exposure: "development",
          acquiredAt: priorSkills.get(`${repository}:${entry.path}@${commit}`)?.acquiredAt ?? new Date().toISOString(), files: [], issues: [], duplicateOf: null };
        report.skills.push(skill);
        try {
          const source = await saveBlob(repository, commit, entry, "skill");
          skill.files.push(source);
          skill.duplicateOf = contentOwners.get(source.sha256) ?? null;
          contentOwners.set(source.sha256, skill.duplicateOf ?? skill.skillId);
          const body = await readFile(join(options.root, source.localPath), "utf8");
          const plan = planPublicSkillResourceClosure({ skillPath: entry.path, skillBody: body,
            treeEntries: entries.map((e) => ({ path: e.path, oid: e.sha, mode: e.mode, type: e.type, size: e.size ?? null })),
            directlyNamedDirectories: ["scripts", "references", "reference", "templates", "assets", "examples"],
            maximumFiles: 60, maximumTotalBytes: 5 * 1024 * 1024, maximumBytesPerResource: 1024 * 1024 });
          skill.issues.push(...plan.issues);
          for (const resource of plan.resources) {
            try { skill.files.push(await saveBlob(repository, commit, { ...resource, sha: resource.oid, type: "blob" }, "resource")); }
            catch (error) { skill.issues.push({ code: "resource-fetch-failed", reference: String(error), paths: [resource.path] }); }
          }
          if (license) {
            try { skill.files.push(await saveBlob(repository, commit, license, "license")); }
            catch (error) { skill.issues.push({ code: "license-fetch-failed", reference: String(error), paths: [license.path] }); }
          } else skill.issues.push({ code: "license-not-located", reference: "repository root", paths: [] });
        } catch (error) { skill.issues.push({ code: "skill-fetch-or-closure-failed", reference: String(error), paths: [entry.path] }); }
        await checkpoint();
        console.log(JSON.stringify({ skill: skill.skillId, files: skill.files.length, issues: skill.issues.length }));
      }
      record.status = "processed";
    } catch (error) { report.repositories.push({ repository, status: "failed", reason: String(error) }); }
    await checkpoint();
  }
  return report;
}

if (import.meta.main) {
  const configPath = process.argv.find((arg) => arg.startsWith("--config="))?.slice(9);
  const root = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
  if (!configPath || !root) throw new Error("usage: --config=<repository-list.json> --out=<acquisition-directory>");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const report = await acquireSkills({ root, repositories: config.repositories });
  console.log(JSON.stringify({ repositories: report.repositories.length, skills: report.skills.length,
    bodies: report.skills.filter((s) => s.files.some((f) => f.kind === "skill")).length }));
}
