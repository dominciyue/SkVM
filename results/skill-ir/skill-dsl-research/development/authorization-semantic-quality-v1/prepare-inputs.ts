import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AuthorizationAuthoringInputV2 } from "../../../../../src/benchmarks/authorization-dsl/authoring-v2.ts"

const root = path.resolve(import.meta.dir, "../../../../..")
const outputRoot = path.join(import.meta.dir, "inputs")
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const cases = [
  { id: "owui-file", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/public-inputs/file/assessment.json", license: "Open WebUI License", family: "Open WebUI", role: "anchor" },
  { id: "owui-text", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/public-inputs/text/assessment.json", license: "Open WebUI License", family: "Open WebUI", role: "anchor" },
  { id: "owui-header", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/public-inputs/header/assessment.json", license: "Open WebUI License", family: "Open WebUI", role: "anchor" },
  { id: "fastapi-foreign-update", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/authors/fastapi/original.json", license: "MIT", family: "FastAPI full-stack template", role: "anchor" },
  { id: "gitea-collaborator", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/authors/gitea/original.json", license: "MIT", family: "Gitea", role: "new-state" },
  { id: "gitea-assignee", input: "results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/public-inputs/gitea-issue-assignee-nonwriter/authoring.json", license: "MIT", family: "Gitea", role: "new-state" },
  { id: "gitea-lock", input: "results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/public-inputs/gitea-issue-lock-writer-nonadmin/authoring.json", license: "MIT", family: "Gitea", role: "new-state" },
  { id: "fastapi-superuser-read", input: "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/authors/fastapi/original.json", license: "MIT", family: "FastAPI full-stack template", role: "new-state" },
] as const

function fromCanonical(input: any): AuthorizationAuthoringInputV2 {
  const task = input.task
  return {
    schemaVersion: "authorization-assessment-authoring/v2",
    taskId: task.taskId, request: task.request, repository: task.repository, sourceRef: task.sourceRef,
    sourceRoot: "source", sources: input.sources.filter((source: string) => !source.endsWith("policy.json")),
    policies: Object.fromEntries(task.policySources.map((item: any) => [item.id, {
      text: item.text, location: item.location, revision: item.revision,
      acceptance: item.acceptance.status, reason: item.acceptance.reason,
    }])),
    principals: Object.fromEntries(task.principals.map((item: any) => [item.id, {
      role: item.role, facts: [item.description], capabilities: item.startingCapabilities,
    }])),
    resources: Object.fromEntries(task.resources.map((item: any) => [item.id, { type: item.type, facts: [item.description] }])),
    entries: Object.fromEntries(task.entries.map((item: any) => [item.id, { name: item.name, locations: item.locations }])),
    scenarios: Object.fromEntries(task.obligations.map((item: any) => [item.id, {
      principal: item.principalId, resource: item.resourceId, policy: item.policySourceId, entries: item.entryIds,
      relation: item.relation, operation: item.operation, expectation: item.expectation,
      ...(item.conditions.length ? { conditions: Object.fromEntries(item.conditions.map((condition: any) => [condition.name, { basis: condition.basis }])) } : {}),
    }])),
    additionalQuestions: task.requiredAnalysis,
    additionalConstraints: task.constraints,
  }
}

function superuserRead(original: AuthorizationAuthoringInputV2): AuthorizationAuthoringInputV2 {
  const input = structuredClone(original)
  input.taskId = "fastapi-items-superuser-read"
  input.request = "Determine whether an authenticated active superuser can read an item owned by another user through GET /items/{id}."
  input.principals.caller = {
    role: "authenticated active superuser",
    facts: ["Authenticated", "Active", "Superuser", "Caller id differs from item.owner_id"],
    capabilities: ["authenticated", "superuser"],
  }
  input.entries = { "read-item": { name: "read_item", locations: [{ path: "items.py", startLine: 48, endLine: 58 }] } }
  input.scenarios = { "read-item": {
    principal: "caller", resource: "item", policy: "modify-item", entries: ["read-item"],
    relation: "different-owner-and-active-superuser", operation: "read item through GET /items/{id}", expectation: "allow",
  } }
  return input
}

for (const item of cases) {
  const sourceInput = path.join(root, item.input)
  const originalBytes = await readFile(sourceInput, "utf8")
  const original = JSON.parse(originalBytes)
  const v2 = original.schemaVersion === "authorization-assessment-authoring/v2" ? original as AuthorizationAuthoringInputV2 : fromCanonical(original)
  const authoring = item.id === "fastapi-superuser-read" ? superuserRead(v2) : { ...v2, sourceRoot: "source" }
  const originalSourceRoot = path.resolve(path.dirname(sourceInput), original.sourceRoot)
  const caseDir = path.join(outputRoot, item.id)
  await mkdir(path.join(caseDir, "source"), { recursive: true })
  const sourceHashes: Record<string, string> = {}
  for (const relative of authoring.sources) {
    const sourceFile = path.resolve(originalSourceRoot, relative)
    const destination = path.join(caseDir, "source", relative)
    await mkdir(path.dirname(destination), { recursive: true })
    const bytes = await readFile(sourceFile, "utf8")
    await copyFile(sourceFile, destination)
    sourceHashes[relative] = sha256(bytes)
  }
  await writeFile(path.join(caseDir, "authoring.json"), `${JSON.stringify(authoring, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  await writeFile(path.join(caseDir, "provenance.json"), `${JSON.stringify({
    schemaVersion: "authorization-ah-input-provenance/v1", caseId: item.id, role: item.role,
    family: item.family, license: item.license, originalInput: item.input,
    originalInputSha256: sha256(originalBytes), repository: authoring.repository, sourceRef: authoring.sourceRef,
    sourceHashes, transformation: item.id === "fastapi-superuser-read"
      ? "Bounded public task.json superuser-read state over the same fixed source and policy."
      : original.schemaVersion === "authorization-assessment-authoring/v2"
      ? "Direct authoring/v2 relocation to this isolated input directory."
      : "Field-preserving conversion of the existing public bounded task to authoring/v2; policy and source behavior are not inferred.",
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
}
