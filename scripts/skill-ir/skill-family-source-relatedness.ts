import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createContainedDirectory, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
type Body = { id: string; repository: string; text: string; rawSha256?: string };
export function compareSkillBodies(inputs: Body[]) {
  if (new Set(inputs.map((i) => i.id)).size !== inputs.length) throw new Error("unique body identities required");
  const bodies = inputs.map((input) => {
    const tokens = (input.text.match(/[A-Za-z0-9_]+|[\p{L}\p{N}]/gu) ?? []).map((t) => t.toLowerCase());
    const shingles = new Set<string>();
    for (let i = 0; i + 5 <= tokens.length; i++) shingles.add(tokens.slice(i, i + 5).join("\u0000"));
    return { id: input.id, repository: input.repository, rawSha256: input.rawSha256 ?? sha(input.text),
      normalizedSha256: sha(tokens.join("\n")), tokens: tokens.length, shingles };
  });
  const pairs = [];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const left = bodies[i]!, right = bodies[j]!;
    const smaller = left.shingles.size < right.shingles.size ? left.shingles : right.shingles;
    const larger = smaller === left.shingles ? right.shingles : left.shingles;
    let shared = 0;
    for (const value of smaller) if (larger.has(value)) shared++;
    const union = left.shingles.size + right.shingles.size - shared;
    const jaccard = union ? shared / union : 0, leftContainment = left.shingles.size ? shared / left.shingles.size : 0;
    const rightContainment = right.shingles.size ? shared / right.shingles.size : 0;
    const rawEqual = left.rawSha256 === right.rawSha256, normalizedEqual = left.normalizedSha256 === right.normalizedSha256;
    pairs.push({ left: left.id, right: right.id, sameRepository: left.repository === right.repository, rawEqual, normalizedEqual,
      leftShingles: left.shingles.size, rightShingles: right.shingles.size, shared, union, jaccard, leftContainment, rightContainment,
      reviewFlag: rawEqual || normalizedEqual || (smaller.size >= 100 && (jaccard >= 0.5 || leftContainment >= 0.8 || rightContainment >= 0.8)) });
  }
  return { method: "raw-and-normalized-5-token-shingles/v1", thresholds: { minimumShorterShingles: 100, jaccard: 0.5, directionalContainment: 0.8 },
    bodies: bodies.map(({ shingles, ...rest }) => ({ ...rest, shingleCount: shingles.size })), pairs, genealogicalIndependenceEstablished: false };
}

if (import.meta.main) {
  const output = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
  if (!output) throw new Error("--out=<new-output-directory>");
  const root = process.cwd(), out = await createContainedDirectory(root, output, "relatedness output");
  const indices = ["skill-family-deepening-20260911", "skill-family-new-members-20260911", "skill-family-new-members-20260911-r2",
    "skill-family-new-members-20260911-r3", "skill-family-new-members-20260911-r4", "skill-family-new-members-20260911-r5"]
    .map((name) => `results/skill-ir/${name}/sources.json`);
  const bodies: Body[] = [], sourceBindings = [], inputs = [], errors = [];
  for (const [indexNumber, path] of indices.entries()) {
    const absolute = await resolveContainedExistingFile(root, path, "exposed source index");
    const bytes = await readFile(absolute), index = JSON.parse(bytes.toString());
    sourceBindings.push({ path, sha256: sha(bytes) });
    for (const skill of index.skills) {
      const id = `${indexNumber}:${skill.skillId}`;
      try {
        const files = skill.files.filter((f: any) => f.kind === "skill");
        if (files.length !== 1) throw new Error("exactly one primary body required");
        const file = files[0], source = await readFile(await resolveContainedExistingFile(dirname(absolute), file.localPath, "primary skill body"));
        if (sha(source) !== file.sha256 || !source.length) throw new Error("primary body digest/empty mismatch");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(source);
        bodies.push({ id, repository: skill.repository, text, rawSha256: sha(source) });
        inputs.push({ id, skillId: skill.skillId, repository: skill.repository, commit: skill.commit, indexPath: path, localPath: file.localPath,
          rawSha256: sha(source), bytes: source.length, previousDuplicateOf: skill.duplicateOf ?? null });
      } catch (error) { errors.push({ id, error: String(error) }); }
    }
  }
  const report = { exposure: "existing-development-corpus", sourceBindings, inputs, errors, ...compareSkillBodies(bodies),
    codeSha256: sha(await readFile("scripts/skill-ir/skill-family-source-relatedness.ts")), newAcquisitionCalls: 0, modelCalls: 0, paidCalls: 0,
    limitation: "Lexical flags require source review. Low overlap does not prove independent origin; prior membership and first-run outcomes are unchanged." };
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ bodies: report.bodies.length, pairs: report.pairs.length, errors: report.errors, flagged: report.pairs.filter((p) => p.reviewFlag) }, null, 2));
  if (errors.length) process.exitCode = 1;
}
