import path from "node:path"
import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { z } from "zod"
import { root, selectPosition, replayAccounting } from "./study.ts"
import { ManifestSchema, AttemptReportSchema } from "./types.ts"
import type { AuthorizationProviderAttempt, AuthorizationLifecycleEvent } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

const id = process.argv[2] ?? "", attempt = z.string().regex(/^(?:first|revision-[a-z0-9-]+)$/).parse(process.argv[3])
selectPosition(ManifestSchema.parse(JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))), id)
const directory = path.join(root, "positions", id, attempt)
const report = AttemptReportSchema.parse(JSON.parse(await readFile(path.join(directory, "report.json"), "utf8")))
const bytes = await readFile(path.join(directory, report.raw.file))
const raw = JSON.parse((report.raw.file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { attempts: AuthorizationProviderAttempt[]; events?: AuthorizationLifecycleEvent[]; domain?: { sourceWorkMetrics?: unknown; checkHistory?: unknown[]; delivery?: unknown; semantic?: { units?: unknown[] } }; sourceAccounting?: unknown; sourceVerification?: unknown; native?: { references?: unknown; history?: unknown[] }; references?: unknown }
let final: unknown = report.final
try { const parsed = JSON.parse(report.final); final = parsed?.questions?.map((q: Record<string, unknown>) => ({ questionId: q.questionId, behavior: q.behavior, branches: q.branches, missing: q.missing, policyAssessment: q.policyAssessment })) ?? parsed } catch { /* Ordinary native prose is retained directly. */ }
const accounting = replayAccounting(raw.attempts, raw.events ?? [])
console.log(JSON.stringify({ positionId: id, attemptId: attempt, implementationRevision: report.implementationRevision, status: report.status, error: report.error, final, summary: accounting.summary, recoveries: accounting.recoveries, originalUnknownAttempts: accounting.originalUnknownAttempts, sourceWorkMetrics: raw.domain?.sourceWorkMetrics, checkCount: raw.domain?.checkHistory?.length, sourceAccounting: raw.sourceAccounting, sourceVerification: raw.sourceVerification, references: raw.references ?? raw.native?.references, targetExecutions: report.targetExecutions }, null, 2))
