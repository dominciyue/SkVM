import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateDutyDraft } from "../../../src/skill-ir/skill-duty-extraction";
const base = "results/skill-ir/skill-duty-extraction-development-20260911/";
const reportBytes = await readFile(base + "first-run/report.json"), report = JSON.parse(reportBytes.toString("utf8"));
const attemptsBytes = await readFile(base + "first-run/attempts.jsonl"), events = attemptsBytes.toString("utf8").trim().split("\n").map(s => JSON.parse(s));
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
if (JSON.stringify(report.rows.map((r: any) => r.member)) !== JSON.stringify(["lambda", "jeremy", "pactflow"])) throw new Error("member inventory drift");
const rows = [];
for (const row of report.rows) {
  if (!["failed", "completed"].includes(row.state)) throw new Error("measurement still active");
  const memberEvents = events.filter((e: any) => e.member === row.member), starts = memberEvents.filter((e: any) => e.state === "started");
  if (starts.length !== 1 || row.physicalAttempts !== 1) throw new Error("physical attempt inventory mismatch");
  const files = [];
  for (const file of row.sourceFiles) {
    const bytes = await readFile(file.path);
    if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error("source binding mismatch");
    files.push({ id: file.id, kind: file.kind, bytes, sha256: file.sha256 });
  }
  const prompt = await readFile(base + `first-run/${row.member}-prompt.txt`);
  if (sha(prompt) !== row.promptSha256 || prompt.length !== row.promptBytes) throw new Error("prompt binding mismatch");
  const completed = memberEvents.find((e: any) => e.state === "completed");
  let validation = null, rawUsage = null;
  if (completed) {
    const bytes = await readFile(base + `first-run/http-${completed.attempt}.json`);
    if (sha(bytes) !== completed.responseSha256) throw new Error("response binding mismatch");
    const response = JSON.parse(bytes.toString("utf8")); rawUsage = response.usage ?? null;
    if (response.choices?.[0]?.message?.content !== row.text) throw new Error("draft differs from actual model response");
    validation = validateDutyDraft(files, JSON.parse(row.text));
    if (JSON.stringify(validation) !== JSON.stringify(row.validation)) throw new Error("offline revalidation drift");
  }
  rows.push({ member: row.member, state: row.state, physicalAttempts: starts.length, sourceFiles: files.length,
    sourceBytes: files.reduce((n,f) => n + f.bytes.length, 0), promptBytes: prompt.length,
    preparationMillis: row.preparationMillis, modelMillis: row.modelMillis ?? null, totalMillis: row.totalMillis,
    validationMillis: row.validationMillis ?? null, validationStatus: validation?.status ?? null,
    duties: validation?.draft?.responsibilities.length ?? null,
    obligations: validation?.draft?.responsibilities.reduce((n,r) => n + r.obligations.length, 0) ?? null,
    rawUsage, costUsd: null, billingKnown: false, remoteCompletionKnown: !!completed,
    automaticMappingApproved: false });
}
const summary = { exposure: report.exposure, executionCommit: report.executionCommit, model: report.model,
  reportSha256: sha(reportBytes), attemptsSha256: sha(attemptsBytes), rows,
  totals: { selectedMembers: 3, actualModelHttpAttempts: rows.reduce((n,r) => n+r.physicalAttempts,0),
    responseReceived: rows.filter(r => r.remoteCompletionKnown).length, noResponseReceived: rows.filter(r => !r.remoteCompletionKnown).length,
    locatorCheckedDrafts: rows.filter(r => r.validationStatus === "grounded-draft").length,
    knownInputTokens: rows.reduce((n,r) => n+(r.rawUsage?.prompt_tokens ?? 0),0), knownOutputTokens: rows.reduce((n,r) => n+(r.rawUsage?.completion_tokens ?? 0),0),
    totalTokensComplete: rows.every(r => r.rawUsage !== null), publicSourceVerificationGets: 8 },
  historicalExtractionCostReconstructed: false, developerAgentCostUsd: null, humanMinutes: null,
  completeSkillAutomationEstablished: false, retryForPreferredAnswer: false,
  semanticReviewPath: "jeremy-semantic-review.json", semanticReviewSha256: sha(await readFile(base + "jeremy-semantic-review.json")) };
const out = process.argv.find(v=>v.startsWith("--out="))?.slice(6); if (!out) throw new Error("--out=<new summary> required");
await writeFile(out, JSON.stringify(summary,null,2)+"\n",{flag:"wx"}); console.log(JSON.stringify(summary.totals));
