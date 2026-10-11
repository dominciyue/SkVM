import path from "node:path"
import { root, json, write } from "../study.ts"

// Primary source adjudications only. This binds them to immutable actual artifacts;
// it never generates grades or supplies them to a model consumer.
const group = process.argv[2], rows = await json(path.join(import.meta.dir, "change-adjudications.json"))
for (const row of rows.filter((r: any) => r.change === group)) {
  if (row.status !== "adjudicated" || row.questions.length !== 4 || !row.independentReview?.reviewers?.length) throw new Error("Complete the primary source adjudication and independent evidence first")
  const attemptId = row.attemptId, report = await json(path.join(root, "attempts", attemptId, "report.json"))
  if (!report.actualModelInput?.fullOriginalBundlePrefixMatches || report.actualModelInput.originalQuestionsPresent?.length !== 4 || !report.actualModelInput.originalQuestionsPresent.every((q: any) => q.present) || report.sourceVerification?.valid !== true) throw new Error("Original input/source verification missing")
  const review = { ...row, schemaVersion: "authorization-be-source-review/v1", status: "source-reviewed", answerSha256: report.answerSha256, inputSha256: report.inputSha256, runtimeTree: report.runtimeTree, reviewedAt: row.reviewedAt ?? "2026-10-11" }
  await write(path.join(root, "attempts", attemptId, "source-review.json"), review, true)
  console.log(JSON.stringify({ attemptId, questions: row.questions.map((q: any) => q.quality), wholeOriginalTask: row.wholeOriginalTask }))
}
