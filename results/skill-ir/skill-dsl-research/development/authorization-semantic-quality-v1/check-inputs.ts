import path from "node:path"
import { checkLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"

const ids = ["owui-file", "owui-text", "owui-header", "fastapi-foreign-update", "gitea-collaborator", "gitea-assignee", "gitea-lock", "fastapi-superuser-read"]
for (const id of ids) {
  const file = path.join(import.meta.dir, "inputs", id, "authoring.json")
  const report = await checkLocalAuthorizationInput(file, "B", "plain", "v4")
  console.log(JSON.stringify({ id, status: report.status, taskId: report.taskId, diagnostics: report.diagnostics }))
  if (report.status !== "valid") process.exitCode = 1
}
