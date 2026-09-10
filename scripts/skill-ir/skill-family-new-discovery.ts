import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAcquirer } from "./deadline-acquire";

export function boundDiscoveryQueries(method: { discoveryQueries?: unknown }): string[] {
  const queries = method.discoveryQueries ?? ["OpenAPI test filename:SKILL.md", "swagger test filename:SKILL.md"];
  if (!Array.isArray(queries) || !queries.length || queries.some((q) => typeof q !== "string" || !q.trim())) throw new Error("invalid method query list");
  return queries;
}

export function selectNewSkillCandidates(items: any[], excludedRepositories: string[]) {
  const seen = new Set(excludedRepositories.map((r) => r.toLowerCase()));
  const selected: Array<{ repository: string; maximumSkills: number; paths: string[] }> = [];
  for (const item of items) {
    const repository = item.repository?.full_name, path = item.path;
    if (typeof repository !== "string" || typeof path !== "string" || !/(^|\/)SKILL\.md$/u.test(path) || seen.has(repository.toLowerCase())) continue;
    seen.add(repository.toLowerCase());
    selected.push({ repository, maximumSkills: 1, paths: [path] });
    if (selected.length === 8) break;
  }
  return selected;
}

if (import.meta.main) {
  const arg = (k: string) => process.argv.find((v) => v.startsWith(`--${k}=`))?.slice(k.length + 3);
  const out = arg("out"), prior = arg("prior");
  if (!out || !prior) throw new Error("--out=<method-bound-directory> --prior=<development-sources.json> required");
  const method = JSON.parse(await readFile(join(out, "method-binding.json"), "utf8"));
  if (method.identity !== "skill-family-new-members-20260911") throw new Error("method binding missing");
  const excluded = JSON.parse(await readFile(prior, "utf8")).repositories.map((r: any) => r.repository);
  const fetcher = await createAcquirer(out);
  const failures: unknown[] = [];
  for (const query of boundDiscoveryQueries(method)) {
    try {
      const raw = await fetcher.get(`search/code?q=${encodeURIComponent(query)}&per_page=100`);
      const response = JSON.parse(raw.body.toString("utf8"));
      if (!Array.isArray(response.items)) throw new Error("search items absent");
      await writeFile(join(out, "discovery.json"), JSON.stringify({ query, response, priorFailures: failures }, null, 2) + "\n", { flag: "wx" });
      const repositories = selectNewSkillCandidates(response.items, excluded);
      await writeFile(join(out, "acquisition-config.json"), JSON.stringify({ identity: method.identity, query, repositories }, null, 2) + "\n", { flag: "wx" });
      console.log(JSON.stringify({ query, totalCount: response.total_count, repositories }));
      break;
    } catch (error) {
      failures.push({ query, error: String(error) });
      await writeFile(join(out, "discovery-failures.json"), JSON.stringify(failures, null, 2) + "\n");
    }
  }
}
