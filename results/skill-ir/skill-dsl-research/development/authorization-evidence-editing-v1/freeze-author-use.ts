import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const briefBytes = readFileSync(path.join(root, "author-use-briefs.json"))
const briefs = JSON.parse(briefBytes.toString("utf8")) as { schemaVersion: string; model: string; packages: Array<{ id: string; sourceDirectory: string; sourceFiles: string[] }> }
if (briefs.schemaVersion !== "authorization-aj-author-use-briefs/v1" || briefs.packages.length !== 2) throw new Error("Expected two frozen author-use packages")
const sources = briefs.packages.flatMap(item => item.sourceFiles.map(relative => {
  const file = path.join(root, item.sourceDirectory, ...relative.split("/"))
  return { path: path.relative(repo, file).replaceAll("\\", "/"), sha256: hash(readFileSync(file)) }
}))
const order = ["original", "changed"].flatMap(phase => briefs.packages.flatMap(item => (["markdown", "dsl"] as const).map(representation => ({
  id: `${item.id}-${representation}-${phase}`, packageId: item.id, representation, phase }))))
const plan = { schemaVersion: "authorization-aj-author-use-plan/v1", frozenBeforeAuthorGeneration: true,
  briefsSha256: hash(briefBytes), oracleSha256: hash(readFileSync(path.join(root, "author-use-oracle.json"))),
  runnerSha256: hash(readFileSync(path.join(root, "author-use-generate.ts"))), model: briefs.model,
  packages: briefs.packages.map(item => item.id), order, sources,
  deliveryCount: 8, consumerSessions: 8, maxScenarioAnswers: 16, oneDiagnosticRevisionPerInvalidDelivery: true,
  preserveFirstAndFinal: true, noCrossAuthorDrafts: true }
writeFileSync(path.join(root, "author-use-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
process.stdout.write(`${JSON.stringify({ packages: plan.packages, deliveries: order.length, sources: sources.length,
  planSha256: hash(JSON.stringify(plan, null, 2) + "\n") })}\n`)
