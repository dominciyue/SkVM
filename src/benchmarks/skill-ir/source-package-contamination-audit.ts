import path from "node:path"

export interface ProvenanceFileRecord {
  path: string
  sha256: string
}

export interface GeneratedTextOutput {
  path: string
  text: string
}

export interface SourcePackageContaminationAuditInput {
  taskFiles: readonly ProvenanceFileRecord[]
  skillFiles: readonly ProvenanceFileRecord[]
  outputs: readonly GeneratedTextOutput[]
  allowedOutputResourceRefs: readonly string[]
}

export type SourcePackageContaminationCode =
  | "SKILL_RESOURCE_OVERWRITES_TASK_INPUT"
  | "OUTPUT_REFERENCES_SKILL_ONLY_RESOURCE"

export interface SourcePackageContaminationAuditReport {
  schemaVersion: "skill-ir-source-package-contamination-audit/v1"
  status: "clear" | "exposure" | "risk" | "contaminated"
  counts: {
    taskFiles: number
    skillFiles: number
    skillOnlyFiles: number
    collisions: number
    outputReferences: number
    confirmedFindings: number
  }
  skillOnlyFiles: string[]
  collisions: Array<{ path: string; sameDigest: boolean }>
  outputReferences: Array<{ outputPath: string; targetPath: string; allowed: boolean }>
  confirmedFindings: Array<{ code: SourcePackageContaminationCode; path: string }>
  claimBoundary: string
}

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"))
  return normalized.startsWith("./") ? normalized.slice(2) : normalized
}

function markdownTargets(markdown: string): string[] {
  const targets: string[] = []
  let cursor = 0
  while (cursor < markdown.length) {
    const labelEnd = markdown.indexOf("](", cursor)
    if (labelEnd < 0) break
    const labelStart = markdown.lastIndexOf("[", labelEnd)
    const targetEnd = markdown.indexOf(")", labelEnd + 2)
    if (labelStart >= 0 && targetEnd >= 0) {
      const raw = markdown.slice(labelEnd + 2, targetEnd).trim()
      if (raw.length > 0) targets.push(raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw)
      cursor = targetEnd + 1
    } else {
      cursor = labelEnd + 2
    }
  }
  return targets
}

function localMarkdownTarget(outputPath: string, rawTarget: string): string | undefined {
  const target = rawTarget.trim()
  if (target.length === 0 || target.startsWith("#") || target.startsWith("/")) return undefined
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(target)) return undefined
  const withoutFragment = target.split("#", 1)[0]!.split("?", 1)[0]!
  if (withoutFragment.length === 0) return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(withoutFragment)
  } catch {
    return undefined
  }
  const resolved = normalizeRelativePath(path.posix.join(path.posix.dirname(normalizeRelativePath(outputPath)), decoded))
  if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) return undefined
  return resolved
}

export function auditSourcePackageContamination(
  input: SourcePackageContaminationAuditInput,
): SourcePackageContaminationAuditReport {
  const taskFiles = new Map(input.taskFiles.map((entry) => [normalizeRelativePath(entry.path), entry.sha256]))
  const skillFiles = new Map(input.skillFiles.map((entry) => [normalizeRelativePath(entry.path), entry.sha256]))
  const allowed = new Set(input.allowedOutputResourceRefs.map(normalizeRelativePath))

  const collisions = [...skillFiles.entries()]
    .filter(([relativePath]) => taskFiles.has(relativePath))
    .map(([relativePath, digest]) => ({ path: relativePath, sameDigest: taskFiles.get(relativePath) === digest }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const skillOnlyFiles = [...skillFiles.keys()]
    .filter((relativePath) => !taskFiles.has(relativePath))
    .sort((left, right) => left.localeCompare(right))
  const skillOnly = new Set(skillOnlyFiles)

  const outputReferences = input.outputs.flatMap((output) => markdownTargets(output.text)
    .map((target) => localMarkdownTarget(output.path, target))
    .filter((target): target is string => target !== undefined && skillOnly.has(target))
    .map((targetPath) => ({
      outputPath: normalizeRelativePath(output.path),
      targetPath,
      allowed: allowed.has(targetPath),
    })))

  const confirmedFindings: SourcePackageContaminationAuditReport["confirmedFindings"] = [
    ...collisions
      .filter((collision) => !collision.sameDigest)
      .map((collision) => ({
        code: "SKILL_RESOURCE_OVERWRITES_TASK_INPUT" as const,
        path: collision.path,
      })),
    ...outputReferences
      .filter((reference) => !reference.allowed)
      .map((reference) => ({
        code: "OUTPUT_REFERENCES_SKILL_ONLY_RESOURCE" as const,
        path: reference.targetPath,
      })),
  ]

  const status = confirmedFindings.length > 0
    ? "contaminated" as const
    : collisions.length > 0
      ? "risk" as const
      : skillOnlyFiles.length > 0
        ? "exposure" as const
        : "clear" as const

  return {
    schemaVersion: "skill-ir-source-package-contamination-audit/v1",
    status,
    counts: {
      taskFiles: taskFiles.size,
      skillFiles: skillFiles.size,
      skillOnlyFiles: skillOnlyFiles.length,
      collisions: collisions.length,
      outputReferences: outputReferences.length,
      confirmedFindings: confirmedFindings.length,
    },
    skillOnlyFiles,
    collisions,
    outputReferences,
    confirmedFindings,
    claimBoundary: "Diagnostic provenance audit only; no model quality, held-out, optimization, or token claim.",
  }
}
