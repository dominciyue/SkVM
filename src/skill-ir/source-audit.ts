import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SkillIR } from "./schema";
import type { ValidationReport } from "./validate";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/i);
const SafeAuditPathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "source-audit path must be a normalized repository-relative path");

const MarkdownAuditSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("markdown"),
  path: SafeAuditPathSchema,
  sha256: DigestSchema,
});

const JsonAuditSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("json"),
  path: SafeAuditPathSchema,
  sha256: DigestSchema,
  allowedPointers: z.array(z.string().regex(/^\//)).min(1),
});

const AuditSourceSchema = z.discriminatedUnion("kind", [
  MarkdownAuditSourceSchema,
  JsonAuditSourceSchema,
]);

const EvidenceLocatorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("line-range"),
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal("json-pointer"),
    pointer: z.string().regex(/^\//),
  }),
]);

const AuditMappingSchema = z.object({
  targetRef: z.string().min(1),
  construction: z.enum([
    "source-explicit",
    "task-contract",
    "resource-contract",
    "static-clarification",
    "schema-plumbing",
  ]),
  evidence: z.array(z.object({
    sourceId: z.string().min(1),
    locator: EvidenceLocatorSchema,
  })).min(1),
});

const ExcludedEvidenceClassSchema = z.enum([
  "evaluator-payload",
  "held-out",
  "runtime-output",
  "profile-feedback",
]);

export const SkillIRSourceAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-source-audit/v1"),
  skillId: z.string().min(1),
  sources: z.array(AuditSourceSchema).min(1),
  mappings: z.array(AuditMappingSchema).min(1),
  excludedEvidenceClasses: z.array(ExcludedEvidenceClassSchema),
});

export type SkillIRSourceAudit = z.infer<typeof SkillIRSourceAuditSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function semanticTargetRefs(ir: SkillIR): Set<string> {
  return new Set([
    "category",
    "intent",
    ...ir.inputs.map((item) => `input:${item.id}`),
    ...ir.outputs.map((item) => `output:${item.id}`),
    ...ir.preconditions.map((item) => `precondition:${item.id}`),
    ...ir.steps.map((item) => `step:${item.id}`),
    ...ir.rules.map((item) => `rule:${item.id}`),
    ...ir.tools.map((item) => `tool:${item.id}`),
    ...ir.environment.map((item) => `environment:${item.id}`),
    ...ir.checks.map((item) => `check:${item.id}`),
    ...ir.recovery.map((item) => `recovery:${item.id}`),
  ]);
}

function jsonPointerValue(document: unknown, pointer: string): unknown {
  let current = document;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function forbiddenTaskEvidence(document: unknown, pointer: string): boolean {
  if (!pointer.startsWith("/tasks/")) return false;
  const match = /^\/tasks\/(\d+)\/prompt$/.exec(pointer);
  if (!match) return true;
  const task = jsonPointerValue(document, `/tasks/${match[1]}`);
  return task === null || typeof task !== "object" || (task as { split?: unknown }).split !== "development";
}

export async function verifySkillIRSourceAudit(
  ir: SkillIR,
  candidate: SkillIRSourceAudit,
  rootDir: string,
): Promise<ValidationReport> {
  const audit = SkillIRSourceAuditSchema.parse(candidate);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (audit.skillId !== ir.id) {
    errors.push(`source-audit skill id ${audit.skillId} does not match IR ${ir.id}`);
  }
  if (ir.profile.length > 0) {
    errors.push("source-audited base IR must have an empty profile");
  }

  const requiredExclusions = new Set(ExcludedEvidenceClassSchema.options);
  for (const excluded of audit.excludedEvidenceClasses) requiredExclusions.delete(excluded);
  for (const missing of requiredExclusions) {
    errors.push(`source audit does not exclude ${missing}`);
  }

  const sourceById = new Map<string, (typeof audit.sources)[number]>();
  const sourceContent = new Map<string, { text: string; json?: unknown }>();
  for (const source of audit.sources) {
    if (sourceById.has(source.id)) {
      errors.push(`duplicate source-audit source id ${source.id}`);
      continue;
    }
    sourceById.set(source.id, source);
    try {
      const bytes = await readFile(join(rootDir, source.path));
      if (sha256(bytes) !== source.sha256) {
        errors.push(`source-audit digest mismatch for ${source.path}`);
      }
      const text = bytes.toString("utf8");
      if (source.kind === "json") {
        try {
          sourceContent.set(source.id, { text, json: JSON.parse(text) });
        } catch {
          errors.push(`source-audit JSON is invalid for ${source.path}`);
          sourceContent.set(source.id, { text });
        }
      } else {
        sourceContent.set(source.id, { text });
      }
    } catch {
      errors.push(`source-audit source is unreadable: ${source.path}`);
    }
  }

  if (ir.source.kind === "file") {
    const fileSource = ir.source;
    const sourceRecord = audit.sources.find((source) => source.path === fileSource.path);
    if (!sourceRecord || sourceRecord.sha256 !== fileSource.sha256) {
      errors.push("IR file source is not bound to the same path and digest in the source audit");
    }
  }

  const requiredTargets = semanticTargetRefs(ir);
  const seenTargets = new Set<string>();
  for (const mapping of audit.mappings) {
    if (seenTargets.has(mapping.targetRef)) {
      errors.push(`duplicate source-audit mapping for ${mapping.targetRef}`);
    }
    seenTargets.add(mapping.targetRef);
    if (!requiredTargets.has(mapping.targetRef)) {
      errors.push(`unknown source-audit target ${mapping.targetRef}`);
    }

    for (const evidence of mapping.evidence) {
      const source = sourceById.get(evidence.sourceId);
      const content = sourceContent.get(evidence.sourceId);
      if (!source || !content) {
        errors.push(`source-audit mapping ${mapping.targetRef} references missing source ${evidence.sourceId}`);
        continue;
      }
      if (evidence.locator.kind === "line-range") {
        const lineCount = content.text.split(/\r?\n/).length;
        if (source.kind !== "markdown") {
          errors.push(`line range for ${mapping.targetRef} requires a markdown source`);
        } else if (evidence.locator.start > evidence.locator.end || evidence.locator.end > lineCount) {
          errors.push(`invalid source-audit line range for ${mapping.targetRef}`);
        }
        continue;
      }

      if (source.kind !== "json" || content.json === undefined) {
        errors.push(`JSON pointer for ${mapping.targetRef} requires a JSON source`);
        continue;
      }
      if (forbiddenTaskEvidence(content.json, evidence.locator.pointer)) {
        errors.push(`forbidden task evidence for ${mapping.targetRef}: ${evidence.locator.pointer}`);
        continue;
      }
      if (!source.allowedPointers.includes(evidence.locator.pointer)) {
        errors.push(`unapproved JSON pointer for ${mapping.targetRef}: ${evidence.locator.pointer}`);
        continue;
      }
      if (jsonPointerValue(content.json, evidence.locator.pointer) === undefined) {
        errors.push(`missing JSON pointer for ${mapping.targetRef}: ${evidence.locator.pointer}`);
      }
    }
  }

  for (const target of requiredTargets) {
    if (!seenTargets.has(target)) errors.push(`missing source-audit mapping for ${target}`);
  }

  return { errors, warnings };
}
