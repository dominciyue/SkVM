import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { PreIrRouteDiagnosticSchema } from "./pre-ir-route-diagnostic.ts"

export const PreIrFetchActiveQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-fetch-active-runtime-qualification/v1"),
  qualificationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  lockSha256: Sha256Schema,
  runtimeCandidate: z.object({
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    executableSha256: Sha256Schema,
    startupQualificationSha256: Sha256Schema,
  }).strict(),
  diagnostic: PreIrRouteDiagnosticSchema,
  outputMaterialization: z.object({
    declared: z.number().int().nonnegative(),
    present: z.number().int().nonnegative(),
    missing: z.array(SafeRelativePathSchema),
  }).strict(),
}).strict()

export type PreIrFetchActiveQualificationReport = z.infer<
  typeof PreIrFetchActiveQualificationReportSchema
>
